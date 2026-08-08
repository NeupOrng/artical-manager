import type { MediaId, TenantId } from '@core/shared';

export type MediaStatus = 'pending' | 'processing' | 'ready' | 'failed';

/**
 * Server-side allowlist. The client's declared contentType is a hint, never
 * trusted — the worker re-reads the real format from the stored bytes and
 * fails the row if it disagrees.
 */
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export const isAllowedContentType = (value: string): value is AllowedContentType =>
  (ALLOWED_CONTENT_TYPES as readonly string[]).includes(value);

/**
 * Enforced in the presigned policy, not only in the DTO. The browser PUTs
 * straight to MinIO, so the API never sees an oversized body and cannot
 * reject it after the fact.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const EXTENSION_BY_TYPE: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Derived renditions.
 *
 * `og` exists because cover_image feeds og:image and social cards want roughly
 * 1200x630 — an unprocessed phone photo is several MB, which crawlers fetch
 * slowly and sometimes reject outright.
 *
 * All variants are WebP: broad support now, and materially smaller than JPEG
 * at equivalent quality, which matters because images are the bulk of egress
 * from a single VPS.
 */
export interface VariantSpec {
  name: string;
  width: number;
  height: number;
  quality: number;
}

export const VARIANT_SPECS: readonly VariantSpec[] = [
  { name: 'og', width: 1200, height: 630, quality: 82 },
  { name: 'card', width: 800, height: 450, quality: 80 },
  { name: 'thumb', width: 400, height: 225, quality: 75 },
  // Square, for author avatars. The specs above are all ~1.9:1 for social
  // cards, and a face cropped to 400x225 is a chin and a forehead.
  //
  // Generated for every image, not just avatars — including article covers,
  // where it is meaningless but costs ~3 KB. A `purpose` column on media would
  // avoid that, and is not worth a schema concept to save kilobytes.
  //
  // 256px covers the largest on-site use (56px at 2x DPR) with room spare.
  { name: 'avatar', width: 256, height: 256, quality: 82 },
] as const;

export interface MediaVariant {
  objectKey: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

export interface Media {
  readonly id: MediaId;
  readonly tenantId: TenantId;
  readonly url: string;
  readonly objectKey: string;
  readonly type: string;
  readonly size: number;
  readonly originalFilename: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly status: MediaStatus;
  readonly variants: Record<string, MediaVariant>;
}

/**
 * Tenant-prefixed so a bucket policy could scope by prefix if that is ever
 * wanted. It is a convenience, NOT access control — isolation is the
 * tenant_id predicate on every query. See docs/tenant-isolation.md.
 */
export function buildObjectKey(
  tenantId: TenantId,
  mediaId: MediaId,
  contentType: AllowedContentType,
  now: Date,
): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${tenantId}/${year}/${month}/${mediaId}.${EXTENSION_BY_TYPE[contentType]}`;
}

export function buildVariantKey(objectKey: string, variantName: string): string {
  const base = objectKey.replace(/\.[^./]+$/, '');
  return `${base}-${variantName}.webp`;
}

/**
 * The best available rendition for a given purpose, falling back to the
 * original. Callers never need to know whether processing has finished.
 */
export function pickVariantUrl(media: Media, variantName: string): string {
  return media.variants[variantName]?.url ?? media.url;
}
