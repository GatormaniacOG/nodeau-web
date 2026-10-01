import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * A fleet's maintenance window and release channel, set from the account
 * (post-18) — in a real browser against the real API.
 *
 * # What is real
 *
 * Real Chromium, the production bundle, the real `nodeau-cloud` with its real
 * PostgreSQL. The fleet reports, and hears its policy, through the REAL
 * `POST /v1/fleet/sync` with a real installation credential — the same route
 * the connector uses — so "the setting reached the machine's desired state" is
 * read from the response a connector would read, not from the database.
 *
 * # What it proves
 *
 * That what a person sets on the page is exactly what the fleet is told; that
 * clearing a window tells the fleet "none" (never "unknown"); and the negative:
 * a viewer is offered nothing AND refused when reaching past the page. The
 * machine acting on it — waiting for the window, then starting — is proved on
 * the fleet itself, against production.
 */

const SECRET = 'e2e-policy-secret-value-32-bytes-long!';
const RUNS = 'v0.15.0-beta.7';
const seed = { orgId: '', installationId: '', credential: '', member: '', viewer: '' };

function token(label: string): { token: string; sha: string } {
  const t = `e2e-policy-${label}-session-token`;
  return { token: t, sha: createHash('sha256').update(t).digest('hex') };
}

function apiURL(): string {
  return process.env.NODEAU_E2E_API_URL ?? `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

test.beforeAll(async ({ request }) => {
  const dsn = e2e.scopedDSN;
  seed.orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'policy-e2e'`);
  if (!seed.orgId) {
    seed.orgId = psql(dsn,
      `INSERT INTO organizations (kind, name, slug) VALUES ('team', 'Policy e2e', 'policy-e2e') RETURNING id`);
  }
  for (const [label, role] of [['member', 'member'], ['viewer', 'viewer']] as const) {
    const email = `${label}-policy@example.com`;
    let userId = psql(dsn, `SELECT id FROM users WHERE email = '${email}'`);
    if (!userId) {
      userId = psql(dsn,
        `INSERT INTO users (email, auth_provider, auth_subject, display_name)
         VALUES ('${email}', 'test', '${label}-policy', '${label}') RETURNING id`);
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
      `INSERT INTO installations (organization_id, name) VALUES ('${seed.orgId}', 'policy-e2e') RETURNING id`);
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
  // A fresh start: no window and no channel policy.
  psql(dsn, `DELETE FROM fleet_maintenance_windows WHERE installation_id = '${seed.installationId}'`);
  psql(dsn, `DELETE FROM fleet_channel_policy WHERE installation_id = '${seed.installationId}'`);
  await sync(request, 'e2e-policy-seed');
});

/** sync reports one machine, as a connector would, and returns the policy the
 *  fleet is told — the desired state's lifecycle section. */
