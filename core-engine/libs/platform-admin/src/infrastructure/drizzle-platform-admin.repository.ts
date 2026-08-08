import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  DATABASE,
  type Database,
  platformAdmins,
  type PlatformAdminRow,
} from '@core/database';
import type { PlatformAdmin } from '../domain/platform-admin';
import type { PlatformAdminRepository } from '../application/ports';

/**
 * Row → domain mapping, so Drizzle row types never reach the domain layer.
 * Explicit field-by-field rather than a spread: a column added to the table
 * should not silently become part of the domain type, and `created_at` /
 * `updated_at` are storage concerns nothing here needs.
 */
function toDomain(row: PlatformAdminRow): PlatformAdmin {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    isActive: row.isActive,
  };
}

@Injectable()
export class DrizzlePlatformAdminRepository implements PlatformAdminRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByKratosIdentityId(identityId: string): Promise<PlatformAdmin | null> {
    // No tenant filter because this table has no tenant column. Unlike the
    // equivalent method on AuthorRepository, that needs no justification here —
    // platform_admins is not tenant-owned data.
    const [row] = await this.db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.kratosIdentityId, identityId))
      .limit(1);

    // Inactive rows are returned deliberately — the guard distinguishes
    // "deactivated" from "unknown". See the port.
    return row ? toDomain(row) : null;
  }
}
