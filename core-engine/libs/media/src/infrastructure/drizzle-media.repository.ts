import { Inject, Injectable } from '@nestjs/common';
import { and, eq, desc, isNull, lt, sql } from 'drizzle-orm';
import { DATABASE, type Database, media as mediaTable } from '@core/database';
import { asMediaId, asTenantId, type MediaId, type TenantId } from '@core/shared';
import type { Media, MediaStatus } from '../domain/media';
import type { MediaRepository } from '../application/ports';

@Injectable()
export class DrizzleMediaRepository implements MediaRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(tenantId: TenantId, item: Media): Promise<void> {
    await this.db.insert(mediaTable).values({
      id: item.id,
      tenantId,
      url: item.url,
      objectKey: item.objectKey,
      type: item.type,
      size: item.size,
      originalFilename: item.originalFilename,
      width: item.width,
      height: item.height,
      status: item.status,
      variants: item.variants,
    });
  }

  async findById(tenantId: TenantId, mediaId: MediaId): Promise<Media | null> {
    const [row] = await this.db
      .select()
      .from(mediaTable)
      .where(
        and(
          eq(mediaTable.tenantId, tenantId),
          eq(mediaTable.id, mediaId),
          isNull(mediaTable.deletedAt),
        ),
      )
      .limit(1);

    return row ? toDomain(row) : null;
  }

  async list(
    tenantId: TenantId,
    limit: number,
    offset: number,
  ): Promise<{ data: Media[]; total: number }> {
    const where = and(eq(mediaTable.tenantId, tenantId), isNull(mediaTable.deletedAt));

    const rows = await this.db
      .select()
      .from(mediaTable)
      .where(where)
      .orderBy(desc(mediaTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [count] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(mediaTable)
      .where(where);

    return { data: rows.map(toDomain), total: count?.total ?? 0 };
  }

  async markReady(
    tenantId: TenantId,
    mediaId: MediaId,
    variants: Media['variants'],
    dimensions: { width: number; height: number },
  ): Promise<void> {
    await this.db
      .update(mediaTable)
      .set({
        status: 'ready',
        variants,
        width: dimensions.width,
        height: dimensions.height,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(mediaTable.tenantId, tenantId), eq(mediaTable.id, mediaId)));
  }

  async markFailed(tenantId: TenantId, mediaId: MediaId, reason: string): Promise<void> {
    await this.db
      .update(mediaTable)
      .set({ status: 'failed', processingError: reason, updatedAt: new Date() })
      .where(and(eq(mediaTable.tenantId, tenantId), eq(mediaTable.id, mediaId)));
  }

  async claimPending(
    limit: number,
  ): Promise<{ tenantId: TenantId; mediaId: MediaId }[]> {
    // One short transaction: the UPDATE claims the rows and returns them.
    // Processing happens afterwards, outside any transaction — holding one
    // open for seconds of image work would pin a connection and block vacuum.
    const rows = await this.db.execute<{ id: string; tenant_id: string }>(sql`
      UPDATE ${mediaTable}
      SET status = 'processing', updated_at = now()
      WHERE id IN (
        SELECT id FROM ${mediaTable}
        WHERE status = 'pending' AND deleted_at IS NULL
        ORDER BY created_at
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id
    `);

    return Array.from(rows).map((r) => ({
      tenantId: asTenantId(r.tenant_id),
      mediaId: asMediaId(r.id),
    }));
  }

  async reclaimStuck(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);

    const rows = await this.db
      .update(mediaTable)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(and(eq(mediaTable.status, 'processing'), lt(mediaTable.updatedAt, cutoff)))
      .returning({ id: mediaTable.id });

    return rows.length;
  }

  async softDelete(tenantId: TenantId, mediaId: MediaId): Promise<void> {
    // Soft delete only. Articles may still reference the URL, ISR pages may be
    // serving it, and Facebook may have it cached — a reaper job handles
    // orphaned objects deliberately. See docs/media-and-uploads.md.
    await this.db
      .update(mediaTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(mediaTable.tenantId, tenantId), eq(mediaTable.id, mediaId)));
  }

  async countForTenant(tenantId: TenantId): Promise<number> {
    // Same predicate as list(): tenant AND not soft-deleted. If these ever
    // disagree, the dashboard tile and the library page show different numbers
    // for the same thing, which reads as a bug in whichever the user looked at
    // second.
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(mediaTable)
      .where(and(eq(mediaTable.tenantId, tenantId), isNull(mediaTable.deletedAt)));

    return row?.total ?? 0;
  }
}

function toDomain(row: typeof mediaTable.$inferSelect): Media {
  return {
    id: asMediaId(row.id),
    tenantId: asTenantId(row.tenantId),
    url: row.url,
    objectKey: row.objectKey,
    type: row.type,
    size: row.size,
    originalFilename: row.originalFilename,
    width: row.width,
    height: row.height,
    status: row.status as MediaStatus,
    variants: row.variants,
  };
}
