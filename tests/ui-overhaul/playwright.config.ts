import { defineConfig, devices } from '@playwright/test';

import { ROLES } from '../../e2e/roles';

/**
 * R8 verify: runs only against a local app with fake accounts, never a deployed site. It does not load .env.e2e, so the
 * e2e auth setup signs in with the fake accounts below, which the local mock auth server knows.
 * Run from the repo root: `playwright test -c tests/ui-overhaul/playwright.config.ts`.
 */
process.env.E2E_PASSWORD = 'local-fake-password';
for (const role of ROLES) process.env[`E2E_${role}_EMAIL`] = `${role.toLowerCase().replaceAll('_', '-')}@bpp-e2e.test`;

export default defineConfig({
  testDir: '../..',
  outputDir: '../../test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000', viewport: { width: 1280, height: 800 }, navigationTimeout: 60_000 },
  projects: [
    { name: 'setup', testMatch: /e2e\/auth\.setup\.ts/ },
    { name: 'existing', testMatch: /e2e\/(nav-visibility|permission-boundaries)\.spec\.ts/, dependencies: ['setup'] },
    { name: 'ui', testMatch: /tests\/ui-overhaul\/.*\.spec\.ts/, dependencies: ['setup'] },
  ],
});
