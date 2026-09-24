import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Fleet rollouts — Phase 18B — in a real browser against the real API.
 *
 * # What is real
 *
 * Real Chromium, the production bundle, the real `nodeau-cloud` with its real
 * PostgreSQL, and a fleet that arrives through the REAL `POST /v1/fleet/sync`
 * with a real installation credential. The plan is the API's own, computed
 * from a FIXTURE channel on loopback (`e2e/serve-origin.mjs`) — a release that
 * does not exist, so the test controls the target without touching the real
 * one. The machine's half of a rollout (reporting its step) is also sent
 * through the sync endpoint, exactly as a connector sends it.
 *
 * # What it proves that the Go tests and the component tests do not
 *
 * That the plan a person is SHOWN is the plan that gets authorised; that the
 * machine is handed the step the page says is next; that the page reports what
 * the machine says, and moves on only when it does; and — the negative one —
 * that a member is offered nothing AND refused when reaching past the page.
 */

const TARGET = 'v0.15.0-beta.9';
const FROM = 'v0.15.0-beta.1';
const SECRET = 'e2e-upgrade-secret-value-32-bytes-long';

const seed = { orgId: '', installationId: '', credential: '', owner: '', member: '' };

function token(label: string): { token: string; sha: string } {
  const t = `e2e-18b-${label}-session-token`;
  return { token: t, sha: createHash('sha256').update(t).digest('hex') };
}

function apiURL(): string {
  return process.env.NODEAU_E2E_API_URL ?? `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

test.beforeAll(async ({ request }) => {
  const dsn = e2e.scopedDSN;
  // Idempotent: Playwright re-runs beforeAll when a worker restarts.
  seed.orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'upgrade-e2e'`);
  if (!seed.orgId) {
    seed.orgId = psql(dsn,
      `INSERT INTO organizations (kind, name, slug) VALUES ('team', 'Upgrade e2e', 'upgrade-e2e') RETURNING id`);
  }
  for (const [label, role] of [['owner', 'owner'], ['member', 'member']] as const) {
    const email = `${label}-18b@example.com`;
    let userId = psql(dsn, `SELECT id FROM users WHERE email = '${email}'`);
    if (!userId) {
      userId = psql(dsn,
        `INSERT INTO users (email, auth_provider, auth_subject, display_name)
         VALUES ('${email}', 'test', '${label}-18b', '${label}') RETURNING id`);
      psql(dsn, `INSERT INTO organization_memberships (organization_id, user_id, role)
                 VALUES ('${seed.orgId}', '${userId}', '${role}')`);
      psql(dsn, `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
                 VALUES ('${userId}', '${token(label).sha}', now() + interval '2 hours')`);
    }
    seed[label] = token(label).token;
  }
  seed.installationId = psql(dsn, `SELECT id FROM installations WHERE organization_id = '${seed.orgId}' LIMIT 1`);
  if (!seed.installationId) {
    seed.installationId = psql(dsn,
      `INSERT INTO installations (organization_id, name) VALUES ('${seed.orgId}', 'upgrade-e2e') RETURNING id`);
  }
  seed.credential = `nodeau-inst-v1.${seed.installationId}.${SECRET}`;
  if (!psql(dsn, `SELECT 1 FROM installation_credentials WHERE installation_id = '${seed.installationId}'`)) {
    psql(dsn, `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
               VALUES ('${seed.installationId}', '${createHash('sha256').update(seed.credential).digest('hex')}',
                       'nodeau-inst-v1.${seed.installationId}')`);
  }
  if (!psql(dsn, `SELECT 1 FROM subscriptions WHERE organization_id = '${seed.orgId}'`)) {
    psql(dsn, `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
               VALUES ('${seed.orgId}', 'home-pro', 'active', now() + interval '90 days')`);
  }
  // Only a fresh rollout history makes the tests below mean what they say.
  psql(dsn, `DELETE FROM fleet_lifecycle_operations WHERE installation_id = '${seed.installationId}'`);
  await report(request, FROM, FROM, 'e2e-18b-seed');
});

/** report sends the fleet as a connector would: both machines, at the given
 *  builds, declaring that this connector runs rollouts. */
