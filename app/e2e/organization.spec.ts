import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Phase 17B's organisation administration, in a real browser.
 *
 * # What this closes
 *
 * `docs/BUILD_STATE.md` §159.12 records that no browser has driven the local
 * dashboard, and 17B arrived with the same gap one level up: `Organization.tsx`
 * has nine component tests against a mocked `fetch`, and nothing had rendered it
 * against the real API. A mocked fetch proves the component; it cannot prove that
 * the server's JSON is the shape the component reads, that CORS lets the browser
 * send the session cookie cross-port, or that a capability the server withholds
 * actually removes a control.
 *
 * Real Chromium · the production bundle from `vite build` · the real
 * `nodeau-cloud` binary · real PostgreSQL. The one short circuit is the identity
 * provider, for the reason playwright.config.ts gives: there are no WorkOS
 * credentials and the test identity adapter is a Go test type by design, so
 * authentication cannot be switched off in a shipped binary (ADR-P7-005 §3). The
 * session is therefore written into the database and the cookie handed to the
 * browser; everything downstream of "this person is signed in" is genuine.
 *
 * # THE ASSERTION THAT MATTERS IS THE NEGATIVE ONE
 *
 * A viewer must not be shown controls they cannot use, AND a viewer who reaches
 * past the interface must still be refused. Those are two different properties
 * and only the second is security: `CLAUDE.md` §2.4's "UI hiding is not
 * authorization". This file asserts both, and the direct request is made with
 * `page.request` so it carries the real session and bypasses the DOM entirely.
 */

const seeded = {
  ownerId: '',
  viewerId: '',
  orgId: '',
  viewerSession: '',
};

/**
 * A session token and the SHA-256 the store keeps.
 *
 * Hashed here rather than read from a column, because no column holds a session
 * token in plaintext — which is the property, and is also why a seed has to
 * compute the digest the same way `store.CreateSession` does.
 */
function sessionFor(label: string): { token: string; sha: string } {
  const token = `e2e-17b-${label}-token`;
  return { token, sha: createHash('sha256').update(token).digest('hex') };
}

