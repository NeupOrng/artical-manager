import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Integration tests — SEPARATE from the unit suite on purpose.
 *
 * These need a running stack (`task dev`) and a seeded database, so folding
 * them into `task check` would make the default check fail on a laptop with
 * Docker closed, and people would learn to ignore it.
 *
 * Run with `task test:integration`.
 *
 * The split is by config, not by a skipped-when-offline guard inside the tests:
 * a suite that silently passes when the stack is down is worse than one that is
 * not run at all, because it reports success.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.int.spec.ts'],
    // Sequential. These share one database and one set of seeded fixtures, and
    // a write test racing a read test produces failures that look like bugs in
    // the code under test.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@core/shared': resolve(__dirname, 'libs/shared/src'),
      '@core/database': resolve(__dirname, 'libs/database/src'),
      '@core/media': resolve(__dirname, 'libs/media/src'),
      '@core/tenant': resolve(__dirname, 'libs/tenant/src'),
      '@core/article': resolve(__dirname, 'libs/article/src'),
      '@core/author': resolve(__dirname, 'libs/author/src'),
      '@core/platform-admin': resolve(__dirname, 'libs/platform-admin/src'),
    },
  },
});
