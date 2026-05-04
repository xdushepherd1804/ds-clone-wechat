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
    testTimeout: 15_000,
    hookTimeout: 15_000,
    environment: 'node',
    env: {
      CONFIG_DIR: './config',
      JWT_SECRET: 'test-jwt-secret-for-testing',
      NODE_ENV: 'test',
    },
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['packages/web/**', 'jsdom']],
    setupFiles: ['./packages/web/src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/__tests__/**'],
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
});