async function sync(request: APIRequestContext, hash: string) {
  const response = await request.post(`${apiURL()}/v1/fleet/sync`, {
    headers: { Authorization: `Bearer ${seed.credential}`, 'X-Nodeau-Request': '1' },
    data: {
      protocolVersion: 1, observedHash: hash,
      observed: {
        nodeauVersion: RUNS,
        machines: [{
          machineKey: 'e2e-policy-uid-a', name: 'nodeforge', platform: 'linux/amd64', role: 'control-plane',
          executionPlane: 'kubernetes', agentVersion: RUNS, nodeauVersion: RUNS,
          capabilities: ['fleet.report', 'fleet.lifecycle'], schedulingState: 'active', health: 'healthy',
          localOnline: true,
        }],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json();
  expect(body.desired?.lifecycle, 'a server that knows must always send the policy').toBeTruthy();
  return body.desired.lifecycle;
}

async function signIn(context: BrowserContext, who: 'member' | 'viewer') {
  await context.addCookies([{
    name: 'nodeau_session', value: seed[who], domain: '127.0.0.1', path: '/',
    httpOnly: true, secure: false, sameSite: 'Lax',
  }]);
}

test.describe.serial('a fleet\'s maintenance window and channel, in the browser', () => {
  test('a member sets a window, and the fleet is told exactly that window', async ({ page, context, request }) => {
    await signIn(context, 'member');
    await page.goto('/fleet/upgrade');
    const panel = page.getByRole('region', { name: 'Maintenance window' });
    await expect(panel.getByText('No window set')).toBeVisible();

    await panel.getByRole('button', { name: 'Set a window' }).click();
    // The default draft is Sundays at 03:00 for an hour; choose the zone.
    await panel.getByRole('combobox', { name: 'Time zone' }).selectOption('America/New_York');
    await panel.getByRole('button', { name: 'Save window' }).click();
    await expect(panel.getByText('Sundays, 03:00 to 04:00 (America/New_York)')).toBeVisible();
    await expect(panel.getByText(/Open now|Closed/)).toBeVisible();

    const told = await sync(request, 'e2e-policy-after-window');
    expect(told.maintenanceWindow).toEqual({
      startMinute: 180, durationMinutes: 60, timezone: 'America/New_York', daysOfWeek: [0],
    });
  });

  test('a member holds the fleet at what it runs, and the fleet is told', async ({ page, context, request }) => {
    await signIn(context, 'member');
    await page.goto('/fleet/upgrade');
    const panel = page.getByRole('region', { name: 'Release channel' });
    await expect(panel.getByText('(the default)')).toBeVisible();
    await panel.getByRole('button', { name: 'Change' }).click();
    await expect(panel.getByText(/Nodeau publishes one channel today/)).toBeVisible();
    await panel.getByRole('radio', { name: `Stay on ${RUNS}` }).check();
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.getByText('(your choice)')).toBeVisible();
    await expect(panel.getByText(RUNS, { exact: true })).toBeVisible();

    const told = await sync(request, 'e2e-policy-after-channel');
    expect(told.channelPolicy?.channel).toBe('beta');
    expect(told.channelPolicy?.pinnedVersion).toBe(RUNS);
  });

  test('a viewer sees both and is offered nothing — and is refused reaching past the page', async ({ page, context }) => {
    await signIn(context, 'viewer');
    await page.goto('/fleet/upgrade');
    const win = page.getByRole('region', { name: 'Maintenance window' });
    await expect(win.getByText('Sundays, 03:00 to 04:00 (America/New_York)')).toBeVisible();
    await expect(win.getByText(/You can see this setting and not change it/)).toBeVisible();
    await expect(win.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Release channel' }).getByRole('button', { name: 'Change' }))
      .toHaveCount(0);

    // UI hiding is not authorisation: the viewer's real session, no DOM.
    const putWindow = await page.request.put(`${apiURL()}/v1/organizations/${seed.orgId}/fleet/maintenance`, {
      headers: { 'X-Nodeau-Request': '1' },
      data: { startMinute: 0, durationMinutes: 1440, timezone: 'UTC', daysOfWeek: [] },
    });
    expect(putWindow.status()).toBe(403);
    const putChannel = await page.request.put(`${apiURL()}/v1/organizations/${seed.orgId}/fleet/channel`, {
      headers: { 'X-Nodeau-Request': '1' }, data: { channel: 'beta' },
    });
    expect(putChannel.status()).toBe(403);
  });

  test('removing the window tells the fleet "none", never unknown', async ({ page, context, request }) => {
    await signIn(context, 'member');
    await page.goto('/fleet/upgrade');
    const panel = page.getByRole('region', { name: 'Maintenance window' });
    await panel.getByRole('button', { name: 'Change window' }).click();
    await panel.getByRole('button', { name: 'Remove window' }).click();
    await panel.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(panel.getByText('No window set')).toBeVisible();

    const told = await sync(request, 'e2e-policy-after-clear');
    // Present-and-empty is "none": the policy section is there, with no window.
    expect(told.maintenanceWindow ?? null).toBeNull();
    expect(told.channelPolicy?.pinnedVersion).toBe(RUNS);
  });
});
