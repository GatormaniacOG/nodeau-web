import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Phase 17C's resource governance, in a real browser against the real API.
 *
 * # Why a browser at all, when the round trip is already tested in Go
 *
 * `internal/cloud/api` proves the server's half and `tests/governance.test.tsx`
 * proves the component's half against a mocked `fetch`. Neither proves that the
 * server's JSON is the shape the component reads, that the cookie reaches the
 * API cross-port, or that a form a person fills in produces the policy the
 * scheduler would be given. §30 asks for exactly that, and the reason is the
 * one this project keeps paying for: a form that saves successfully and never
 * affects scheduling looks identical to one that works.
 *
 * # THE NEGATIVE ASSERTION IS THE ONE THAT MATTERS
 *
 * A member must not be offered a control they cannot use, AND a member who
 * reaches past the interface must still be refused. Two different properties,
 * and only the second is security — `CLAUDE.md` §2.4's "UI hiding is not
 * authorization". The direct request uses `page.request`, so it carries the real
 * session and never touches the DOM.
 */

const seeded = {
  orgId: '',
  adminId: '',
  memberId: '',
  installationId: '',
};

function sessionFor(label: string): { token: string; sha: string } {
  const token = `e2e-17c-${label}-token`;
  return { token, sha: createHash('sha256').update(token).digest('hex') };
}

