import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@core/database';
import { validateEnv } from './config/env';
import { RedisModule } from './common/redis.provider';
import { ReadershipModule } from './common/readership.provider';
import { IdentityModule } from './common/identity.provider';
import { HealthModule } from './modules/health/health.module';
import { PublicModule } from './modules/public/public.module';
import { MediaModule } from './modules/media/media.module';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthorsModule } from './modules/authors/authors.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    RedisModule,
    ReadershipModule,
    IdentityModule,
    HealthModule,
    PublicModule,
    MediaModule,
    AuthModule,
    DashboardModule,
    ArticlesModule,
    CategoriesModule,
    AuthorsModule,
    // Still to come: TenantsModule.
    // See core-engine/CLAUDE.md.
  ],
})
export class AppModule {}
