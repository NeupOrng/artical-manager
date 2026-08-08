import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@core/database';
import {
  IMAGE_PROCESSOR,
  MEDIA_REPOSITORY,
  OBJECT_STORAGE,
  DrizzleMediaRepository,
  S3ObjectStorage,
  SharpImageProcessor,
  ProcessMediaUseCase,
} from '@core/media';
import { validateEnv } from './config/env';
import { MediaSweeper } from './processors/media-sweeper.service';

/**
 * The worker holds no queue client and no Redis connection.
 *
 * Its only job is sweeping Postgres for pending image processing. Publishing is
 * immediate and happens in the API, so there is nothing here to schedule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    DatabaseModule,
  ],
  providers: [
    MediaSweeper,
    ProcessMediaUseCase,
    { provide: MEDIA_REPOSITORY, useClass: DrizzleMediaRepository },
    { provide: OBJECT_STORAGE, useClass: S3ObjectStorage },
    { provide: IMAGE_PROCESSOR, useClass: SharpImageProcessor },
  ],
})
export class WorkerModule {}
