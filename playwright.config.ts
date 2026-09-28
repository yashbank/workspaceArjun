import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.e2e' });

/**
 * Critical-path E2E only (Phase 28): login, per-role nav visibility, the handful of write
 * actions each role owns, and the permission-boundary regressions for bugs already found by
 * manual testing. Deep flow coverage (full order lifecycle, BOM builds, GRN receiving end to
 * end) and anything APK-related are a deliberately separate later phase.
 *
 * Runs against the live deployed site (E2E_BASE_URL) with the 7 real MIS test logins — the same
 * accounts and environment a human tester uses, so a pass here means the same thing a human
 * pass would.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one connection pool (max: 1) backs the runtime DB — see store.ts's F-24 note
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://workspace-arjun.vercel.app',
    viewport: { width: 1280, height: 800 }, // desktop sidebar, not the phone bottom bar (D1/D3)
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