test.beforeAll(() => {
  const dsn = e2e.scopedDSN;

  // Idempotent, for the reason organization.spec.ts gives: Playwright re-runs
  // beforeAll when a worker restarts, and a non-idempotent seed buries the real
  // failure under duplicate keys.
  const existing = psql(dsn, `SELECT id FROM organizations WHERE slug = 'seventeen-c'`);
  if (existing) {
    seeded.orgId = existing;
    seeded.adminId = psql(dsn, `SELECT id FROM users WHERE email = 'admin-17c@example.com'`);
    seeded.memberId = psql(dsn, `SELECT id FROM users WHERE email = 'member-17c@example.com'`);
    seeded.installationId = psql(
      dsn,
      `SELECT id FROM installations WHERE organization_id = '${seeded.orgId}' LIMIT 1`,
    );
    return;
  }

  seeded.orgId = psql(
    dsn,
    `INSERT INTO organizations (kind, name, slug)
     VALUES ('team', 'Seventeen C Ltd', 'seventeen-c') RETURNING id`,
  );
  seeded.adminId = psql(
    dsn,
    `INSERT INTO users (email, auth_provider, auth_subject, display_name)
     VALUES ('admin-17c@example.com', 'test', 'admin-17c', 'Ada Admin') RETURNING id`,
  );
  seeded.memberId = psql(
    dsn,
    `INSERT INTO users (email, auth_provider, auth_subject, display_name)
     VALUES ('member-17c@example.com', 'test', 'member-17c', 'Mo Member') RETURNING id`,
  );
  psql(
    dsn,
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ('${seeded.orgId}', '${seeded.adminId}', 'admin'),
            ('${seeded.orgId}', '${seeded.memberId}', 'member')`,
  );
  psql(
    dsn,
    `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
     VALUES ('${seeded.adminId}', '${sessionFor('admin').sha}', now() + interval '1 hour'),
            ('${seeded.memberId}', '${sessionFor('member').sha}', now() + interval '1 hour')`,
  );

  // A PAID PLAN, because setting governance from a browser is remote
  // management and that is what a paid plan buys. Reading it is free on every
  // plan — seeing your own machines is not something Nodeau withholds — and
  // that half is asserted in Go.
  psql(
    dsn,
    `INSERT INTO subscriptions (organization_id, plan_id, status)
     VALUES ('${seeded.orgId}', 'home-pro', 'active')`,
  );

  seeded.installationId = psql(
    dsn,
    `INSERT INTO installations (organization_id, name)
     VALUES ('${seeded.orgId}', 'workstation') RETURNING id`,
  );

  // A fleet that has reported machines and cards, so the page can offer real
  // hardware rather than asking somebody to type a GPU UUID. The capability
  // list is what makes the server willing to deliver a `governance.set`: a
  // machine on an older build simply does not declare it and is refused, which
  // is the mixed-version property.
  const machineA = psql(
    dsn,
    `INSERT INTO fleet_machines (installation_id, machine_key, reported_name, role,
                                 execution_plane, capabilities, scheduling_state, health)
     VALUES ('${seeded.installationId}', 'uid-a', 'nodeforge', 'control-plane', 'kubernetes',
             '["fleet.report","governance.set"]'::jsonb, 'active', 'healthy') RETURNING id`,
  );
  const machineB = psql(
    dsn,
    `INSERT INTO fleet_machines (installation_id, machine_key, reported_name, role,
                                 execution_plane, capabilities, scheduling_state, health)
     VALUES ('${seeded.installationId}', 'uid-c', 'nodeau-c', 'worker', 'kubernetes',
             '["fleet.report","governance.set"]'::jsonb, 'active', 'healthy') RETURNING id`,
  );
  psql(
    dsn,
    `INSERT INTO fleet_machine_gpus (machine_id, device_uuid, ordinal, model, vram_total_mib,
                                     healthy, schedulable)
     VALUES ('${machineA}', 'GPU-e2e-a1', 1, 'NVIDIA GeForce RTX 5070 Ti', 15819, true, true),
            ('${machineB}', 'GPU-e2e-c1', 1, 'NVIDIA GeForce RTX 3080', 9877, true, true)`,
  );
});

async function signInAs(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

function apiBase(): string {
  return `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

// ---------------------------------------------------------------------------
// An administrator sets a policy, and the page never claims it is in force
// ---------------------------------------------------------------------------

test('an administrator sets a policy and the page says SAVED rather than IN FORCE', async ({
  page,
  context,
}) => {
  await signInAs(context, sessionFor('admin').token);
  await page.goto('/fleet/governance');

  await expect(page.getByRole('heading', { name: 'Governance', level: 1 })).toBeVisible();

  // A fleet with no policy says so, rather than rendering six empty fields
  // somebody has to interpret.
  await expect(page.getByTestId('governance-status')).toContainText('Nothing is limited');

  // The real inventory came from the server. This is the assertion a mocked
  // fetch cannot make: these rows are in PostgreSQL and reached the browser
  // through the server's own tenancy scoping.
  await page.getByLabel('Only these cards').check();
  await expect(page.getByText('GPU-e2e-a1')).toBeVisible();
  await expect(page.getByText('GPU-e2e-c1')).toBeVisible();

  await page.getByLabel('Workloads at once').fill('2');
  await page.getByRole('checkbox', { name: /RTX 5070 Ti/ }).check();
  await page.getByRole('button', { name: 'Save policy' }).click();

  // SAVED IS NOT APPLIED. No machine has reported what it is enforcing, so the
  // page must not show a green tick — that would be a claim rendered as a fact
  // about something somebody is relying on.
  await expect(page.getByTestId('governance-status')).toContainText('Saved, not yet in force', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('governance-status')).not.toContainText('In force.');

  // And it really is stored, read back through the API rather than from the
  // page that just wrote it.
  const read = await page.request.get(
    `${apiBase()}/v1/organizations/${seeded.orgId}/fleet/governance`,
  );
  expect(read.status()).toBe(200);
  const body = (await read.json()) as {
    desired: { maxWorkloads?: number; allowedDevices: string[] | null };
    applied: boolean;
  };
  expect(body.desired.maxWorkloads).toBe(2);
  expect(body.desired.allowedDevices).toEqual(['GPU-e2e-a1']);
  expect(body.applied).toBe(false);
});

test('the policy survives a refresh, because it is stored rather than held in the page', async ({
  page,
  context,
}) => {
  await signInAs(context, sessionFor('admin').token);
  await page.goto('/fleet/governance');
  await expect(page.getByRole('heading', { name: 'Governance', level: 1 })).toBeVisible();

  await page.getByLabel('Workloads at once').fill('5');
  // WAIT FOR THE WRITE, not for text the page may already show (#144). The
  // previous test left a saved policy, so "Saved, not yet in force" is on the
  // page before this save is even sent — asserting it let the reload cancel the
  // PUT mid-flight, which the server logged as a 500 and the field read back 2.
  // The server answers a policy write with 202: the fleet still has to apply it.
  const written = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/fleet/governance'),
  );
  await page.getByRole('button', { name: 'Save policy' }).click();
  expect((await written).status()).toBe(202);
  await expect(page.getByTestId('governance-status')).toContainText('Saved', { timeout: 10_000 });

  await page.reload();
  await expect(page.getByLabel('Workloads at once')).toHaveValue('5');
});

// ---------------------------------------------------------------------------
// A member: the interface AND the server both refuse
// ---------------------------------------------------------------------------

test('a member may see the policy that constrains them and may not change it', async ({
  page,
  context,
}) => {
  await signInAs(context, sessionFor('member').token);
  await page.goto('/fleet/governance');

  // READING IS NOT MANAGING. Somebody refused by a quota has to be able to see
  // the number that refused them, or the refusal names a policy they cannot
  // look at.
  await expect(page.getByRole('heading', { name: 'Governance', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save policy' })).toHaveCount(0);
  await expect(page.getByText(/not change it/i)).toBeVisible();

  // AND THE SERVER REFUSES INDEPENDENTLY. This is the assertion that is
  // security; the one above is courtesy.
  const refused = await page.request.put(
    `${apiBase()}/v1/organizations/${seeded.orgId}/fleet/governance`,
    {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { governance: { maxWorkloads: 99, allowedModels: null, allowedDevices: null, allowedNodes: null } },
    },
  );
  expect(refused.status()).toBe(403);

  // Nothing changed, which is what catches a write refused loudly and applied
  // anyway.
  const read = await page.request.get(
    `${apiBase()}/v1/organizations/${seeded.orgId}/fleet/governance`,
  );
  const body = (await read.json()) as { desired: { maxWorkloads?: number } };
  expect(body.desired.maxWorkloads).not.toBe(99);
});

test('an invalid policy is refused by the server and the form marks the field', async ({
  page,
  context,
}) => {
  await signInAs(context, sessionFor('admin').token);
  await page.goto('/fleet/governance');
  await expect(page.getByRole('heading', { name: 'Governance', level: 1 })).toBeVisible();

  // Larger than Nodeau stores as a quota. Rejected SERVER-SIDE — the browser's
  // own `min=0` is a courtesy and is not the rule.
  const refused = await page.request.put(
    `${apiBase()}/v1/organizations/${seeded.orgId}/fleet/governance`,
    {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: {
        governance: {
          maxWorkloads: 999999999,
          allowedModels: null,
          allowedDevices: null,
          allowedNodes: null,
        },
      },
    },
  );
  expect(refused.status()).toBe(400);
  const body = (await refused.json()) as { fields?: Record<string, string> };
  expect(body.fields?.maxWorkloads).toBeTruthy();
});
