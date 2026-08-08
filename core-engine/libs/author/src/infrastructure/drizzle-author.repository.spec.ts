import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { asTenantId } from '@core/shared';
import * as schema from '@core/database';
import { DrizzleAuthorRepository } from './drizzle-author.repository';

/**
 * Tenant isolation test. Required for every repository method — this is the one
 * place where missing coverage is a defect rather than a judgment call.
 *
 * Runs against the seeded local database. Run `task db:seed` first.
 */
const TECH = asTenantId('0198f000-0000-7000-8000-000000000001');
const GAMING = asTenantId('0198f000-0000-7000-8000-000000000002');

const url =
  process.env.DATABASE_URL ??
  'postgres://artical:change-me-locally@localhost:5432/artical';

let client: postgres.Sql;
let repo: DrizzleAuthorRepository;

beforeAll(() => {
  client = postgres(url, { max: 2, onnotice: () => {} });
  repo = new DrizzleAuthorRepository(drizzle(client, { schema }));
});

afterAll(async () => {
  await client.end();
});

describe('DrizzleAuthorRepository — tenant isolation', () => {
  it("findByUsername returns only the calling tenant's author", async () => {
    const mara = await repo.findByUsername(TECH, 'mara-okonkwo');
    const devin = await repo.findByUsername(GAMING, 'devin-hartley');

    expect(mara?.name).toBe('Mara Okonkwo');
    expect(devin?.name).toBe('Devin Hartley');
    expect(mara?.tenantId).toBe(TECH);
    expect(devin?.tenantId).toBe(GAMING);
  });

  it('does not return an author that belongs to another tenant', async () => {
    // The gaming tenant's author, requested as the technology tenant. A lookup
    // by username alone would find the row and appear to work indefinitely —
    // the constraint is (tenant_id, username), not (username).
    const leaked = await repo.findByUsername(TECH, 'devin-hartley');
    expect(leaked).toBeNull();

    const alsoLeaked = await repo.findByUsername(GAMING, 'mara-okonkwo');
    expect(alsoLeaked).toBeNull();
  });

  it('does not return an author by id across tenants', async () => {
    const devin = await repo.findByUsername(GAMING, 'devin-hartley');
    expect(devin).not.toBeNull();

    // Correct id, wrong tenant. Must be null, not the row.
    const crossTenant = await repo.findById(TECH, devin!.id);
    expect(crossTenant).toBeNull();

    const sameTenant = await repo.findById(GAMING, devin!.id);
    expect(sameTenant?.id).toBe(devin!.id);
  });

  it('carries the profile fields the public surface depends on', async () => {
    const mara = await repo.findByUsername(TECH, 'mara-okonkwo');

    expect(mara?.quote).toBeTruthy();
    expect(mara?.email).toBeTruthy();
    expect(mara?.telegram).toBeTruthy();
    // The seed opts in so the local site can render contact details; the
    // column default is false.
    expect(mara?.contactPublic).toBe(true);
  });
});
