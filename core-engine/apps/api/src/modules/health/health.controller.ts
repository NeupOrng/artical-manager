import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { DATABASE, type Database } from '@core/database';
import { REDIS } from '../../common/redis.provider';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Readiness: dependencies are reachable. Uptime Kuma watches this.
   * See infrastructure/CLAUDE.md for what must page a human.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks Postgres and Redis' })
  async ready(): Promise<{ status: string; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};

    try {
      await this.db.execute(sql`select 1`);
      checks.database = 'ok';
    } catch (error) {
      checks.database = error instanceof Error ? error.message : 'unreachable';
    }

    try {
      await this.redis.ping();
      checks.redis = 'ok';
    } catch (error) {
      checks.redis = error instanceof Error ? error.message : 'unreachable';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    if (!healthy) {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }

    return { status: 'ok', checks };
  }
}
