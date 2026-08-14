import { defineConfig, devices } from '@playwright/test';
import { prepare } from './e2e/prepare';

// Runs at config load, so the connection string below cannot be undefined and
// the schema cannot be created after the server has already tried to migrate.
export const e2e = prepare();

/**
 * Browser tests against a REAL Nodeau Cloud.
 *
 * # What this closes
 *
 * `docs/BUILD_STATE.md` §80.6 recorded browser/e2e coverage as outstanding
 * debt, for a straightforward reason: there was no Node runtime on the
 * development host, so the local dashboard's API was tested and its DOM was
 * not. The hosted application has a Node toolchain, so the debt is payable here.
 *
 * # The combination, and the one thing that is stubbed
 *
 * Real Chromium, the real production bundle served by `vite preview`, the real
 * `nodeau-cloud` binary, and real PostgreSQL. The only thing not exercised is
 * the identity provider: there are no WorkOS credentials, and the test identity
 * adapter is deliberately a Go test type so that authentication cannot be
 * switched off in a shipped binary (ADR-P7-005 §3).
 *
 * So a session is SEEDED DIRECTLY INTO THE DATABASE by globalSetup, and the
 * browser is given the cookie. Everything downstream of "this person is signed
 * in" is then genuinely end to end — the server authenticates the session from
 * its own table, applies its own tenancy rules and serves its own JSON, and
 * Chromium renders the real bundle against it.
 *
 * Requires PostgreSQL: `./scripts/dev-postgres.sh start` in the platform
 * repository. Skips loudly rather than failing when it is absent, because a
 * frontend developer without a database should still be able to run everything
 * else.
 */

const platformRepo = process.env.NODEAU_PLATFORM_REPO ?? '../../nodeforge';
const apiPort = process.env.NODEAU_E2E_API_PORT ?? '8099';
const appPort = process.env.NODEAU_E2E_APP_PORT ?? '4173';
const apiURL = `http://127.0.0.1:${apiPort}`;
const appURL = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,

  use: {
    baseURL: appURL,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      // Migrate, then serve. One command so the ordering cannot race.
      command:
        `cd ${platformRepo} && ` +
        `go run ./cmd/nodeau-cloud migrate && go run ./cmd/nodeau-cloud serve`,
      url: `${apiURL}/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODEAU_CLOUD_ENV: 'development',
        DATABASE_URL: e2e.scopedDSN,
        PORT: apiPort,
        NODEAU_APP_URL: appURL,
        NODEAU_API_URL: apiURL,
        // A fixed development signing key, so entitlements survive a restart of
        // the server inside a test run. It is 32 zero bytes and signs nothing
        // any released Nodeau build would accept, because a release trusts only
        // the keys stamped into it at build time.
        NODEAU_ENTITLEMENT_SIGNING_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        NODEAU_ENTITLEMENT_KEY_ID: 'e2e-dev',
      },
    },
    {
      command: `npm run build && npx vite preview --port ${appPort} --strictPort`,
      url: appURL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_NODEAU_API_URL: apiURL },
    },
  ],
});
