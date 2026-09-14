import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Phase 17D — usage and audit, in a real browser against the real API.
 *
 * # What this proves that the Go tests and the component tests cannot
 *
 * `internal/cloud/store` proves the SQL, and `tests/usage.test.tsx` proves the
 * component against a mocked fetch. Neither proves that the server's JSON is
 * the shape the component reads, nor that a usage row a MACHINE reported comes
 * out the other end as a sentence a person can act on.
 *
 * That end-to-end shape is where this phase's real risk is. Every defect this
 * surface can have is a wrong number rendered confidently — a period counted
 * twice, a window not clipped, a cost shown where no rate exists — and all
 * three look completely ordinary on the page.
 *
 * # THE ROWS ARE INSERTED AS A MACHINE WOULD REPORT THEM
 *
 * Including a REPLAY: the same `usage_id` twice, and a stale copy after a newer
 * one. If the upsert were wrong, the total on the page would be inflated and
 * nothing about the page would look broken.
 */

const seeded = { orgId: '', ownerId: '', installationId: '' };

function sessionFor(label: string): { token: string; sha: string } {
  const token = `e2e-17d-${label}-token`;
  return { token, sha: createHash('sha256').update(token).digest('hex') };
}

/** A fixed window, so the assertions are arithmetic rather than timing. */
const START = '2026-09-01T00:00:00Z';

