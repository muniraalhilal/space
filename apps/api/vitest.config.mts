import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * API integration tests run the real Nest app in-process against a dedicated Postgres database
 * (space_test, recreated and seeded by test/global-setup.ts) and Redis logical DB 15, so they never
 * touch development data or a running dev worker's queue.
 */
const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://space:space@localhost:5432/space_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
  STORAGE_LOCAL_DIR: './.data/test-files',
  AI_PROVIDER: 'none',
  LOG_LEVEL: 'error',
};
Object.assign(process.env, TEST_ENV);

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    env: TEST_ENV,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
