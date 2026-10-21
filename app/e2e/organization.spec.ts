import { createHash } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Phase 17B's organisation administration, made Phase 21's Teams & Identity,
 * in a real browser.
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
  danaId: '',
  orgId: '',
  homeOrgId: '',
};

/**
 * A session token and the SHA-256 the store keeps.
 *
 * Hashed here rather than read from a column, because no column holds a session
 * token in plaintext — which is the property, and is also why a seed has to
 * compute the digest the same way `store.CreateSession` does.
 */
function sessionFor(label: string): { token: string; sha: string } {
  const token = `e2e-21-${label}-token`;
  return { token, sha: createHash('sha256').update(token).digest('hex') };
}

test.beforeAll(() => {
  const dsn = e2e.scopedDSN;
  // Idempotent: Playwright re-runs beforeAll when a worker restarts.
  const existing = psql(dsn, `SELECT id FROM organizations WHERE slug = 'phase-21-ltd'`);
  if (existing) {
    seeded.orgId = existing;
    seeded.ownerId = psql(dsn, `SELECT id FROM users WHERE email = 'owner-21@example.com'`);
    seeded.viewerId = psql(dsn, `SELECT id FROM users WHERE email = 'viewer-21@example.com'`);
    seeded.danaId = psql(dsn, `SELECT id FROM users WHERE email = 'dana-21@example.com'`);
    seeded.homeOrgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'home-21'`);
    return;
  }
  seeded.orgId = psql(dsn, `INSERT INTO organizations (kind, name, slug) VALUES ('team', 'Phase 21 Ltd', 'phase-21-ltd') RETURNING id`);
  seeded.homeOrgId = psql(dsn, `INSERT INTO organizations (kind, name, slug) VALUES ('personal', 'Solo Home', 'home-21') RETURNING id`);
  // Business, through the same administrative row SetAdminSubscription writes.
  psql(dsn, `INSERT INTO subscriptions (organization_id, plan_id, status) VALUES ('${seeded.orgId}', 'business', 'active')`);
  const user = (email: string, subject: string, name: string) =>
    psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name, email_verified_at)
       VALUES ('${email}', 'test', '${subject}', '${name}', now()) RETURNING id`,
    );
  seeded.ownerId = user('owner-21@example.com', 'owner-21', 'Ada Owner');
  seeded.viewerId = user('viewer-21@example.com', 'viewer-21', 'Vic Viewer');
  seeded.danaId = user('dana-21@example.com', 'dana-21', 'Dana Scully');
  const solo = user('solo-21@example.com', 'solo-21', 'Solo Person');
  psql(
    dsn,
    `INSERT INTO organization_memberships (organization_id, user_id, role)
     VALUES ('${seeded.orgId}', '${seeded.ownerId}', 'owner'),
            ('${seeded.orgId}', '${seeded.viewerId}', 'viewer'),
            ('${seeded.homeOrgId}', '${solo}', 'owner')`,
  );
  const sessions = [
    [seeded.ownerId, 'owner'],
    [seeded.viewerId, 'viewer'],
    [seeded.danaId, 'dana'],
    [solo, 'solo'],
  ] as const;
  for (const [id, label] of sessions) {
    psql(
      dsn,
      `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
       VALUES ('${id}', '${sessionFor(label).sha}', now() + interval '1 hour')`,
    );
  }
});

async function signInAs(context: BrowserContext, label: string) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: sessionFor(label).token,
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

