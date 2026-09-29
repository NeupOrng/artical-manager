import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNull, lt, or, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  articles,
  authors,
  media,
  type AuthorRow,
  type MediaVariant,
} from '@core/database';
import { asTenantId, type TenantId } from '@core/shared';
import type { Author, AuthorRole } from '../domain/author';
import { statusOf } from '../domain/access';
import type {
  AuthorChanges,
  AuthorRepository,
  AuthorWithUsage,
  NewAuthor,
} from '../application/ports';

/**
 * Row → domain mapping lives here so Drizzle row types never leak into the
 * domain layer. Row shapes change when the schema does; the domain owns its own.
 */
/**
 * Prefers the square `avatar` rendition and falls back to the original.
 *
 * The fallback matters: derivatives are produced by a background sweep, so a
 * freshly uploaded avatar is `pending` for a few seconds. Returning the
 * original in that window shows the right face slightly heavier, rather than
 * showing nothing.
 */
function resolveAvatarUrl(
  variants: Record<string, MediaVariant> | null,
  originalUrl: string | null,
): string | null {
  if (!originalUrl) return null;
  return variants?.avatar?.url ?? originalUrl;
}

function toDomain(
  row: AuthorRow,
  avatar: { variants: Record<string, MediaVariant>; url: string } | null,
): Author {
  return {
    avatarUrl: resolveAvatarUrl(avatar?.variants ?? null, avatar?.url ?? null),
    id: row.id,
    tenantId: asTenantId(row.tenantId),
    kratosIdentityId: row.kratosIdentityId,
    username: row.username,
    name: row.name,
    email: row.email,
    quote: row.quote,
    telegram: row.telegram,
    contactPublic: row.contactPublic,
    role: row.role as AuthorRole,
    deactivatedAt: row.deactivatedAt,
    lastSeenAt: row.lastSeenAt,
  };
}

