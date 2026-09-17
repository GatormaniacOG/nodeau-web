import { expect, test } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Choosing a model, in a real browser, against the real backend.
 *
 * # What is real here
 *
 * Real Chromium, the production bundle from `vite build`, the real
 * `nodeau-cloud` binary and real PostgreSQL. The catalogue the selector shows
 * is THE PRODUCT'S OWN — `internal/catalog` compiled into that binary — so a
 * name appearing in the dropdown is evidence about Nodeau's catalogue rather
 * than about a fixture in this file. Nothing here stubs a model list.
 *
 * The fleet arrives through the real `POST /v1/fleet/sync`, so the customer's
 * own imported model becomes selectable by the same path a connector would
 * make it selectable.
 *
 * # Its own person, organisation and fleet
 *
 * `fleet.spec.ts` learned this the hard way: sharing a fixture makes one file's
 * setup another file's failure. This one sets a GOVERNANCE POLICY, which would
 * change what every other file's fleet may run.
 */

const seed = {
  orgId: '',
  installationId: '',
  credential: '',
  sessionToken: 'models-e2e-session-token-value-01',
};

const CREDENTIAL_SECRET = 'e2e-models-secret-value-32-bytes-ok';

/** The capabilities this fleet's machine declares. The server never sends an
 *  operation a machine has not declared, so a policy write needs this. */
const CAPABILITIES = ['fleet.report', 'workload.run', 'workload.stop', 'governance.set'];

