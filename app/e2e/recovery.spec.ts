import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Recovery and model copies, in a real browser, against the real backend —
 * Phase 20.
 *
 * Real Chromium · the production bundle · the real `nodeau-cloud` binary · real
 * PostgreSQL 16 · and the fleet's report arrives through the REAL
 * `POST /v1/fleet/sync`, as a Phase 20 connector sends it: a workload carrying
 * the machine's own record of its recovery, and the copies its machines keep.
 * The choice a person makes goes back through the real operations endpoint.
 *
 * Its own person, organisation and fleet, so it depends on no other file's rows.
 */

const seed = { orgId: '', installationId: '', credential: '', sessionToken: '' };
const SECRET = 'e2e-recovery-secret-value-32-bytes';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

test.beforeAll(async ({ request }) => {
  const dsn = e2e.scopedDSN;
  let userId = psql(dsn, `SELECT id FROM users WHERE email = 'recovery-e2e@example.com'`);
  if (!userId) {
    userId = psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name)
       VALUES ('recovery-e2e@example.com', 'test', 'recovery-e2e-subject', 'Recovery Owner') RETURNING id`,
    );
  }
  let orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'recovery-e2e'`);
  if (!orgId) {
    orgId = psql(
      dsn,
      `INSERT INTO organizations (kind, name, slug)
       VALUES ('personal', 'Recovery workspace', 'recovery-e2e') RETURNING id`,
    );
    psql(
      dsn,
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ('${orgId}', '${userId}', 'owner')`,
    );
  }
  seed.sessionToken = 'recovery-e2e-session-token-value-01';
  const sessionHash = await sha256Hex(seed.sessionToken);
  if (!psql(dsn, `SELECT 1 FROM auth_sessions WHERE session_token_sha256 = '${sessionHash}'`)) {
    psql(
      dsn,
      `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
       VALUES ('${userId}', '${sessionHash}', now() + interval '1 hour')`,
    );
  }
  seed.orgId = orgId;
  let installationId = psql(dsn, `SELECT id FROM installations WHERE name = 'recovery-e2e'`);
  if (!installationId) {
    installationId = psql(
      dsn,
      `INSERT INTO installations (organization_id, name) VALUES ('${orgId}', 'recovery-e2e') RETURNING id`,
    );
  }
  seed.installationId = installationId;
  seed.credential = `nodeau-inst-v1.${installationId}.${SECRET}`;
  const hash = await sha256Hex(seed.credential);
  if (!psql(dsn, `SELECT 1 FROM installation_credentials WHERE installation_id = '${installationId}'`)) {
    psql(
      dsn,
      `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
       VALUES ('${installationId}', '${hash}', 'nodeau-inst-v1.${installationId}')`,
    );
  }
  if (!psql(dsn, `SELECT 1 FROM subscriptions WHERE organization_id = '${orgId}'`)) {
    psql(
      dsn,
      `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
       VALUES ('${orgId}', 'home-pro', 'active', now() + interval '90 days')`,
    );
  }

  const caps = ['fleet.report', 'workload.run', 'workload.stop', 'logs.tail', 'workload.recovery'];
  const response = await request.post(`${apiURL()}/v1/fleet/sync`, {
    headers: { Authorization: `Bearer ${seed.credential}`, 'X-Nodeau-Request': '1' },
    data: {
      protocolVersion: 1,
      observedHash: 'recovery-e2e-1',
      observed: {
        nodeauVersion: 'v0.17.0-e2e',
        machines: [
          {
            machineKey: 'rec-uid-a', name: 'nodeforge', role: 'control-plane', executionPlane: 'kubernetes',
            capabilities: caps, schedulingState: 'active', health: 'healthy', localOnline: true, gpus: [],
          },
          {
            machineKey: 'rec-uid-c', name: 'nodeau-c', role: 'worker', executionPlane: 'kubernetes',
            capabilities: caps, schedulingState: 'active', health: 'healthy', localOnline: false, gpus: [],
          },
        ],
        workloads: [
          {
            name: 'qwen-c', machineKey: 'rec-uid-a', type: 'service', model: 'qwen3-8b-q4km',
            state: 'serving', gpuCount: 1, generation: 1,
            recovery: {
              policy: 'automatic', afterSeconds: 180, copies: 2,
              state: 'Recovered', reason: 'Recovered',
              message: 'qwen-c serves on nodeforge, brought up there after nodeau-c stopped answering.',
              from: 'nodeau-c', to: 'nodeforge',
              machineUnreachableSince: minutesAgo(12), decidedAt: minutesAgo(9),
              oldCopyFencedAt: minutesAgo(9), readyAt: minutesAgo(8), generation: 1,
            },
          },
        ],
        modelCopies: [
          {
            model: 'qwen3-8b-q4km', machine: 'nodeforge', machineKey: 'rec-uid-a', state: 'Ready',
            workload: 'nodeau-dev/qwen-c', totalBytes: 5027783488, readyAt: minutesAgo(60),
          },
          { model: 'qwen3-8b-q4km', machine: 'nodeau-c', machineKey: 'rec-uid-c', state: 'Fetching', requested: true },
        ],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(body.features, 'the server must advertise recovery-v1').toContain('recovery-v1');
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
      name: 'nodeau_session', value: seed.sessionToken, domain: '127.0.0.1', path: '/',
      httpOnly: true, secure: false, sameSite: 'Lax',
    },
  ]);
}

test.describe('recovery and copies, signed in', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('a workload shows its recovery in the machine’s own words, and where its copies are', async ({ page }) => {
    await page.goto('/fleet/workloads');
    const block = page.getByRole('group', { name: 'Recovery for qwen-c' });
    await expect(block).toContainText('Automatic, after its machine has stopped answering for 3 minutes.');
    await expect(block).toContainText('recovered: qwen-c serves on nodeforge');
    await expect(block).toContainText('nodeau-c stopped answering');
    await expect(block).toContainText('Verified copies on nodeforge.');

    const copies = page.getByTestId('model-copies');
    await expect(copies).toContainText('fetching');
    await expect(copies).toContainText("nodeau-dev/qwen-c's recovery");
  });

  test('a choice goes to the fleet as one typed operation, and is not shown done', async ({ page }) => {
    await page.goto('/fleet/workloads');
    await page.getByRole('button', { name: 'Change recovery' }).click();
    const minutes = page.getByLabel('Minutes before recovering');
    await minutes.fill('10');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/asked|sent to the machine/).first()).toBeVisible();

    const stored = psql(
      e2e.scopedDSN,
      `SELECT parameters::text FROM remote_operations
        WHERE installation_id = '${seed.installationId}' AND kind = 'workload.recovery.set'`,
    );
    expect(JSON.parse(stored)).toEqual({
      workloadName: 'qwen-c',
      recoveryPolicy: 'automatic',
      recoveryAfterSeconds: '600',
    });
  });

  test('the audit trail says Nodeau recovered it, once per moment', async ({ page }) => {
    await page.goto('/usage');
    const audit = page.getByTestId('audit-events');
    await expect(audit).toContainText('workload.recovery.ready');
    await expect(audit).toContainText('by Nodeau (automatic recovery)');
    const ready = psql(
      e2e.scopedDSN,
      `SELECT count(*) FROM security_audit_events
        WHERE organization_id = '${seed.orgId}' AND event_type = 'workload.recovery.ready'`,
    );
    expect(ready).toBe('1');
  });
});