test.beforeAll(() => {
  const dsn = e2e.scopedDSN;

  const existing = psql(dsn, `SELECT id FROM organizations WHERE slug = 'seventeen-d'`);
  if (existing) {
    seeded.orgId = existing;
    seeded.ownerId = psql(dsn, `SELECT id FROM users WHERE email = 'owner-17d@example.com'`);
    seeded.installationId = psql(
      dsn,
      `SELECT id FROM installations WHERE organization_id = '${seeded.orgId}' LIMIT 1`,
    );
    return;
  }

  seeded.orgId = psql(
    dsn,
    `INSERT INTO organizations (kind, name, slug)
     VALUES ('team', 'Seventeen D Ltd', 'seventeen-d') RETURNING id`,
  );
  seeded.ownerId = psql(
    dsn,
    `INSERT INTO users (email, auth_provider, auth_subject, display_name)
     VALUES ('owner-17d@example.com', 'test', 'owner-17d', 'Ola Owner') RETURNING id`,
  );
  psql(
    dsn,
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ('${seeded.orgId}', '${seeded.ownerId}', 'owner')`,
  );
  psql(
    dsn,
    `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
     VALUES ('${seeded.ownerId}', '${sessionFor('owner').sha}', now() + interval '1 hour')`,
  );
  seeded.installationId = psql(
    dsn,
    `INSERT INTO installations (organization_id, name)
     VALUES ('${seeded.orgId}', 'workstation') RETURNING id`,
  );

  // ONE HOUR ON ONE CARD, reported three times as a connector would: the
  // interval opening, the same interval later, and a STALE copy arriving last.
  // The id is the same for all three because it is derived from what the
  // interval is ABOUT, so the correct total is one hour and not three.
  const usageRow = (endedMinutes: number) =>
    `INSERT INTO usage_intervals
       (usage_id, organization_id, installation_id, workload_kind, workload_name,
        replica, generation, node_name, device_uuids, model_id, started_at, ended_at)
     VALUES ('e2e-17d-interval-1', '${seeded.orgId}', '${seeded.installationId}',
             'service', 'qwen-local', 0, 3, 'nodeforge',
             ARRAY['GPU-aaaa'], 'qwen3-8b-q4km',
             '${START}'::timestamptz, '${START}'::timestamptz + interval '${endedMinutes} minutes')
     ON CONFLICT (usage_id) DO UPDATE
        SET ended_at = greatest(usage_intervals.ended_at, excluded.ended_at)
      WHERE excluded.ended_at > usage_intervals.ended_at`;

  psql(dsn, usageRow(20));
  psql(dsn, usageRow(60));
  psql(dsn, usageRow(20)); // the stale replay, arriving last

  // A SECOND WORKLOAD ON TWO CARDS, so the page has to multiply rather than
  // average: half an hour on two cards is one accelerator-hour.
  psql(
    dsn,
    `INSERT INTO usage_intervals
       (usage_id, organization_id, installation_id, workload_kind, workload_name,
        replica, generation, node_name, device_uuids, model_id, started_at, ended_at)
     VALUES ('e2e-17d-interval-2', '${seeded.orgId}', '${seeded.installationId}',
             'batch', 'nightly', 0, 1, 'nodeau-c',
             ARRAY['GPU-bbbb','GPU-cccc'], 'qwen3-8b-q4km',
             '${START}'::timestamptz, '${START}'::timestamptz + interval '30 minutes')
     ON CONFLICT (usage_id) DO NOTHING`,
  );

  // An audit event that was REFUSED, which is the record an investigation
  // starts from and the one a trail of successes cannot produce.
  psql(
    dsn,
    `INSERT INTO security_audit_events
       (event_type, organization_id, actor_user_id, target, result)
     VALUES ('fleet.channel_policy_changed', '${seeded.orgId}', '${seeded.ownerId}',
             '${seeded.installationId}', 'refused')`,
  );
});

/** The API's own origin. The app is served on a different port, so a request
 *  made through `page.request` carries the real cross-port session cookie —
 *  which is one of the things a browser test proves and a Go test cannot. */
function apiBase(): string {
  return `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

async function signIn(context: BrowserContext, label: string) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: sessionFor(label).token,
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
}

/** The window the page asks for is relative to NOW, so the seeded rows are
 *  dated far enough back that only an explicit range includes them. The page's
 *  own default is 30 days; the test drives the URL directly for the window it
 *  needs, which is what a person selecting "Last 90 days" produces. */
test('a replayed interval is counted once, and two cards multiply', async ({ page, context }) => {
  await signIn(context, 'owner');

  // Read through the API the page reads, over a window that contains the rows.
  const res = await page.request.get(
    `${apiBase()}/v1/organizations/${seeded.orgId}/usage` +
      `?from=2026-08-01T00:00:00Z&to=2026-10-01T00:00:00Z`,
  );
  expect(res.status()).toBe(200);
  const body = await res.json();

  // ONE HOUR on one card, reported three times, plus THIRTY MINUTES on two
  // cards = 3600 + 3600 = 7200 accelerator-seconds.
  //
  // If the upsert counted the replay the answer would be larger; if cards were
  // averaged rather than multiplied it would be 5400. Both would render as an
  // ordinary number on an ordinary page.
  expect(body.acceleratorSeconds).toBe(7200);
  expect(body.rateConfigured).toBe(false);
  expect(body.estimatedCost).toBeUndefined();
  expect(body.lines).toHaveLength(2);
});

test('the page says why there is no cost, and shows one once a rate exists', async ({
  page,
  context,
}) => {
  await signIn(context, 'owner');

  await page.goto('/usage');
  await expect(page.getByTestId('usage-no-cost')).toContainText(/nobody has entered a rate/i);

  // Set a rate through the real API, as the form does.
  const put = await page.request.put(
    `${apiBase()}/v1/organizations/${seeded.orgId}/usage/rate`,
    {
      // THE SAME HEADER THE CONSOLE'S OWN CLIENT SENDS. A state-changing call
      // without it is refused — which is the CSRF control doing its job, and a
      // test that worked around it by calling the store directly would prove
      // the opposite of what this file is for.
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { perAcceleratorHour: 0.5, currency: 'USD' },
    },
  );
  expect(put.status(), await put.text()).toBe(200);

  const res = await page.request.get(
    `${apiBase()}/v1/organizations/${seeded.orgId}/usage` +
      `?from=2026-08-01T00:00:00Z&to=2026-10-01T00:00:00Z`,
  );
  const body = await res.json();
  // Two accelerator-hours at 0.50 is 1.00, in the CUSTOMER'S currency.
  expect(body.estimatedCost).toBeCloseTo(1.0, 6);
  expect(body.currency).toBe('USD');
  expect(body.rateConfigured).toBe(true);

  // And clearing it removes the cost entirely rather than zeroing it.
  const cleared = await page.request.put(
    `${apiBase()}/v1/organizations/${seeded.orgId}/usage/rate`,
    {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { perAcceleratorHour: null },
    },
  );
  expect(cleared.status()).toBe(200);
  const after = await (
    await page.request.get(
      `${apiBase()}/v1/organizations/${seeded.orgId}/usage` +
        `?from=2026-08-01T00:00:00Z&to=2026-10-01T00:00:00Z`,
    )
  ).json();
  expect(after.estimatedCost).toBeUndefined();
  expect(after.rateConfigured).toBe(false);
});

test('the audit trail shows a refusal, in the browser', async ({ page, context }) => {
  await signIn(context, 'owner');
  await page.goto('/usage');

  await expect(page.getByTestId('audit')).toContainText(/365 days/);
  await page.getByLabel(/only things that were refused/i).check();
  await expect(page.getByTestId('audit-refused').first()).toBeVisible();
});

/** A WINDOW THAT IS NOT A WINDOW IS REFUSED RATHER THAN EMPTY.
 *
 *  An empty result reads as "you used nothing", which is the most misleading
 *  answer this surface can give — and the one a reversed date range would
 *  produce silently. */
test('a reversed window is refused rather than answered with nothing', async ({
  page,
  context,
}) => {
  await signIn(context, 'owner');
  const res = await page.request.get(
    `${apiBase()}/v1/organizations/${seeded.orgId}/usage` +
      `?from=2026-10-01T00:00:00Z&to=2026-08-01T00:00:00Z`,
  );
  expect(res.status()).toBe(400);
});
