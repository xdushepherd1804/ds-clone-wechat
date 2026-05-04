/**
 * Vitest configuration for integration tests (CI-ready).
 *
 * Integration tests exercise cross-service coordination using in-memory mocks
 * — no real databases or Docker containers are required.
 *
 * Usage:
 *   vitest run --config vitest.integration.config.ts
 */
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/web/src'),
    },
  },
  test: {
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 15_000,
    environment: 'node',
    include: ['packages/server-gateway/src/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/server-auth/src/**/*.ts',
        'packages/server-contact/src/**/*.ts',
        'packages/server-group/src/**/*.ts',
        'packages/server-message/src/**/*.ts',
        'packages/server-moments/src/**/*.ts',
        'packages/server-file/src/**/*.ts',
        'packages/server-gateway/src/**/*.ts',
      ],
      exclude: [
        'packages/*/src/**/*.test.ts',
        'packages/*/src/__tests__/**',
        'packages/*/src/integration/**',
      ],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 50,
        lines: 50,
      },
    },
  },
});
