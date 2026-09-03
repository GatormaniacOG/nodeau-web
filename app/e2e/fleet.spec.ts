import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * The fleet, in a real browser, against the real backend — Phase 14C.
 *
 * # What is real and what is not
 *
 * Real Chromium · the production bundle from `vite build` · the real
 * `nodeau-cloud` binary · real PostgreSQL 16 · and — the part that matters most
 * here — the fleet state arrives through the REAL `POST /v1/fleet/sync`
 * endpoint, authenticated with a real installation credential, exactly as a
 * connector would send it. Nothing about the fleet is written into the database
 * by this file.
 *
 * The one short circuit is the same one the rest of this suite makes: the
 * browser SESSION is seeded rather than obtained from WorkOS, because there are
 * no WorkOS credentials and the test identity adapter is a Go test type by
 * design (ADR-P7-005 §3).
 */

const fleetSeed = {
  orgId: '',
  installationId: '',
  credential: '',
  sessionToken: '',
};

const CREDENTIAL_SECRET = 'e2e-fleet-secret-value-32-bytes-long';

/**
 * ITS OWN PERSON, ITS OWN ORGANISATION, ITS OWN SESSION.
 *
 * The first version of this file reused `hosted.spec.ts`'s organisation and put
 * a paid subscription on it — which broke six of that file's tests, because
 * they assert what a FREE account sees. Test pollution, and the honest fix is
 * isolation rather than teaching those tests about this one's fixture.
 *
 * It is also more truthful: this file is about a fleet on a paid plan, and that
 * is a different customer from the one the account tests describe.
 */
