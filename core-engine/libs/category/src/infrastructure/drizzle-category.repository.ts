import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  articles,
  categories,
  categorySlugRedirects,
  type CategoryRow,
} from '@core/database';
import {
  asCategoryId,
  asTenantId,
  newId,
  type CategoryId,
  type TenantId,
} from '@core/shared';
import type { Category } from '../domain/category';
import type {
  CategoryRepository,
  CategoryWithUsage,
  SlugResolution,
} from '../application/ports';

function toDomain(row: CategoryRow): Category {
  return {
    id: asCategoryId(row.id),
    tenantId: asTenantId(row.tenantId),
    name: row.name,
    slug: row.slug,
    description: row.description,
    position: row.position,
    deletedAt: row.deletedAt,
  };
}

@Injectable()
export class DrizzleCategoryRepository implements CategoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(tenantId: TenantId): Promise<CategoryWithUsage[]> {
    return this.listRows(tenantId, false);
  }

  listForAdmin(
    tenantId: TenantId,
    options: { includeRetired: boolean },
  ): Promise<CategoryWithUsage[]> {
    return this.listRows(tenantId, options.includeRetired);
  }

  private async listRows(
    tenantId: TenantId,
    includeRetired: boolean,
  ): Promise<CategoryWithUsage[]> {
    const scope = includeRetired
      ? eq(categories.tenantId, tenantId)
      : and(eq(categories.tenantId, tenantId), isNull(categories.deletedAt));

    const rows = await this.db
      .select({
        category: categories,
        // Counted across ALL statuses on purpose: an editor deciding whether to
        // retire a section needs to know about drafts filed under it too, not
        // only what readers can currently see.
        articleCount: sql<number>`count(${articles.id})::int`,
      })
      .from(categories)
      .leftJoin(
        articles,
        and(eq(articles.categoryId, categories.id), eq(articles.tenantId, tenantId)),
      )
      .where(scope)
      .groupBy(categories.id)
      // Live before retired, then nav order; name breaks any tie.
      .orderBy(
        sql`${categories.deletedAt} is not null`,
        asc(categories.position),
        asc(categories.name),
      );

    return rows.map(r => ({ ...toDomain(r.category), articleCount: r.articleCount }));
  }

  async findById(tenantId: TenantId, id: CategoryId): Promise<Category | null> {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.tenantId, tenantId),
          eq(categories.id, id),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findByIdIncludingRetired(
    tenantId: TenantId,
    id: CategoryId,
  ): Promise<Category | null> {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)))
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async findBySlug(tenantId: TenantId, slug: string): Promise<Category | null> {
    // Slug alone is NOT unique — the index is (tenant_id, slug) on live rows,
    // so both tenants may own a `reviews`. Querying by slug alone returns the
    // wrong tenant's row and looks correct until it doesn't.
    const [row] = await this.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.tenantId, tenantId),
          eq(categories.slug, slug),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async nextPosition(tenantId: TenantId): Promise<number> {
    const [row] = await this.db
      .select({ next: sql<number>`coalesce(max(${categories.position}), -1) + 1` })
      .from(categories)
      .where(and(eq(categories.tenantId, tenantId), isNull(categories.deletedAt)));

    return Number(row?.next ?? 0);
  }

  async create(tenantId: TenantId, category: Category): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(categories).values({
        id: category.id,
        tenantId,
        name: category.name,
        slug: category.slug,
        description: category.description,
        position: category.position,
      });

      // A live category always beats a redirect for the same slug. Resolution
      // checks live first anyway; removing the row keeps the table honest.
      await tx
        .delete(categorySlugRedirects)
        .where(
          and(
            eq(categorySlugRedirects.tenantId, tenantId),
            eq(categorySlugRedirects.oldSlug, category.slug),
          ),
        );
    });
  }

  async update(
    tenantId: TenantId,
    category: Category,
    options: { previousSlug?: string } = {},
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(categories)
        .set({
          name: category.name,
          slug: category.slug,
          description: category.description,
          position: category.position,
          updatedAt: new Date(),
        })
        .where(and(eq(categories.tenantId, tenantId), eq(categories.id, category.id)));

      const { previousSlug } = options;
      if (!previousSlug || previousSlug === category.slug) return;

      // The old slug now redirects here. Upsert rather than insert: renaming
      // a → b → a → b must not fail on the second a → b.
      await tx
        .insert(categorySlugRedirects)
        .values({
          // A bookkeeping row internal to this table, so its id is minted here.
          id: newId<string>(),
          tenantId,
          oldSlug: previousSlug,
          categoryId: category.id,
        })
        .onConflictDoUpdate({
          target: [categorySlugRedirects.tenantId, categorySlugRedirects.oldSlug],
          set: { categoryId: category.id, updatedAt: new Date() },
        });

      // And the slug this category just claimed must stop redirecting anywhere.
      await tx
        .delete(categorySlugRedirects)
        .where(
          and(
            eq(categorySlugRedirects.tenantId, tenantId),
            eq(categorySlugRedirects.oldSlug, category.slug),
          ),
        );
    });
  }

  async softDelete(tenantId: TenantId, id: CategoryId): Promise<void> {
    // Articles keep their category_id — nulling it would silently rewrite
    // articles that are already published. The admin keeps showing the label;
    // the public surface stops linking to a section that no longer exists.
    await this.db
      .update(categories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)));
  }

  async restore(tenantId: TenantId, id: CategoryId, position: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(categories)
        .set({ deletedAt: null, position, updatedAt: new Date() })
        .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)))
        .returning({ slug: categories.slug });

      if (!row) return;

      await tx
        .delete(categorySlugRedirects)
        .where(
          and(
            eq(categorySlugRedirects.tenantId, tenantId),
            eq(categorySlugRedirects.oldSlug, row.slug),
          ),
        );
    });
  }

  async setPositions(
    tenantId: TenantId,
    order: { id: CategoryId; position: number }[],
  ): Promise<void> {
    // One transaction, so a failure part-way cannot leave the nav half
    // reordered with two sections sharing a position.
    await this.db.transaction(async (tx) => {
      for (const { id, position } of order) {
        await tx
          .update(categories)
          .set({ position, updatedAt: new Date() })
          .where(and(eq(categories.tenantId, tenantId), eq(categories.id, id)));
      }
    });
  }

  async resolveSlug(tenantId: TenantId, slug: string): Promise<SlugResolution | null> {
    const live = await this.findBySlug(tenantId, slug);
    if (live) return { kind: 'category', category: live };

    // Scoped on BOTH tables. The redirect's category_id FK carries no tenant
    // predicate, so joining on id alone would be one leaked id away from
    // redirecting a reader into another tenant's section.
    const [row] = await this.db
      .select({ slug: categories.slug })
      .from(categorySlugRedirects)
      .innerJoin(
        categories,
        and(
          eq(categories.id, categorySlugRedirects.categoryId),
          eq(categories.tenantId, tenantId),
          // A redirect to a retired section is no redirect at all.
          isNull(categories.deletedAt),
        ),
      )
      .where(
        and(
          eq(categorySlugRedirects.tenantId, tenantId),
          eq(categorySlugRedirects.oldSlug, slug),
        ),
      )
      .limit(1);

    return row ? { kind: 'redirect', slug: row.slug } : null;
  }
}