test.beforeAll(() => {
  const dsn = e2e.scopedDSN;

  // Idempotent: Playwright re-runs beforeAll when a worker restarts after a
  // failure, and a non-idempotent seed turns one real failure into a cascade of
  // duplicate-key errors that buries it.
  const existing = psql(dsn, `SELECT id FROM organizations WHERE slug = 'seventeen-b'`);
  if (existing) {
    seeded.orgId = existing;
    seeded.ownerId = psql(dsn, `SELECT id FROM users WHERE email = 'owner-17b@example.com'`);
    seeded.viewerId = psql(dsn, `SELECT id FROM users WHERE email = 'viewer-17b@example.com'`);
    seeded.viewerSession = sessionFor('viewer').token;
    return;
  }

  seeded.orgId = psql(
    dsn,
    `INSERT INTO organizations (kind, name, slug)
     VALUES ('team', 'Seventeen B Ltd', 'seventeen-b') RETURNING id`,
  );
  seeded.ownerId = psql(
    dsn,
    `INSERT INTO users (email, auth_provider, auth_subject, display_name)
     VALUES ('owner-17b@example.com', 'test', 'owner-17b', 'Ada Owner') RETURNING id`,
  );
  seeded.viewerId = psql(
    dsn,
    `INSERT INTO users (email, auth_provider, auth_subject, display_name)
     VALUES ('viewer-17b@example.com', 'test', 'viewer-17b', 'Vic Viewer') RETURNING id`,
  );
  psql(
    dsn,
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ('${seeded.orgId}', '${seeded.ownerId}', 'owner'),
            ('${seeded.orgId}', '${seeded.viewerId}', 'viewer')`,
  );

  // The owner reuses the config's session so the existing sign-in helper works;
  // the viewer gets their own, because the whole point is two principals.
  psql(
    dsn,
    `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
     VALUES ('${seeded.ownerId}', '${sessionFor('owner').sha}', now() + interval '1 hour'),
            ('${seeded.viewerId}', '${sessionFor('viewer').sha}', now() + interval '1 hour')`,
  );
  seeded.viewerSession = sessionFor('viewer').token;
});

async function signInAs(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: token,
      // Host, not port: a cookie is scoped by host, which is why one set here
      // reaches the API on another port — and why app.nodeau.ai and
      // api.nodeau.ai work in production, sharing a registrable domain.
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

// Resolved the same way hosted.spec.ts does: the port is a config-level
// constant rather than part of the shared state object, so both specs read the
// environment variable and its default from one place — here and there.
function apiBase(): string {
  return `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

// ---------------------------------------------------------------------------
// An owner sees the whole surface, rendered from the real API
// ---------------------------------------------------------------------------

test('an owner reaches organisation administration and every tab renders', async ({
  page,
  context,
}) => {
  await signInAs(context, sessionFor('owner').token);
  await page.goto('/organization');

  await expect(page.getByRole('heading', { name: 'Organisation', level: 1 })).toBeVisible();

  // Members is the default tab, and both seeded people are really there —
  // which is the part a mocked fetch cannot establish, because the rows come
  // from PostgreSQL through the server's own tenancy scoping.
  //
  // Scoped to the TABLE. Unscoped, the owner's address matches twice: once in
  // the header banner naming who is signed in, once in the row. Playwright's
  // strict mode caught that rather than silently taking the first, which is the
  // behaviour worth having.
  const members = page.getByRole('table').first();
  await expect(members.getByText('owner-17b@example.com')).toBeVisible();
  await expect(members.getByText('viewer-17b@example.com')).toBeVisible();

  // THE ROLE IS A SET OF PERMISSIONS AND THE PAGE SAYS SO. The column is
  // headed "May", and the server computes what it lists — a client that
  // recomputed permissions from the role name would be a second implementation
  // of the model that disagrees the day a role changes.
  await expect(page.getByRole('columnheader', { name: 'May' })).toBeVisible();

  for (const tab of ['Teams', 'Service accounts', 'Single sign-on']) {
    await page.getByRole('button', { name: tab }).click();
    await expect(page.getByRole('button', { name: tab })).toHaveAttribute('aria-current', 'page');
  }
});

test("single sign-on reports a state rather than a boolean", async ({ page, context }) => {
  await signInAs(context, sessionFor('owner').token);
  await page.goto('/organization');
  await page.getByRole('button', { name: 'Single sign-on' }).click();

  // WAIT FOR THE FETCH. The first version of this read `body` immediately and
  // matched against "loading…" — an assertion racing the thing it asserts
  // about, which fails on correct code and would have passed on a page that
  // rendered nothing at all.
  await expect(page.getByText(/loading/i)).toHaveCount(0, { timeout: 10_000 });

  // The status is three- and four-valued on purpose: "we have never asked" and
  // "we asked and there is none" send different people to do different things.
  // Whatever this deployment reports, it must not render as a bare yes/no.
  const body = await page.textContent('body');
  expect(body).toBeTruthy();
  expect(body!.toLowerCase()).toMatch(/unconfigured|not configured|active|unknown/);

  // AND IT MUST NOT CLAIM SCIM. Nodeau receives what a provider forwards; it
  // runs no SCIM server, and saying otherwise describes software that does not
  // exist. Asserted against the rendered page because this is the surface a
  // customer reads.
  expect(body!.toUpperCase()).not.toContain('SCIM');
});

// ---------------------------------------------------------------------------
// A viewer: the interface AND the server both refuse
// ---------------------------------------------------------------------------

test('a viewer is not offered controls they do not hold', async ({ page, context }) => {
  await signInAs(context, seeded.viewerSession);
  await page.goto('/organization');

  await expect(page.getByRole('heading', { name: 'Organisation', level: 1 })).toBeVisible();
  // A viewer holds organization.view, so they can see the members list.
  await expect(page.getByText('owner-17b@example.com')).toBeVisible();

  // They hold neither members.manage nor credentials.manage, so the role
  // control for another person must not be offered to them.
  await expect(page.getByLabel('Role for owner-17b@example.com')).toHaveCount(0);

  // THE CONTROL, and without it `toHaveCount(0)` is satisfied by a page that
  // rendered no controls at all — for any reason, including a crash. An OWNER
  // must be offered that same control, so the absence above is about the
  // capability rather than about the selector.
  const ownerContext = await page.context().browser()!.newContext();
  try {
    await signInAs(ownerContext, sessionFor('owner').token);
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto('/organization');
    await expect(ownerPage.getByLabel('Role for viewer-17b@example.com')).toHaveCount(1);
  } finally {
    await ownerContext.close();
  }
});

test('a viewer who reaches PAST the interface is still refused', async ({ page, context }) => {
  await signInAs(context, seeded.viewerSession);
  await page.goto('/organization');
  await expect(page.getByRole('heading', { name: 'Organisation', level: 1 })).toBeVisible();

  // No DOM involved. The real session cookie, the real API, the request a
  // person would make with curl. UI hiding is not authorization, and this is
  // the assertion that says so.
  const response = await page.request.post(
    `${apiBase()}/v1/organizations/${seeded.orgId}/service-accounts`,
    {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': 'e2e' },
      data: { name: 'smuggled', role: 'viewer' },
    },
  );
  expect(response.status()).toBe(403);
  const refusal = await response.json();
  expect(refusal.code).toBe('FORBIDDEN');
  // The refusal NAMES the capability, so the person reading it knows what to
  // ask an administrator for.
  expect(refusal.message).toContain('credentials.manage');

  // THE CONTROL. The same request as the owner succeeds — without it, the 403
  // above is equally consistent with a broken route.
  const ownerContext = await page.context().browser()!.newContext();
  await signInAs(ownerContext, sessionFor('owner').token);
  const asOwner = await ownerContext.request.post(
    `${apiBase()}/v1/organizations/${seeded.orgId}/service-accounts`,
    {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': 'e2e' },
      data: { name: 'legitimate', role: 'viewer' },
    },
  );
  expect([200, 201]).toContain(asOwner.status());
  await ownerContext.close();
});

test('a member of no organisation cannot read this one', async ({ page, context }) => {
  await signInAs(context, sessionFor('owner').token);
  await page.goto('/organization');

  // A well-formed uuid that is not an organisation this person belongs to must
  // be 404, never 403: a 403 confirms the id exists, which makes the status
  // code an enumeration oracle.
  const response = await page.request.get(
    `${apiBase()}/v1/organizations/00000000-0000-0000-0000-000000000000/members`,
  );
  expect(response.status()).toBe(404);
});