test.beforeAll(async ({ request }) => {
  const dsn = e2e.scopedDSN;

  // Idempotent, because Playwright re-runs beforeAll when it restarts a worker.
  let userId = psql(dsn, `SELECT id FROM users WHERE email = 'fleet-e2e@example.com'`);
  if (!userId) {
    userId = psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name)
       VALUES ('fleet-e2e@example.com', 'test', 'fleet-e2e-subject', 'Fleet Owner') RETURNING id`,
    );
  }
  let orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'fleet-e2e'`);
  if (!orgId) {
    orgId = psql(
      dsn,
      `INSERT INTO organizations (kind, name, slug)
       VALUES ('personal', 'Fleet workspace', 'fleet-e2e') RETURNING id`,
    );
    psql(
      dsn,
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ('${orgId}', '${userId}', 'owner')`,
    );
  }
  fleetSeed.sessionToken = 'fleet-e2e-session-token-value-0001';
  const sessionHash = await sha256Hex(fleetSeed.sessionToken);
  if (!psql(dsn, `SELECT 1 FROM auth_sessions WHERE session_token_sha256 = '${sessionHash}'`)) {
    psql(
      dsn,
      `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
       VALUES ('${userId}', '${sessionHash}', now() + interval '1 hour')`,
    );
  }
  fleetSeed.orgId = orgId;

  // A fleet of its own, so this file never depends on hosted.spec.ts's rows.
  let installationId = psql(dsn, `SELECT id FROM installations WHERE name = 'fleet-e2e'`);
  if (!installationId) {
    installationId = psql(
      dsn,
      `INSERT INTO installations (organization_id, name) VALUES ('${orgId}', 'fleet-e2e')
       RETURNING id`,
    );
  }
  fleetSeed.installationId = installationId;

  // The credential shape the server parses: nodeau-inst-v1.<uuid>.<secret>. It
  // is stored as sha256, so this is the ONE place the plaintext exists — and
  // it is generated here rather than reused, so no real credential is involved.
  fleetSeed.credential = `nodeau-inst-v1.${installationId}.${CREDENTIAL_SECRET}`;
  const hash = await sha256Hex(fleetSeed.credential);
  if (!psql(dsn, `SELECT 1 FROM installation_credentials WHERE installation_id = '${installationId}'`)) {
    psql(
      dsn,
      `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
       VALUES ('${installationId}', '${hash}', 'nodeau-inst-v1.${installationId}')`,
    );
  }

  // A paid plan, because remote OPERATIONS are what a plan buys. Seeing a fleet
  // is not gated at all.
  if (!psql(dsn, `SELECT 1 FROM subscriptions WHERE organization_id = '${orgId}'`)) {
    psql(
      dsn,
      `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
       VALUES ('${orgId}', 'home-pro', 'active', now() + interval '90 days')`,
    );
  }

  // AND THE FLEET ITSELF ARRIVES THROUGH THE REAL ENDPOINT. Not written into
  // the database: a report that took the customer's own path is the only kind
  // that proves the customer's own path works.
  const response = await request.post(`${apiURL()}/v1/fleet/sync`, {
    headers: {
      Authorization: `Bearer ${fleetSeed.credential}`,
      'X-Nodeau-Request': '1',
    },
    data: {
      protocolVersion: 1,
      observedHash: 'e2e-1',
      observed: {
        nodeauVersion: 'v0.7.0-e2e',
        machines: [
          {
            machineKey: 'e2e-uid-a',
            name: 'nodeforge',
            platform: 'linux/amd64',
            osVersion: 'Ubuntu 24.04.4 LTS',
            role: 'control-plane',
            executionPlane: 'kubernetes',
            nodeauVersion: 'v0.7.0-e2e',
            capabilities: ['fleet.report', 'policy.set', 'workload.run', 'workload.stop', 'logs.tail'],
            schedulingState: 'active',
            health: 'healthy',
            localOnline: true,
            gpus: [
              {
                uuid: 'GPU-e2e-a1',
                ordinal: 1,
                model: 'NVIDIA GeForce RTX 5070 Ti',
                vramTotalMib: 15819,
                vramUsedMib: 5386,
                temperatureC: 41,
                healthy: true,
                schedulable: true,
              },
            ],
          },
          {
            machineKey: 'e2e-uid-c',
            name: 'nodeau-c',
            platform: 'linux/amd64',
            role: 'worker',
            executionPlane: 'kubernetes',
            capabilities: ['fleet.report', 'policy.set', 'workload.run', 'workload.stop', 'logs.tail'],
            schedulingState: 'active',
            health: 'healthy',
            localOnline: true,
            gpus: [
              { uuid: 'GPU-e2e-c1', ordinal: 1, model: 'NVIDIA GeForce RTX 3080', vramTotalMib: 9877, healthy: true, schedulable: true },
              {
                uuid: 'GPU-e2e-c2',
                ordinal: 2,
                model: 'NVIDIA GeForce RTX 5060 Ti',
                vramTotalMib: 15849,
                healthy: true,
                schedulable: false,
                note: 'MultiGPU is part of a paid plan.',
              },
            ],
          },
        ],
        workloads: [
          {
            name: 'qwen-main',
            machineKey: 'e2e-uid-a',
            type: 'service',
            model: 'qwen3-8b-q4km',
            state: 'serving',
            gpuCount: 1,
            deviceUuids: ['GPU-e2e-a1'],
            placementSummary: 'already placed here and still fits; 9,116 MiB of projected headroom',
          },
        ],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
});

function apiURL(): string {
  return process.env.NODEAU_E2E_API_URL ?? `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

async function sha256Hex(value: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}

async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: fleetSeed.sessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

test.describe('the fleet, signed in', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('shows both machines, their accelerators and the fleet’s own sentence', async ({ page }) => {
    await page.goto('/fleet');

    await expect(page.getByText('Everything is running.')).toBeVisible();
    await expect(page.getByText('nodeforge', { exact: true })).toBeVisible();
    await expect(page.getByText('nodeau-c', { exact: true })).toBeVisible();
    await expect(page.getByText(/RTX 5070 Ti/)).toBeVisible();
    await expect(page.getByText(/RTX 3080/)).toBeVisible();
    // Presence is what Nodeau Cloud can SEE, and it says so in those words.
    await expect(page.getByText('visible').first()).toBeVisible();
  });

  test('a machine page shows every value the machine reported', async ({ page }) => {
    await page.goto('/fleet');
    await page.getByText('nodeau-c', { exact: true }).click();

    await expect(page.getByRole('heading', { name: 'nodeau-c' })).toBeVisible();
    await expect(page.getByText('Ubuntu 24.04.4 LTS')).toBeHidden(); // that is nodeforge's
    await expect(page.getByText('GPU-e2e-c1')).toBeVisible();
    // HARDWARE IS SHOWN WHETHER OR NOT A PLAN ALLOWS IT, with the machine's own
    // reason beside it. Hiding a card because of a plan is the dishonest
    // version of this view.
    await expect(page.getByText('NVIDIA GeForce RTX 5060 Ti')).toBeVisible();
    await expect(page.getByText(/MultiGPU is part of a paid plan/)).toBeVisible();
    // Never the word "default": it means different things on different builds.
    await expect(page.getByText(/built-in policy/)).toBeVisible();
  });

  test('renaming a machine changes the display name and nothing else', async ({ page }) => {
    await page.goto('/fleet');
    await page.getByText('nodeau-c', { exact: true }).click();
    await page.getByLabel(/what to call this machine/i).fill('the box in the cupboard');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'the box in the cupboard' })).toBeVisible();
    // The machine's OWN name is still shown, so a rename can never make two
    // machines look like one.
    await expect(page.getByText(/calls itself nodeau-c/i)).toBeVisible();

    // And the fleet still has exactly two machines.
    await page.goto('/fleet');
    await expect(page.getByText('the box in the cupboard')).toBeVisible();
    await expect(page.locator('.machine-row')).toHaveCount(2);
  });

  test('the workloads page shows what is running and why it is there', async ({ page }) => {
    await page.goto('/fleet/workloads');

    await expect(page.getByText('qwen-main')).toBeVisible();
    await expect(page.getByText('serving')).toBeVisible();
    // The scheduler's own explanation, carried verbatim from the machine.
    await expect(page.getByText(/9,116 MiB of projected headroom/)).toBeVisible();
  });

  test('stopping a workload never renders "Stopped" before the fleet says so', async ({ page }) => {
    await page.goto('/fleet/workloads');
    await page.getByText('qwen-main').waitFor();
    await page.getByRole('button', { name: 'Stop' }).click();

    // The operation is real: it went through the real API, was stored, and is
    // waiting for a machine that is not running in this test.
    await expect(page.getByText(/asked|sent to the machine/i)).toBeVisible();
    await expect(page.getByText(/Waiting for the machine to report back/i)).toBeVisible();
    // The claim that would be a lie at this moment.
    await expect(page.getByText(/^Stopped$/)).toHaveCount(0);
  });

  test('the run form asks for a model and never for a machine', async ({ page }) => {
    await page.goto('/fleet/run');

    await expect(page.getByRole('heading', { name: /run a workload/i })).toBeVisible();
    await expect(page.getByLabel('Model')).toBeVisible();
    await expect(page.getByText(/Nodeau picks the machine and the accelerator/i)).toBeVisible();
    await expect(page.getByLabel(/^machine$/i)).toHaveCount(0);
  });

  test('a run request reaches the real API and is recorded', async ({ page }) => {
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill('browser-started');
    await page.getByLabel('Model').fill('qwen3-8b-q4km');
    await page.getByRole('button', { name: 'Run' }).click();

    await expect(page.getByRole('heading', { name: /starting browser-started/i })).toBeVisible();
    // The desired state really is in the database, which is what the connector
    // would collect on its next sync.
    const stored = psql(
      e2e.scopedDSN,
      `SELECT subject_id FROM fleet_desired_state
        WHERE subject_kind = 'workload' AND subject_id = 'browser-started'`,
    );
    expect(stored).toBe('browser-started');
  });

  test('the whole fleet is usable on a phone-sized viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/fleet');

    await expect(page.getByText('Everything is running.')).toBeVisible();
    await expect(page.getByText('nodeforge', { exact: true })).toBeVisible();
    // NOTHING SCROLLS SIDEWAYS. A page that needs horizontal scrolling on a
    // phone is a page somebody away from their desk cannot use, and status,
    // stop and warnings are exactly what they need there.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the fleet page scrolls horizontally on a phone').toBeLessThanOrEqual(1);
  });
});
