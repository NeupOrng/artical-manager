import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = Symbol('REDIS');

/**
 * Redis is NOT used for application work. There is no message queue — background
 * work is polled from Postgres (docs/background-work.md), so the database is the
 * only source of truth.
 *
 * It stays in the stack for Kong's ACME certificate storage in DB-less mode, and
 * this connection exists so /health/ready can report on it. Reach for it for
 * caching if that ever becomes necessary; do not reintroduce a queue on it
 * without a real reason.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: null,
          lazyConnect: false,
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
