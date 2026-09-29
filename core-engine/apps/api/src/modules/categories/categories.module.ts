import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY, DrizzleCategoryRepository } from '@core/category';
import { CategoriesController } from './categories.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * AuthModule supplies PrincipalGuard, PermissionGuard, the permission checker, and AUTHOR_REPOSITORY — bound
 * once there rather than re-declared here, so there is one provider set per
 * fact. Omitting it fails at boot, not at request time: Nest cannot resolve
 * PrincipalGuard's dependencies and the whole app crash-loops.
 */
@Module({
  imports: [AuthModule],
  controllers: [CategoriesController],
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: DrizzleCategoryRepository },
  ],
})
export class CategoriesModule {}