@Injectable()
export class DrizzleAuthorRepository implements AuthorRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByUsername(
    tenantId: TenantId,
    username: string,
  ): Promise<Author | null> {
    // Username alone is NOT unique — the constraint is (tenant_id, username),
    // so two tenants may each have an `editor`. Querying by username alone
    // returns the wrong tenant's author and looks correct until it doesn't.
    const [row] = await this.db
      .select({ author: authors, avatarUrl: media.url, avatarVariants: media.variants })
      .from(authors)
      // Scoped on BOTH sides. A media row belongs to a tenant, and joining on
      // id alone would let one tenant's avatar surface under another's author
      // if an id ever leaked across. See docs/tenant-isolation.md.
      .leftJoin(
        media,
        and(eq(media.id, authors.avatarMediaId), eq(media.tenantId, tenantId)),
      )
      .where(and(eq(authors.tenantId, tenantId), eq(authors.username, username)))
      .limit(1);

    if (!row) return null;
    return toDomain(
      row.author,
      row.avatarUrl ? { url: row.avatarUrl, variants: row.avatarVariants ?? {} } : null,
    );
  }

  /**
   * Unscoped by necessity — see the port for why this is the single exception.
   *
   * The avatar join is NOT tenant-scoped here, unlike every other join in this
   * file, because there is no tenant to scope it by yet. It is instead scoped to
   * the author's OWN tenant, read off the row being joined: an avatar may only
   * ever resolve within the tenant of the author it belongs to.
   */
  async findByKratosIdentityId(identityId: string): Promise<Author | null> {
    const [row] = await this.db
      .select({ author: authors, avatarUrl: media.url, avatarVariants: media.variants })
      .from(authors)
      .leftJoin(
        media,
        and(eq(media.id, authors.avatarMediaId), eq(media.tenantId, authors.tenantId)),
      )
      .where(eq(authors.kratosIdentityId, identityId))
      .limit(1);

    if (!row) return null;
    return toDomain(
      row.author,
      row.avatarUrl ? { url: row.avatarUrl, variants: row.avatarVariants ?? {} } : null,
    );
  }

  async listForAdmin(tenantId: TenantId): Promise<AuthorWithUsage[]> {
    const rows = await this.db
      .select({
        author: authors,
        avatarUrl: media.url,
        avatarVariants: media.variants,
        // Counted across this tenant's articles only — the join carries the
        // tenant predicate, so another site's output can never be attributed
        // here even if an author id leaked.
        publishedCount: sql<number>`count(*) filter (where ${articles.status} = 'published')::int`,
        draftCount: sql<number>`count(*) filter (where ${articles.status} = 'draft')::int`,
      })
      .from(authors)
      .leftJoin(
        media,
        and(eq(media.id, authors.avatarMediaId), eq(media.tenantId, tenantId)),
      )
      .leftJoin(
        articles,
        and(eq(articles.authorId, authors.id), eq(articles.tenantId, tenantId)),
      )
      .where(eq(authors.tenantId, tenantId))
      .groupBy(authors.id, media.url, media.variants)
      .orderBy(authors.name);

    return rows.map((row) => {
      const author = toDomain(
        row.author,
        row.avatarUrl ? { url: row.avatarUrl, variants: row.avatarVariants ?? {} } : null,
      );
      return {
        ...author,
        status: statusOf(author),
        publishedCount: Number(row.publishedCount),
        draftCount: Number(row.draftCount),
      };
    });
  }

  async create(tenantId: TenantId, author: NewAuthor): Promise<void> {
    await this.db.insert(authors).values({
      id: author.id,
      tenantId,
      kratosIdentityId: author.kratosIdentityId,
      username: author.username,
      name: author.name,
      email: author.email,
      role: author.role,
    });
  }

  async update(
    tenantId: TenantId,
    authorId: string,
    changes: AuthorChanges,
  ): Promise<void> {
    await this.db
      .update(authors)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(authors.tenantId, tenantId), eq(authors.id, authorId)));
  }

  async setDeactivated(
    tenantId: TenantId,
    authorId: string,
    at: Date | null,
  ): Promise<void> {
    await this.db
      .update(authors)
      .set({ deactivatedAt: at, updatedAt: new Date() })
      .where(and(eq(authors.tenantId, tenantId), eq(authors.id, authorId)));
  }

  async countActiveAdmins(tenantId: TenantId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(authors)
      .where(
        and(
          eq(authors.tenantId, tenantId),
          eq(authors.role, 'admin'),
          isNull(authors.deactivatedAt),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async existsWithUsername(tenantId: TenantId, username: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: authors.id })
      .from(authors)
      .where(and(eq(authors.tenantId, tenantId), eq(authors.username, username)))
      .limit(1);
    return Boolean(row);
  }

  async touchLastSeen(
    tenantId: TenantId,
    authorId: string,
    staleBefore: Date,
  ): Promise<void> {
    // The staleness test is part of the UPDATE rather than a read followed by a
    // write: two concurrent requests would otherwise both decide to write.
    await this.db
      .update(authors)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(authors.tenantId, tenantId),
          eq(authors.id, authorId),
          or(isNull(authors.lastSeenAt), lt(authors.lastSeenAt, staleBefore)),
        ),
      );
  }

  async findById(tenantId: TenantId, authorId: string): Promise<Author | null> {
    const [row] = await this.db
      .select({ author: authors, avatarUrl: media.url, avatarVariants: media.variants })
      .from(authors)
      .leftJoin(
        media,
        and(eq(media.id, authors.avatarMediaId), eq(media.tenantId, tenantId)),
      )
      .where(and(eq(authors.tenantId, tenantId), eq(authors.id, authorId)))
      .limit(1);

    if (!row) return null;
    return toDomain(
      row.author,
      row.avatarUrl ? { url: row.avatarUrl, variants: row.avatarVariants ?? {} } : null,
    );
  }
}
