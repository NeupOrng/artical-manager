import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MediaId, TenantId } from '@core/shared';
import {
  IMAGE_PROCESSOR,
  MEDIA_REPOSITORY,
  OBJECT_STORAGE,
  type ImageProcessor,
  type MediaRepository,
  type ObjectStorage,
} from './ports';
import { VARIANT_SPECS, buildVariantKey, type MediaVariant } from '../domain/media';

/**
 * Generates the derived renditions for an already-uploaded image.
 *
 * Runs in the worker, not the API: uploads go browser -> MinIO directly, so the
 * API never holds the bytes. Nothing waits on this — `url` already points at a
 * usable original, so an article can publish and share correctly while
 * processing is still pending.
 *
 * Idempotent by construction: re-running overwrites the same variant keys and
 * rewrites the same row, so a reclaimed or repeated sweep is safe.
 */
@Injectable()
export class ProcessMediaUseCase {
  private readonly logger = new Logger(ProcessMediaUseCase.name);

  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly repo: MediaRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(IMAGE_PROCESSOR) private readonly processor: ImageProcessor,
  ) {}

  async execute(tenantId: TenantId, mediaId: MediaId): Promise<void> {
    const item = await this.repo.findById(tenantId, mediaId);
    if (!item) return; // deleted between enqueue and execution — not an error
    if (item.status === 'ready') return; // already done — redelivery

    try {
      const original = await this.storage.get(item.objectKey);
      const meta = await this.processor.inspect(original);

      const variants: Record<string, MediaVariant> = {};

      for (const spec of VARIANT_SPECS) {
        const out = await this.processor.resize(original, spec.width, spec.height, spec.quality);
        const key = buildVariantKey(item.objectKey, spec.name);

        await this.storage.put(key, out.buffer, 'image/webp');

        variants[spec.name] = {
          objectKey: key,
          url: this.storage.publicUrl(key),
          width: out.width,
          height: out.height,
          size: out.size,
        };
      }

      await this.repo.markReady(tenantId, mediaId, variants, {
        width: meta.width,
        height: meta.height,
      });

      this.logger.log(`processed ${mediaId} (${VARIANT_SPECS.length} variants)`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      // The original stays usable, so this degrades quality rather than
      // breaking the article. Surfaced for an operator, not retried forever.
      await this.repo.markFailed(tenantId, mediaId, reason);
      this.logger.error(`processing failed for ${mediaId}: ${reason}`);
      throw error;
    }
  }
}
