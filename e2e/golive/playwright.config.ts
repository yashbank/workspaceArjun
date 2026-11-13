import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.e2e' });
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 240000,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
});
