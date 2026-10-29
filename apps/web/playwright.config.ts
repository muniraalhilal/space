import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke tests against a running Space (web + API) with the demo seed loaded.
 * Start everything first (see README), then: npm run test:e2e -w @space/web
 * WebGL runs on SwiftShader in headless CI, so 3D steps use ?still=1 (render on demand).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    trace: 'retain-on-failure',
  },
});
