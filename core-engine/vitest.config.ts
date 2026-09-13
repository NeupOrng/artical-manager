import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Vitest does not read `paths` from tsconfig.json, so the @core/* aliases are
 * mirrored here. Add a new lib to both places or its tests won't resolve.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.spec.ts'],
    // Integration tests are excluded here and run from
    // vitest.integration.config.ts — they need a live stack, and `task check`
    // must stay runnable with Docker closed.
    exclude: ['**/node_modules/**', '**/dist/**', 'test/integration/**'],
  },
  resolve: {
    alias: {
      '@core/shared': resolve(__dirname, 'libs/shared/src'),
      '@core/category': resolve(__dirname, 'libs/category/src'),
      '@core/database': resolve(__dirname, 'libs/database/src'),
      '@core/media': resolve(__dirname, 'libs/media/src'),
      '@core/tenant': resolve(__dirname, 'libs/tenant/src'),
      '@core/article': resolve(__dirname, 'libs/article/src'),
      '@core/author': resolve(__dirname, 'libs/author/src'),
      '@core/platform-admin': resolve(__dirname, 'libs/platform-admin/src'),
    },
  },
});