async function report(request: import('@playwright/test').APIRequestContext, worker: string, control: string,
  hash: string, lifecycle?: unknown) {
  const machine = (key: string, name: string, role: string, version: string) => ({
    machineKey: key, name, platform: 'linux/amd64', role, executionPlane: 'kubernetes',
    agentVersion: version, nodeauVersion: version,
    capabilities: ['fleet.report', 'fleet.lifecycle'],
    schedulingState: 'active', health: 'healthy', localOnline: true,
  });
  const response = await request.post(`${apiURL()}/v1/fleet/sync`, {
    headers: { Authorization: `Bearer ${seed.credential}`, 'X-Nodeau-Request': '1' },
    data: {
      protocolVersion: 1, observedHash: hash,
      observed: {
        nodeauVersion: control,
        machines: [
          machine('e2e18b-uid-c', 'nodeau-c', 'worker', worker),
          machine('e2e18b-uid-a', 'nodeforge', 'control-plane', control),
        ],
      },
      ...(lifecycle ? { lifecycle } : {}),
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function signIn(context: BrowserContext, who: 'owner' | 'member') {
  await context.addCookies([{
    name: 'nodeau_session', value: seed[who], domain: '127.0.0.1', path: '/',
    httpOnly: true, secure: false, sameSite: 'Lax',
  }]);
}

test.describe.serial('a fleet rollout, in the browser', () => {
  test('the owner plans, confirms the downtime, and authorises THE PLAN SHOWN', async ({ page, context, request }) => {
    await signIn(context, 'owner');
    await page.goto('/fleet/upgrade');
    await page.getByRole('button', { name: 'Plan' }).click();

    // The API's own plan, from the fixture channel: the worker first, the
    // control plane last.
    await expect(page.getByText(TARGET).first()).toBeVisible();
    const order = page.getByRole('list', { name: /in the order they would go/ });
    await expect(order.getByRole('listitem').nth(0)).toContainText('nodeau-c');
    await expect(order.getByRole('listitem').nth(1)).toContainText('nodeforge');
    await expect(order.getByRole('listitem').nth(1)).toContainText('control plane');

    const go = page.getByRole('button', { name: /Authorise upgrading 2 machine/ });
    await expect(go).toBeDisabled();
    await page.getByRole('checkbox', { name: /stop and start again/ }).check();
    await go.click();

    // Authorised: the rollout, with each machine asked-for BESIDE reported.
    await expect(page.getByRole('heading', { name: new RegExp(`Rollout to ${TARGET.replace(/\./g, '\\.')}`) })).toBeVisible();
    await expect(page.getByText(`asked: ${FROM} → ${TARGET}`).first()).toBeVisible();
    await expect(page.getByText(`reports ${FROM}`).first()).toBeVisible();

    // And the MACHINE is handed the step the page says is first — the worker.
    const synced = await report(request, FROM, FROM, 'e2e-18b-after-auth');
    const op = synced.desired.lifecycle.operation;
    expect(op.target.version).toBe(TARGET);
    expect(op.steps[op.run.seq - 1].machineKey).toBe('e2e18b-uid-c');
  });

  test('the page moves on only when the machine REPORTS the target', async ({ page, context, request }) => {
    await signIn(context, 'owner');
    const synced = await report(request, FROM, FROM, 'e2e-18b-step');
    const op = synced.desired.lifecycle.operation;
    // The worker says it is done, and reports running the target.
    await report(request, TARGET, FROM, 'e2e-18b-worker-done', {
      operationId: op.id, generation: op.generation, seq: op.run.seq, attempt: op.run.attempt,
      state: 'complete', observedVersion: TARGET, at: new Date().toISOString(),
    });
    await page.goto('/fleet/upgrade');
    const steps = page.getByRole('list', { name: 'Machines, in order' });
    await expect(steps.getByRole('listitem').nth(0)).toContainText('complete');
    await expect(steps.getByRole('listitem').nth(0)).toContainText(`reports ${TARGET}`);
    // The control plane is next, and has not reported anything new.
    await expect(steps.getByRole('listitem').nth(1)).toContainText('pending');
    await expect(steps.getByRole('listitem').nth(1)).toContainText(`reports ${FROM}`);
  });

  test('a member is offered nothing — and is refused when reaching past the page', async ({ page, context }) => {
    await signIn(context, 'member');
    await page.goto('/fleet/upgrade');
    await expect(page.getByRole('heading', { name: /Rollout to/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancel rollout|Resume/ })).toHaveCount(0);

    // UI hiding is not authorisation (§2.4): the same request, with the
    // member's real session, never touching the DOM.
    const list = await page.request.get(`${apiURL()}/v1/organizations/${seed.orgId}/fleet/lifecycle/operations`,
      { headers: { 'X-Nodeau-Request': '1' } });
    const view = await list.json();
    const cancel = await page.request.post(
      `${apiURL()}/v1/organizations/${seed.orgId}/fleet/lifecycle/operations/${view.operations[0].operation.id}/cancel`,
      { headers: { 'X-Nodeau-Request': '1' } });
    expect(cancel.status()).toBe(403);
  });

  test('the owner cancels; nothing starts after it, and the plan form returns', async ({ page, context }) => {
    await signIn(context, 'owner');
    await page.goto('/fleet/upgrade');
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Cancel rollout' }).click();
    await expect(page.getByRole('button', { name: 'Plan' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'The last rollout' })).toContainText('canceled');
  });
});
