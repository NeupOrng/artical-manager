import { Global, Module, OnApplicationShutdown, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DATABASE = Symbol('DATABASE');
export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * The API and the worker each open their own pool. Keep the sizes independent:
 * the worker holds longer transactions during publish, and a stuck job must not
 * be able to starve the API. See docs/database-and-migrations.md.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        postgres(config.getOrThrow<string>('DATABASE_URL'), {
          max: config.get<number>('DATABASE_POOL_MAX') ?? 10,
          onnotice: () => {},
        }),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_CLIENT],
      useFactory: (client: postgres.Sql) => drizzle(client, { schema }),
    },
  ],
  exports: [DATABASE, DATABASE_CLIENT],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly client: postgres.Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
