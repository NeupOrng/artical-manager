import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  // Standalone: the worker has no HTTP surface and no identity of its own.
  // tenantId always comes from the job payload. See core-engine/CLAUDE.md.
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });

  // An application context never calls listen(), so buffered logs are otherwise
  // discarded and the worker starts up completely silently.
  app.flushLogs();
  app.enableShutdownHooks();

  // No boot reconciler needed. There is no queue to fall out of sync with the
  // database — pending work is simply a row with status = 'pending', and the
  // sweep reclaims anything a previous process died holding.

  new Logger('bootstrap').log('worker started');
}

void bootstrap();
