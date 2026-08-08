import type { MediaId, TenantId } from '@core/shared';
import type { Media, AllowedContentType } from '../domain/media';

export const MEDIA_REPOSITORY = Symbol('MEDIA_REPOSITORY');
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
export const IMAGE_PROCESSOR = Symbol('IMAGE_PROCESSOR');

/** tenantId first and required on every method — docs/tenant-isolation.md. */
export interface MediaRepository {
  create(tenantId: TenantId, media: Media): Promise<void>;
  findById(tenantId: TenantId, mediaId: MediaId): Promise<Media | null>;
  list(tenantId: TenantId, limit: number, offset: number): Promise<{ data: Media[]; total: number }>;
  markReady(
    tenantId: TenantId,
    mediaId: MediaId,
    variants: Media['variants'],
    dimensions: { width: number; height: number },
  ): Promise<void>;
  markFailed(tenantId: TenantId, mediaId: MediaId, reason: string): Promise<void>;

  /**
   * Atomically move up to `limit` rows from `pending` to `processing` and
   * return them. This is what makes the table usable as a work queue: the
   * claim uses FOR UPDATE SKIP LOCKED, so two workers never take the same row.
   *
   * NOT tenant-scoped — the sweeper serves every tenant and has no tenant
   * context of its own. tenantId comes back with each row and is passed to
   * every subsequent call, exactly as a job payload would.
   */
  claimPending(limit: number): Promise<{ tenantId: TenantId; mediaId: MediaId }[]>;

  /**
   * Return rows stuck in `processing` past `olderThanMs` to `pending`. Covers
   * a worker that died mid-process; without it those rows are stranded
   * forever and nobody notices, because the original still renders.
   */
  reclaimStuck(olderThanMs: number): Promise<number>;
  softDelete(tenantId: TenantId, mediaId: MediaId): Promise<void>;

  /**
   * How many live media rows this tenant has, for the dashboard tile.
   *
   * Excludes soft-deleted rows — a library count that includes things the author
   * already deleted reads as a bug, not as a nuance.
   */
  countForTenant(tenantId: TenantId): Promise<number>;
}

export interface PresignedUpload {
  uploadUrl: string;
  /** Stable, public, no expiry — this is what og:image will point at. */
  publicUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

export interface ObjectStorage {
  /**
   * The size cap is NOT enforced here. Binding ContentLength into the
   * signature forces the browser to send a byte-exact length, which is
   * brittle in practice — so the real check is on confirm, against the
   * object's actual stored size.
   */
  presignUpload(
    objectKey: string,
    contentType: AllowedContentType,
  ): Promise<PresignedUpload>;

  /** Returns null when absent — confirm uses this to reject abandoned uploads. */
  head(objectKey: string): Promise<{ size: number; contentType: string } | null>;

  get(objectKey: string): Promise<Buffer>;
  put(objectKey: string, body: Buffer, contentType: string): Promise<void>;
  remove(objectKey: string): Promise<void>;
  publicUrl(objectKey: string): string;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
}

export interface ImageProcessor {
  /** Reads real dimensions and format from the bytes, not from a declared header. */
  inspect(input: Buffer): Promise<{ width: number; height: number; format: string }>;
  resize(input: Buffer, width: number, height: number, quality: number): Promise<ProcessedImage>;
}