test.beforeAll(async ({ request }) => {
  const dsn = e2e.scopedDSN;

  let userId = psql(dsn, `SELECT id FROM users WHERE email = 'models-e2e@example.com'`);
  if (!userId) {
    userId = psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name)
       VALUES ('models-e2e@example.com', 'test', 'models-e2e-subject', 'Model Owner')
       RETURNING id`,
    );
  }
  let orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'models-e2e'`);
  if (!orgId) {
    orgId = psql(
      dsn,
      `INSERT INTO organizations (kind, name, slug)
       VALUES ('personal', 'Models workspace', 'models-e2e') RETURNING id`,
    );
    psql(
      dsn,
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ('${orgId}', '${userId}', 'owner')`,
    );
  }
  seed.orgId = orgId;

  const sessionHash = await sha256Hex(seed.sessionToken);
  if (!psql(dsn, `SELECT 1 FROM auth_sessions WHERE session_token_sha256 = '${sessionHash}'`)) {
    psql(
      dsn,
      `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
       VALUES ('${userId}', '${sessionHash}', now() + interval '1 hour')`,
    );
  }

  let installationId = psql(dsn, `SELECT id FROM installations WHERE name = 'models-e2e'`);
  if (!installationId) {
    installationId = psql(
      dsn,
      `INSERT INTO installations (organization_id, name) VALUES ('${orgId}', 'models-e2e')
       RETURNING id`,
    );
  }
  seed.installationId = installationId;

  seed.credential = `nodeau-inst-v1.${installationId}.${CREDENTIAL_SECRET}`;
  const hash = await sha256Hex(seed.credential);
  if (
    !psql(dsn, `SELECT 1 FROM installation_credentials WHERE installation_id = '${installationId}'`)
  ) {
    psql(
      dsn,
      `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
       VALUES ('${installationId}', '${hash}', 'nodeau-inst-v1.${installationId}')`,
    );
  }

  // Remote management is what a paid plan buys, and setting a policy from a
  // browser IS remote management.
  if (!psql(dsn, `SELECT 1 FROM subscriptions WHERE organization_id = '${orgId}'`)) {
    psql(
      dsn,
      `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
       VALUES ('${orgId}', 'home-pro', 'active', now() + interval '90 days')`,
    );
  }

  // THE FLEET ARRIVES THROUGH THE REAL ENDPOINT, carrying a workload on a model
  // the curated catalogue has never heard of — which is what a customer's own
  // imported GGUF looks like from Nodeau Cloud's side. It is a lightweight
  // fixture on purpose: importing a real multi-gigabyte artifact would prove
  // nothing this does not.
  const response = await request.post(`${apiURL()}/v1/fleet/sync`, {
    headers: { Authorization: `Bearer ${seed.credential}`, 'X-Nodeau-Request': '1' },
    data: {
      protocolVersion: 1,
      observedHash: 'models-e2e-1',
      observed: {
        nodeauVersion: 'v0.14.0-e2e',
        machines: [
          {
            machineKey: 'models-e2e-uid-a',
            name: 'nodeforge',
            platform: 'linux/amd64',
            role: 'control-plane',
            executionPlane: 'kubernetes',
            nodeauVersion: 'v0.14.0-e2e',
            capabilities: CAPABILITIES,
            schedulingState: 'active',
            health: 'healthy',
            localOnline: true,
            gpus: [
              {
                uuid: 'GPU-models-e2e-a1',
                ordinal: 1,
                model: 'NVIDIA GeForce RTX 5070 Ti',
                vramTotalMib: 15819,
                healthy: true,
                schedulable: true,
              },
            ],
          },
        ],
        workloads: [
          {
            name: 'my-assistant',
            machineKey: 'models-e2e-uid-a',
            type: 'service',
            task: 'chat',
            model: 'my-imported-gguf',
            state: 'serving',
            gpuCount: 1,
            deviceUuids: ['GPU-models-e2e-a1'],
          },
        ],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
});

function apiURL(): string {
  return process.env.NODEAU_E2E_API_PORT
    ? `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT}`
    : 'http://127.0.0.1:8099';
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** desiredWorkload reads the intent a connector would collect, PARSED.
 *
 *  This is the row that matters: a display name reaching it would be a
 *  workload no machine could resolve. */
function desiredWorkload(name: string): { model?: string; present?: boolean } {
  const value = psql(
    e2e.scopedDSN,
    `SELECT value FROM fleet_desired_state
      WHERE subject_kind = 'workload' AND subject_id = '${name}'`,
  );
  expect(value, `no desired state was recorded for ${name}`).not.toBe('');
  return JSON.parse(value) as { model?: string; present?: boolean };
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: seed.sessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
});

test.describe('the model selector', () => {
  test('offers the product’s own catalogue, not a list the page carries', async ({ page }) => {
    await page.goto('/fleet/run');
    await page.getByRole('combobox', { name: 'Model' }).click();

    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();

    // These names come out of `internal/catalog` inside the running Go binary.
    // The hardware ladder is visible in the order, which is the curation
    // surviving the trip to a browser.
    await expect(list.getByText('Qwen3.5-4B Q4_K_M')).toBeVisible();
    await expect(list.getByRole('group', { name: 'Nodeau models' })).toBeVisible();

    // A deprecated model is listed and told apart, because somebody's fleet
    // may be serving one.
    await expect(list.getByRole('group', { name: 'Superseded' })).toBeVisible();

    // The same catalogue under another task. This used to be asserted on the
    // CHAT form, which is the defect: an embedding model offered for a chat
    // run is refused by the machine a moment later.
    await page.keyboard.press('Escape');
    await page.selectOption('#run-task', 'embed');
    await page.getByRole('combobox', { name: 'Model' }).click();
    await expect(page.getByRole('listbox').getByText('Qwen3-Embedding 0.6B Q8_0')).toBeVisible();
  });

  test('sends the canonical id, and the fleet is told to run exactly that', async ({ page }) => {
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill('chosen-from-list');

    await page.getByRole('combobox', { name: 'Model' }).click();
    // CHOSEN BY THE NAME A PERSON READS. Nothing is typed.
    await page.getByRole('listbox').getByText('Qwen3.5-9B Q4_K_M').click();
    await expect(page.getByRole('combobox', { name: 'Model' })).toHaveValue('Qwen3.5-9B Q4_K_M');

    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByRole('heading', { name: /starting chosen-from-list/i })).toBeVisible();

    // THE PROOF IS IN THE INTENT THE CONNECTOR WOULD COLLECT, not in what the
    // page says. A display name reaching this row would be a workload no
    // machine could resolve.
    const stored = desiredWorkload('chosen-from-list');
    expect(stored.model).toBe('qwen3.5-9b-q4km');
    // And never the label. PARSED rather than substring-matched: jsonb decides
    // its own spacing, and a check that depended on it would be a fact about
    // PostgreSQL's renderer rather than about the value.
    expect(JSON.stringify(stored)).not.toContain('Qwen3.5-9B');
  });

  test('offers a model only this fleet knows about, and can start it', async ({ page }) => {
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill('second-copy');
    await page.getByRole('combobox', { name: 'Model' }).click();

    const group = page.getByRole('listbox').getByRole('group', { name: /fleet is running/i });
    await expect(group).toBeVisible();
    await expect(group.getByText('my-imported-gguf')).toBeVisible();
    // Nothing is claimed about what a model Nodeau Cloud has never profiled
    // can do.
    await expect(group.getByText(/does not know what these can do/i)).toBeVisible();

    await group.getByText('my-imported-gguf').first().click();
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByRole('heading', { name: /starting second-copy/i })).toBeVisible();

    expect(desiredWorkload('second-copy').model).toBe('my-imported-gguf');
  });

  test('refuses to submit with no model, in the browser that would submit it', async ({
    page,
  }) => {
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill('never-started');
    await page.getByRole('button', { name: 'Run' }).click();

    // The form is still the form. Chromium blocked it on the control's own
    // validity, which is the platform doing the work rather than a submit
    // handler that has to be right.
    await expect(page.getByRole('heading', { name: /run a workload/i })).toBeVisible();
    const message = await page
      .getByRole('combobox', { name: 'Model' })
      .evaluate((el) => (el as HTMLInputElement).validationMessage);
    expect(message).toMatch(/choose a model/i);

    // And nothing reached the fleet.
    const stored = psql(
      e2e.scopedDSN,
      `SELECT count(*) FROM fleet_desired_state
        WHERE subject_kind = 'workload' AND subject_id = 'never-started'`,
    );
    expect(stored).toBe('0');
  });

  test('a chat run offers only what can chat', async ({ page }) => {
    await page.goto('/fleet/run');

    await page.getByRole('combobox', { name: 'Model' }).click();
    const list = page.getByRole('listbox');
    await expect(list.getByText('Qwen3.5-9B Q4_K_M')).toBeVisible();
    // The task select reads "chat" and its value is empty. An embedding model
    // offered here would be refused by the machine a moment later.
    await expect(list.getByText('Qwen3-Embedding 0.6B Q8_0')).toHaveCount(0);
  });

  test('asks the server for the task rather than filtering in the browser', async ({ page }) => {
    await page.goto('/fleet/run');
    await page.selectOption('#run-task', 'embed');

    await page.getByRole('combobox', { name: 'Model' }).click();
    const list = page.getByRole('listbox');
    await expect(list.getByText('Qwen3-Embedding 0.6B Q8_0')).toBeVisible();
    // A chat model is ABSENT, and the absence comes from the catalogue's own
    // capability data rather than from anything this page knows about names.
    await expect(list.getByText('Qwen3.5-9B Q4_K_M')).toHaveCount(0);
  });
});

test.describe('a model policy the organisation set', () => {
  // POLICY ALLOWS ONE AND DENIES ANOTHER, written through the real API, and
  // the selector's answer is compared against the backend's — not recomputed.
  test.beforeAll(async ({ request }) => {
    const response = await request.put(
      `${apiURL()}/v1/organizations/${seed.orgId}/fleet/governance`,
      {
        headers: { 'X-Nodeau-Request': '1', Cookie: `nodeau_session=${seed.sessionToken}` },
        data: { governance: { allowedModels: ['qwen3.5-4b-q4km', 'my-imported-gguf'] } },
      },
    );
    expect(response.status(), await response.text()).toBeLessThan(300);
  });

  test.afterAll(async ({ request }) => {
    // Put it back, so a policy set here is not a fixture for anything else.
    await request.put(`${apiURL()}/v1/organizations/${seed.orgId}/fleet/governance`, {
      headers: { 'X-Nodeau-Request': '1', Cookie: `nodeau_session=${seed.sessionToken}` },
      data: { governance: { allowedModels: null } },
    });
  });

  test('shows what is refused, says why, and will not let it be chosen', async ({ page }) => {
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill('governed');
    await page.getByRole('combobox', { name: 'Model' }).click();

    const list = page.getByRole('listbox');
    const permitted = list.getByRole('option').filter({ hasText: 'Qwen3.5-4B Q4_K_M' });
    const refused = list.getByRole('option').filter({ hasText: 'Qwen3.5-9B Q4_K_M' });

    // SHOWN rather than hidden: somebody refused by a policy has to be able to
    // see the list that refused them.
    await expect(refused).toHaveAttribute('aria-disabled', 'true');
    await expect(refused).toContainText(/model policy does not include/i);
    await expect(permitted).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(/has a model policy/i)).toBeVisible();

    // Clicking it changes nothing. FORCED, because Chromium's own
    // accessibility semantics already refuse to click an `aria-disabled`
    // option — which is worth knowing and is not the assertion: what is being
    // proved is that the APPLICATION refuses it, not that the browser does.
    await refused.click({ force: true });
    await expect(page.getByRole('combobox', { name: 'Model' })).toHaveValue('');
    await permitted.click();
    await expect(page.getByRole('combobox', { name: 'Model' })).toHaveValue('Qwen3.5-4B Q4_K_M');
  });
});
