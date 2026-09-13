import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@core/database';
import { validateEnv } from './config/env';
import { RedisModule } from './common/redis.provider';
import { ReadershipModule } from './common/readership.provider';
import { HealthModule } from './modules/health/health.module';
import { PublicModule } from './modules/public/public.module';
import { MediaModule } from './modules/media/media.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { CategoriesModule } from './modules/categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    RedisModule,
    ReadershipModule,
    HealthModule,
    PublicModule,
    MediaModule,
    AuthModule,
    DashboardModule,
    ArticlesModule,
    CategoriesModule,
    // Still to come: TenantsModule, AuthorsModule.
    // See core-engine/CLAUDE.md.
  ],
})
export class AppModule {}
