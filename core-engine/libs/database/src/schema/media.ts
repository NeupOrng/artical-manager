import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * `pending`     object confirmed present, waiting to be picked up
 * `processing`  claimed by a worker sweep — prevents double work
 * `ready`       derivatives available in `variants`
 * `failed`      processing failed; the ORIGINAL is still usable
 *
 * Nothing blocks on `ready`. `url` points at the original and is valid the
 * moment the row exists, so an article can publish immediately and its
 * og:image resolves — derivatives only improve it. See media-and-uploads.md.
 *
 * `processing` exists because this table IS the work queue. Claiming is an
 * atomic UPDATE with FOR UPDATE SKIP LOCKED, so two workers never take the
 * same row, and a crashed worker's rows are reclaimed on a timeout rather
 * than stranded.
 */
export const mediaStatus = pgEnum('media_status', [
  'pending',
  'processing',
  'ready',
  'failed',
]);

export type MediaStatus = (typeof mediaStatus.enumValues)[number];

/** Shape stored in `variants`. Keys are variant names: og, card, thumb. */
export interface MediaVariant {
  objectKey: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

/**
 * A Media row is created only AFTER the object is confirmed present in MinIO —
 * see docs/media-and-uploads.md. Creating it at presign time leaves rows
 * pointing at nothing when an upload is abandoned, which breaks og:image on a
 * live article.
 */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /** Absolute, publicly readable, no expiry — og:image depends on all three. */
    url: text('url').notNull(),
    /** Object key: {tenantId}/{yyyy}/{mm}/{mediaId}.{ext} */
    objectKey: text('object_key').notNull(),
    /** MIME type, re-verified from the stored object on confirm. */
    type: varchar('type', { length: 100 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),

    /** Original filename, for the media library UI only. Never used in a key. */
    originalFilename: varchar('original_filename', { length: 255 }),

    /** Intrinsic dimensions of the original, read from the object on confirm. */
    width: integer('width'),
    height: integer('height'),

    status: mediaStatus('status').notNull().default('pending'),
    /** Derived renditions, keyed by variant name. Empty until status = ready. */
    variants: jsonb('variants').$type<Record<string, MediaVariant>>().notNull().default({}),
    processingError: text('processing_error'),

    /** Soft delete — objects outlive rows; a reaper job handles orphans. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('media_tenant_created_idx').on(t.tenantId, t.createdAt.desc()),
    // The key prefix is an operational convenience, NOT access control.
    // Isolation is the tenant_id predicate on every query.
    index('media_tenant_object_key_idx').on(t.tenantId, t.objectKey),
    // The worker's retry sweep looks for stuck rows.
    index('media_tenant_status_idx').on(t.tenantId, t.status),
  ],
);

export type MediaRow = typeof media.$inferSelect;
export type NewMediaRow = typeof media.$inferInsert;
