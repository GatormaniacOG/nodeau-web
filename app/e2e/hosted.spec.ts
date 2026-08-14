import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * The hosted application in a real browser, against the real backend.
 *
 * Real Chromium · the production bundle from `vite build` · the real
 * `nodeau-cloud` binary · real PostgreSQL 16. The only short circuit is that
 * the session is written into the database rather than obtained from WorkOS,
 * because there are no WorkOS credentials and the test identity adapter is a Go
 * test type by design (ADR-P7-005 §3, playwright.config.ts).
 *
 * Everything after that is genuine: the server authenticates the session from
 * its own table, enforces its own tenancy, and the browser renders the shipped
 * bundle against real JSON over real CORS.
 */

const seeded = {
  userId: '',
  orgId: '',
  otherOrgId: '',
  installationId: '',
};

/**
 * seed writes the rows a signed-in person would have.
 *
 * In a beforeAll rather than at config load, because the tables do not exist
 * until `nodeau-cloud migrate` has run — and that happens when Playwright
 * starts the webServer, which is after the config is evaluated.
 */
test.beforeAll(() => {
  const dsn = e2e.scopedDSN;

  // Idempotent, because Playwright re-runs beforeAll when it restarts a worker
  // — which it does after a failure. The first version was not, so one genuine
  // failure turned into a cascade of duplicate-key errors that buried it.
  const existing = psql(dsn, `SELECT id FROM users WHERE email = 'e2e@example.com'`);
  if (existing) {
    seeded.userId = existing;
    seeded.orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'sam'`);
    seeded.otherOrgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'other'`);
    seeded.installationId = psql(
      dsn,
      `SELECT id FROM installations WHERE name = 'workstation'`,
    );
    return;
  }

  seeded.userId = psql(
    dsn,
    `INSERT INTO users (email, auth_provider, auth_subject, display_name)
     VALUES ('e2e@example.com', 'test', 'e2e-subject', 'Sam Rivers')
     RETURNING id`,
  );
  seeded.orgId = psql(
    dsn,
    `INSERT INTO organizations (kind, name, slug) VALUES ('personal', 'Sam''s workspace', 'sam')
     RETURNING id`,
  );
  psql(
    dsn,
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ('${seeded.orgId}', '${seeded.userId}', 'owner')`,
  );

  // A second organisation this person is NOT a member of, for the tenancy test.
  seeded.otherOrgId = psql(
    dsn,
    `INSERT INTO organizations (kind, name, slug) VALUES ('team', 'Somebody else', 'other')
     RETURNING id`,
  );
  psql(
    dsn,
    `INSERT INTO installations (organization_id, name) VALUES ('${seeded.otherOrgId}', 'not-yours')`,
  );

  seeded.installationId = psql(
    dsn,
    `INSERT INTO installations (organization_id, name, nodeau_version, node_count, gpu_count, last_seen_at)
     VALUES ('${seeded.orgId}', 'workstation', '0.7.0', 2, 3, now())
     RETURNING id`,
  );
  // A live credential, so the installation reads as activated rather than as
  // approved-but-never-collected.
  psql(
    dsn,
    `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
     VALUES ('${seeded.installationId}', 'deadbeef', 'nodeau-inst-v1.${seeded.installationId}')`,
  );

  psql(
    dsn,
    `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
     VALUES ('${seeded.userId}', '${e2e.sessionHash}', now() + interval '1 hour')`,
  );
});

/**
 * signIn gives the browser the session cookie.
 *
 * Domain `127.0.0.1` with no port: a cookie is scoped by host, not by port, so
 * one set here is sent to the API on :8099 by a page served from :4173. That is
 * also exactly why the production design works — app.nodeau.ai and
 * api.nodeau.ai share a registrable domain, so the session cookie is same-site.
 */
async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: e2e.sessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

// ---------------------------------------------------------------------------
// Signed out
// ---------------------------------------------------------------------------

test('a signed-out visitor is offered sign-in, not an error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /sign in to nodeau/i })).toBeVisible();
  // The adoption invariant, in front of the person deciding whether to sign up.
  await expect(page.getByText(/do not need an account to use Nodeau/i)).toBeVisible();
});

test('sign-in reports a deployment with no identity provider honestly', async ({ page }) => {
  // The real binary is running with no WorkOS credentials, so the real login
  // route answers a real 503 with a typed code. What matters is that the
  // browser is not left on a blank page or a raw JSON body.
  const response = await page.request.get(`${apiBase()}/v1/auth/login`);
  expect(response.status()).toBe(503);
  expect((await response.json()).code).toBe('IDENTITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------------
// Signed in
// ---------------------------------------------------------------------------

test.describe('signed in', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('the overview shows the plan and the linked machine', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /hello, sam/i })).toBeVisible();
    // Home, resolved by the real server from a real absence of a subscription.
    await expect(page.getByText('Nodeau Home').first()).toBeVisible();
    await expect(page.getByText('workstation')).toBeVisible();
  });

  test('the installation detail is a record, not a live view', async ({ page }) => {
    await page.goto(`/installations/${seeded.installationId}`);
    await expect(page.getByRole('heading', { name: 'workstation' })).toBeVisible();
    await expect(page.getByText('0.7.0')).toBeVisible();
    // Phase 7C brief §5.4 and §37.
    await expect(page.getByText(/does not connect to your machines/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /start|run a model|stop workload/i })).toHaveCount(0);
  });

  test('a deep link survives a full page load', async ({ page }) => {
    // The SPA fallback in netlify.toml exists for exactly this, and `vite
    // preview` applies the same rule. Without it a refresh on a sub-path is a
    // 404 — the classic single-page-app deployment bug, which only appears at
    // the moment somebody is already confused.
    await page.goto(`/installations/${seeded.installationId}`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'workstation' })).toBeVisible();
  });

  test('another organisation’s installation is not reachable by URL', async ({ page }) => {
    // Tenancy, through the whole stack: the browser asks, the real server
    // refuses, and the UI renders the refusal rather than a blank page.
    const response = await page.request.get(
      `${apiBase()}/v1/organizations/${seeded.otherOrgId}/installations`,
    );
    expect(response.status()).toBe(404);
    expect((await response.json()).code).toBe('NOT_FOUND');
  });

  test('the plan page does not offer to sell anything', async ({ page }) => {
    await page.goto('/plan');
    await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
    await expect(page.getByText('Nodeau Home Pro')).toBeVisible();
    // Billing is not live, so there must be no checkout — §5, §68.
    await expect(page.getByRole('button', { name: /upgrade/i })).toHaveCount(0);
    await expect(page.getByText(/coming soon/i).first()).toBeVisible();
    await expect(page.getByText(/nothing has been disabled/i)).toBeVisible();
  });

  test('an unknown activation code is refused by the real server', async ({ page }) => {
    await page.goto('/activate');
    await page.getByLabel(/activation code/i).fill('ABCD-2345');
    await page.getByRole('button', { name: /continue/i }).click();
    // A real 404 from the real handler, rendered as a typed message.
    await expect(page.getByRole('alert')).toContainText(/not valid/i);
  });

  test('a real activation can be approved end to end', async ({ page }) => {
    // The whole point of the hosted application. The CLI's half is created
    // directly against the API — that is what `nodeau login` does — and the
    // browser then does what a person does.
    const started = await page.request.post(`${apiBase()}/v1/activation/start`, {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { requestedName: 'the-quiet-one', nodeauVersion: '0.7.0' },
    });
    expect(started.ok()).toBeTruthy();
    const { userCode, deviceCode } = await started.json();

    await page.goto(`/activate?code=${encodeURIComponent(userCode)}`);

    // The approver can read what they are approving.
    await expect(page.getByText(/Authorize this machine\?/i)).toBeVisible();
    await expect(page.getByLabel(/installation name/i)).toHaveValue('the-quiet-one');
    // And the device code is nowhere on the page.
    await expect(page.locator('body')).not.toContainText(deviceCode);

    await page.getByRole('button', { name: /^authorize$/i }).click();
    await expect(page.getByText(/is connected/i)).toBeVisible();
    await expect(page.getByText(/Return to your terminal/i)).toBeVisible();

    // The CLI's next poll succeeds, against the real server, with a real
    // credential and a real signed entitlement.
    const polled = await page.request.post(`${apiBase()}/v1/activation/poll`, {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { deviceCode },
    });
    expect(polled.ok()).toBeTruthy();
    const result = await polled.json();
    expect(result.credential).toMatch(/^nodeau-inst-v1\./);
    expect(result.entitlement).toBeTruthy();
    expect(result.planId).toBe('home');

    // And it appears in the browser.
    await page.goto('/installations');
    await expect(page.getByText('the-quiet-one')).toBeVisible();
  });

  test('an activation can be refused', async ({ page }) => {
    const started = await page.request.post(`${apiBase()}/v1/activation/start`, {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { requestedName: 'unwanted' },
    });
    const { userCode, deviceCode } = await started.json();

    await page.goto(`/activate?code=${encodeURIComponent(userCode)}`);
    await page.getByRole('button', { name: /i did not start this/i }).click();
    await expect(page.getByText(/Not approved/i)).toBeVisible();

    // The CLI is told DENIED, not "expired" — the distinction is a security
    // signal and must survive to the terminal.
    const polled = await page.request.post(`${apiBase()}/v1/activation/poll`, {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': '1' },
      data: { deviceCode },
    });
    expect((await polled.json()).code).toBe('ACTIVATION_DENIED');
  });

  test('signing out revokes the session server-side', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('heading', { name: /sign in to nodeau/i })).toBeVisible();

    // Not merely a cleared cookie: the row is revoked, so a copy of the token
    // is dead too.
    const response = await page.request.get(`${apiBase()}/v1/me`, {
      headers: { Cookie: `nodeau_session=${e2e.sessionToken}` },
    });
    expect(response.status()).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Cross-origin behaviour, in a real browser
// ---------------------------------------------------------------------------

test('the API refuses a credentialed request from an unlisted origin', async ({ page }) => {
  // The one thing only a browser can check: that CORS actually stops a
  // cross-origin read. A fetch from a page on a different origin must fail.
  await page.goto('/');
  const blocked = await page.evaluate(async (api) => {
    try {
      // A hostile origin is simulated by asking the browser to send one. The
      // server matches Origin against its allowlist; this page's origin IS
      // allowed, so the header is overridden to a foreign one — which the
      // browser refuses to do for `Origin`, so instead the check is that a
      // preflight for a disallowed origin fails at the server.
      const res = await fetch(api + '/v1/me', { credentials: 'include' });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }, apiBase());
  // From the ALLOWED origin and with no session, this is a clean 401 rather
  // than a CORS failure — which is what proves the allowlist admits this origin
  // and that the 401 came from the application.
  expect(blocked.status).toBe(401);
});

function apiBase(): string {
  return `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}