// Resolved the same way hosted.spec.ts does.
function apiBase(): string {
  return `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

async function choose(page: import('@playwright/test').Page, orgId: string) {
  // The organisation the console looks at is remembered per browser; a test
  // sets it the way the switcher does.
  await page.addInitScript((id) => window.localStorage.setItem('nodeau.organization', id), orgId);
}

// ---------------------------------------------------------------------------
// An owner, through every section, rendered from the real API
// ---------------------------------------------------------------------------

test('an owner reaches every section of a Business organisation', async ({ page, context }) => {
  await signInAs(context, 'owner');
  await choose(page, seeded.orgId);
  await page.goto('/organization');
  await expect(page.getByRole('heading', { name: 'Phase 21 Ltd', level: 1 })).toBeVisible();
  const members = page.getByTestId('members');
  await expect(members.getByText('owner-21@example.com')).toBeVisible();
  await expect(members.getByText('viewer-21@example.com')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'May' })).toBeVisible();
  const sections = page.getByRole('navigation', { name: 'Organisation sections' });
  for (const tab of ['Teams', 'Service accounts', 'Single sign-on', 'Settings', 'People']) {
    await sections.getByRole('link', { name: tab, exact: true }).click();
    await expect(sections.getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  // Every section is a real address: a reload lands on it.
  await sections.getByRole('link', { name: 'Single sign-on', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('sso-states')).toBeVisible();
  // The body never claims SCIM: Nodeau receives what a provider forwards.
  expect((await page.textContent('body'))!.toUpperCase()).not.toContain('SCIM');
});

// ---------------------------------------------------------------------------
// G2 in a browser: invite, share the link, accept once
// ---------------------------------------------------------------------------

test('an owner invites somebody and they join through the link, once', async ({ page, context, browser }) => {
  await signInAs(context, 'owner');
  await choose(page, seeded.orgId);
  await page.goto('/organization');
  await page.getByLabel('Email address').fill('dana-21@example.com');
  await page.getByLabel('as').selectOption('member');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const shown = page.getByTestId('invite-link');
  await expect(shown).toContainText('/invite#nodeau-inv-v1.');
  const link = (await shown.locator('code').textContent())!.trim();
  // The address bar never holds it.
  expect(page.url()).not.toContain('nodeau-inv-v1');

  const danaContext = await browser.newContext();
  try {
    await signInAs(danaContext, 'dana');
    const dana = await danaContext.newPage();
    await dana.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(dana.getByRole('heading', { name: 'Join Phase 21 Ltd' })).toBeVisible();
    // The fragment is gone from the address bar once read.
    await expect.poll(() => dana.url()).not.toContain('nodeau-inv-v1');
    await dana.getByRole('button', { name: 'Accept and join' }).click();
    await expect(dana.getByTestId('invite-joined')).toContainText('as Operator');
    // Once: the same link again, in a fresh page load, is refused plainly.
    await dana.goto('about:blank');
    await dana.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(dana.getByRole('alert')).toContainText(/already been used/);
  } finally {
    await danaContext.close();
  }
  await page.reload();
  await expect(page.getByTestId('members').getByText('dana-21@example.com')).toBeVisible();
  await expect(page.getByTestId('invitations')).toContainText('accepted');
});

// ---------------------------------------------------------------------------
// A viewer: the interface AND the server both refuse
// ---------------------------------------------------------------------------

test('a viewer is offered no controls and is refused past the interface', async ({ page, context, browser }) => {
  await signInAs(context, 'viewer');
  await choose(page, seeded.orgId);
  await page.goto('/organization');
  await expect(page.getByTestId('members').getByText('owner-21@example.com')).toBeVisible();
  await expect(page.getByLabel('Role for owner-21@example.com')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create invitation' })).toHaveCount(0);

  const smuggled = await page.request.post(`${apiBase()}/v1/organizations/${seeded.orgId}/invitations`, {
    headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': 'e2e', 'X-Nodeau-Role': 'owner' },
    data: { email: 'smuggled@example.com', role: 'viewer' },
  });
  expect(smuggled.status()).toBe(403);
  expect((await smuggled.json()).message).toContain('members.manage');

  // THE CONTROL: the owner is offered the control and the same request works.
  const ownerContext = await browser.newContext();
  try {
    await signInAs(ownerContext, 'owner');
    const ownerPage = await ownerContext.newPage();
    await choose(ownerPage, seeded.orgId);
    await ownerPage.goto('/organization');
    await expect(ownerPage.getByLabel('Role for viewer-21@example.com')).toHaveCount(1);
    const legit = await ownerContext.request.post(`${apiBase()}/v1/organizations/${seeded.orgId}/invitations`, {
      headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': 'e2e' },
      data: { email: 'legit-21@example.com', role: 'viewer' },
    });
    expect(legit.status()).toBe(201);
  } finally {
    await ownerContext.close();
  }
});

// ---------------------------------------------------------------------------
// Home: one person, no team ceremony, a plan boundary and never a 404
// ---------------------------------------------------------------------------

test('Home sees its own Nodeau and a sentence about Business, and the server agrees', async ({ page, context }) => {
  await signInAs(context, 'solo');
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Fleet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Organisation' })).toHaveCount(0);
  await page.goto('/organization');
  await expect(page.getByTestId('plan-boundary')).toContainText('part of Nodeau Business');
  const refused = await page.request.post(`${apiBase()}/v1/organizations/${seeded.homeOrgId}/invitations`, {
    headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': 'e2e' },
    data: { email: 'friend@example.com', role: 'viewer' },
  });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).code).toBe('PLAN_REQUIRED');
});

// ---------------------------------------------------------------------------
// Single sign-on and the audit trail, from the real binary
// ---------------------------------------------------------------------------

test('single sign-on keeps its states apart and says when it cannot be set up here', async ({ page, context }) => {
  await signInAs(context, 'owner');
  await choose(page, seeded.orgId);
  await page.goto('/organization/sign-in');
  const states = page.getByTestId('sso-states');
  await expect(states).toContainText('not yet');
  await expect(states).toContainText('optional');
  // This development server holds no provider credentials, so setting up is
  // refused by the server in words — not by a broken button.
  await page.getByRole('button', { name: 'Set up single sign-on' }).click();
  await expect(page.getByRole('alert')).toContainText(/no identity provider configured/i);
  await expect(page.getByLabel(/identity provider organisation/i)).toHaveCount(0);
});

test('the audit trail names who did it', async ({ page, context }) => {
  await signInAs(context, 'owner');
  await choose(page, seeded.orgId);
  // Something attributable, made through the API.
  const made = await page.request.post(`${apiBase()}/v1/organizations/${seeded.orgId}/invitations`, {
    headers: { 'Content-Type': 'application/json', 'X-Nodeau-Request': 'e2e' },
    data: { email: 'audited-21@example.com', role: 'viewer' },
  });
  expect(made.status()).toBe(201);
  await page.goto('/usage');
  const audit = page.getByTestId('audit-events');
  await expect(audit.getByRole('columnheader', { name: 'Who' })).toBeVisible();
  await expect(audit.locator('tr', { hasText: 'invitation.created' }).first()).toContainText('Ada Owner');
  await expect(page.getByTestId('audit-retention')).toContainText('Kept indefinitely');
});

// ---------------------------------------------------------------------------
// Phone width: every Phase 21 surface fits
// ---------------------------------------------------------------------------

test('every organisation section fits a phone without sideways scrolling', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInAs(context, 'owner');
  await choose(page, seeded.orgId);
  for (const path of ['/organization', '/organization/teams', '/organization/service-accounts',
    '/organization/sign-in', '/organization/settings', '/usage']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/loading/i)).toHaveCount(0, { timeout: 10_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  }
});

test('a member of no organisation cannot read this one', async ({ page, context }) => {
  await signInAs(context, 'solo');
  await page.goto('/');
  const response = await page.request.get(`${apiBase()}/v1/organizations/${seeded.orgId}/members`);
  expect(response.status()).toBe(404);
});
