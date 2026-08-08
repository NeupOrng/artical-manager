import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ProcessMediaUseCase, MEDIA_REPOSITORY, type MediaRepository } from '@core/media';
import { Inject } from '@nestjs/common';

/**
 * Image processing, without a queue.
 *
 * The `media` table IS the work queue: rows land as `pending` when an upload is
 * confirmed, this sweep claims them atomically (UPDATE ... FOR UPDATE SKIP
 * LOCKED) and processes them.
 *
 * Postgres is therefore the only source of truth — there is no Redis timer to
 * fall out of sync with it, and no boot reconciler needed, because a row that
 * was never picked up is simply still `pending`.
 *
 * Nothing blocks on this. `url` already points at a usable original, so an
 * article can publish and share correctly while derivatives are pending.
 */
const SWEEP_INTERVAL_MS = 15_000;
const BATCH_SIZE = 5;
/** A row held this long means the worker died mid-process. */
const STUCK_AFTER_MS = 10 * 60_000;

@Injectable()
export class MediaSweeper implements OnApplicationBootstrap {
  private readonly logger = new Logger(MediaSweeper.name);
  /** Guards against a slow batch overlapping the next tick. */
  private running = false;

  constructor(
    @Inject(MEDIA_REPOSITORY) private readonly repo: MediaRepository,
    private readonly processMedia: ProcessMediaUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Reclaim anything a previous process died holding, then start clean.
    const reclaimed = await this.repo.reclaimStuck(STUCK_AFTER_MS);
    if (reclaimed > 0) {
      this.logger.warn(`reclaimed ${reclaimed} media row(s) stuck in processing`);
    }
    await this.sweep();
  }

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const claimed = await this.repo.claimPending(BATCH_SIZE);
      if (claimed.length === 0) return;

      this.logger.log(`processing ${claimed.length} media item(s)`);

      for (const { tenantId, mediaId } of claimed) {
        try {
          await this.processMedia.execute(tenantId, mediaId);
        } catch {
          // The use case already marked the row `failed` with a reason, and the
          // original stays usable. One bad image must not stop the batch.
        }
      }
    } catch (error) {
      this.logger.error(
        `sweep failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    } finally {
      this.running = false;
    }
  }
}

