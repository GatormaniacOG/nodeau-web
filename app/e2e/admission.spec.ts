import { expect, test, type BrowserContext, type APIRequestContext } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * Admission previews, in a real browser, against the real backend — Phase 20I.
 *
 * Real browser · the production bundle · the real `nodeau-cloud` binary · real
 * PostgreSQL 16. The fleet is a Linux machine and a Mac, reported through the
 * REAL `POST /v1/fleet/sync` as a 20I connector sends it (the Mac's unified
 * memory and its reserve calibration). When the page asks for a preview, this
 * test plays the connector: it reads the operation the server queued and
 * answers it through the same sync endpoint, with an answer shaped exactly as
 * the controller's (pkg/admissionview). What is proven is the hosted half: the
 * question is queued typed, the answer is stored and served, the card renders
 * the machine's figures, and an accepted override reaches the server scoped to
 * the machine the card named and to the preview that offered it.
 *
 * Its own person, organisation and fleet, so it depends on no other file's rows.
 */

const seed = { orgId: '', installationId: '', credential: '', sessionToken: '' };
const SECRET = 'e2e-admission-secret-value-32-byte';
const caps = ['fleet.report', 'workload.run', 'workload.stop', 'admission.preview'];

function apiURL(): string {
  return process.env.NODEAU_E2E_API_URL ?? `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

async function sha256Hex(value: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}

async function sync(request: APIRequestContext, body: Record<string, unknown>) {
  const response = await request.post(`${apiURL()}/v1/fleet/sync`, {
    headers: { Authorization: `Bearer ${seed.credential}`, 'X-Nodeau-Request': '1' },
    data: { protocolVersion: 1, ...body },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

const observed = {
  nodeauVersion: 'v0.19.0-e2e',
  machines: [
    {
      machineKey: 'adm-uid-a', name: 'nodeforge', role: 'control-plane', executionPlane: 'kubernetes',
      capabilities: caps, schedulingState: 'active', health: 'healthy', localOnline: true,
      gpus: [
        {
          uuid: 'GPU-adm-5060', ordinal: 0, model: 'NVIDIA GeForce RTX 5060 Ti', vramTotalMib: 16311,
          vramUsedMib: 5600, healthy: true, schedulable: true, backend: 'cuda',
          calibration: { state: 'default', reserveMib: 512, defaultMib: 512, floorMib: 0, source: 'default' },
        },
      ],
    },
    {
      machineKey: 'adm-uid-mac', name: 'pranavs-macbook-pro', role: 'native', executionPlane: 'native',
      capabilities: caps, schedulingState: 'active', health: 'healthy', localOnline: true,
      gpus: [
        {
          uuid: 'apple-adm-0001', ordinal: 0, model: 'Apple M3 Pro', healthy: true, schedulable: true,
          backend: 'metal', unifiedWorkingSetMib: 28753,
          calibration: {
            state: 'expired', reserveMib: 5750, defaultMib: 5750, floorMib: 2048, source: 'default',
            confidence: 'high', measuredAt: '2026-08-01T12:00:00Z', validUntil: '2026-08-31T12:00:00Z',
            note: 'The calibration measured on 2026-08-01 has expired; Nodeau is using its default reserve.',
          },
        },
      ],
    },
  ],
  workloads: [],
};

/** The fleet's answer, as the controller writes it: the Mac held back only by the soft reserve. */
function answer(id: string) {
  const mac = {
    version: 1, outcome: 'Reject', reason: 'SafetyReserveViolation', constraint: 'soft',
    message: "It would fit inside Nodeau's 5,750 MiB safety reserve.",
    machine: { name: 'pranavs-macbook-pro', accelerator: 'Apple M3 Pro', backend: 'metal', memoryKind: 'unified-memory' },
    confidence: 'conservative-estimate',
    evidence: { predictionSource: 'estimated-from-architecture', scope: 'derived' },
    memory: {
      kind: 'unified-memory',
      capacity: [{ key: 'reclaimable-now', label: 'Memory free or reclaimable right now', mib: 7322, provenance: 'observed-current' }],
      inUse: [],
      reserve: { totalMiB: 5750, hardFloorMiB: 2048, softMiB: 3702, source: 'default', defaultMiB: 5750 },
      availableMiB: 1572,
      demand: [
        { key: 'weights', label: 'Model weights', mib: 2614, provenance: 'estimated' },
        { key: 'kv-cache', label: 'Context (KV cache)', mib: 512, provenance: 'estimated' },
        { key: 'runtime-overhead', label: 'Runtime overhead', mib: 256, provenance: 'estimated' },
        { key: 'prediction-margin', label: 'Prediction margin', mib: 256, provenance: 'policy-reserve' },
        { key: 'estimate-margin', label: 'Allowance for unmeasured hardware', mib: 768, provenance: 'policy-reserve' },
      ],
      requiredMiB: 4406,
      headroomMiB: -2834,
    },
    override: {
      available: true, needs: ['soft-reserve'], reserveMiB: 5750, reserveWithOverrideMiB: 2048,
      hardFloorMiB: 2048, headroomWithOverrideMiB: 868,
      consequences: ['Other applications on this Mac will have less memory to work with while this model runs.'],
    },
  };
  return {
    version: 1, id, decidedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 300_000).toISOString(),
    outcome: 'Reject', reason: 'SafetyReserveViolation', message: 'No machine can run it as asked.',
    candidates: [
      { machine: 'pranavs-macbook-pro', eligible: false, summary: 'would need the safety reserve', explanation: mac },
      {
        machine: 'nodeforge', eligible: false, summary: 'GPU already allocated to qwen-local',
        explanation: {
          version: 1, outcome: 'Reject', reason: 'GPUAlreadyAllocated', constraint: 'hard',
          machine: { name: 'nodeforge', accelerator: 'NVIDIA GeForce RTX 5060 Ti', memoryKind: 'gpu-memory' },
          confidence: 'unknown', evidence: {},
        },
      },
    ],
  };
}

test.beforeAll(async ({ request }) => {
  const dsn = e2e.scopedDSN;
  let userId = psql(dsn, `SELECT id FROM users WHERE email = 'admission-e2e@example.com'`);
  if (!userId) {
    userId = psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name)
       VALUES ('admission-e2e@example.com', 'test', 'admission-e2e-subject', 'Admission Owner') RETURNING id`,
    );
  }
  let orgId = psql(dsn, `SELECT id FROM organizations WHERE slug = 'admission-e2e'`);
  if (!orgId) {
    orgId = psql(
      dsn,
      `INSERT INTO organizations (kind, name, slug)
       VALUES ('personal', 'Admission workspace', 'admission-e2e') RETURNING id`,
    );
    psql(dsn, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ('${orgId}', '${userId}', 'owner')`);
  }
  seed.orgId = orgId;
  seed.sessionToken = 'admission-e2e-session-token-value-1';
  const sessionHash = await sha256Hex(seed.sessionToken);
  if (!psql(dsn, `SELECT 1 FROM auth_sessions WHERE session_token_sha256 = '${sessionHash}'`)) {
    psql(
      dsn,
      `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
       VALUES ('${userId}', '${sessionHash}', now() + interval '1 hour')`,
    );
  }
  let installationId = psql(dsn, `SELECT id FROM installations WHERE name = 'admission-e2e'`);
  if (!installationId) {
    installationId = psql(
      dsn,
      `INSERT INTO installations (organization_id, name) VALUES ('${orgId}', 'admission-e2e') RETURNING id`,
    );
  }
  seed.installationId = installationId;
  seed.credential = `nodeau-inst-v1.${installationId}.${SECRET}`;
  if (!psql(dsn, `SELECT 1 FROM installation_credentials WHERE installation_id = '${installationId}'`)) {
    psql(
      dsn,
      `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
       VALUES ('${installationId}', '${await sha256Hex(seed.credential)}', 'nodeau-inst-v1.${installationId}')`,
    );
  }
  if (!psql(dsn, `SELECT 1 FROM subscriptions WHERE organization_id = '${orgId}'`)) {
    psql(
      dsn,
      `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
       VALUES ('${orgId}', 'home-pro', 'active', now() + interval '90 days')`,
    );
  }
  const body = await sync(request, { observedHash: 'admission-e2e-1', observed });
  expect(body.features, 'the server must advertise admission-v1').toContain('admission-v1');
});

async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'nodeau_session', value: seed.sessionToken, domain: '127.0.0.1', path: '/',
      httpOnly: true, secure: false, sameSite: 'Lax',
    },
  ]);
}

function machineId(machineKey: string): string {
  return psql(
    e2e.scopedDSN,
    `SELECT id FROM fleet_machines WHERE installation_id = '${seed.installationId}' AND machine_key = '${machineKey}'`,
  );
}

test.describe('admission previews, signed in', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('a Mac shows its unified memory and an expired calibration in words', async ({ page }) => {
    await page.goto(`/fleet/machines/${machineId('adm-uid-mac')}`);
    await expect(page.getByText(/a pool it shares with the rest of the system/)).toBeVisible();
    await expect(page.getByText('28.1 GiB')).toBeVisible();
    const line = page.locator('.calibration-line');
    await expect(line).toContainText('The calibration expired, so the conservative default is back in use.');
    await expect(line).toContainText('nodeau benchmark');
    await expect(page.getByText(/did not report this card's memory/)).toHaveCount(0);
  });

  test('preview, accept a one-run override, run: the server receives intent and a machine, never a number', async ({
    page,
    request,
  }, testInfo) => {
    // One database serves every browser project, so each asks under its own name.
    const name = `qwen-mac-${testInfo.project.name}`;
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill(name);
    await page.getByRole('combobox', { name: 'Model' }).click();
    await page.getByRole('listbox').getByRole('option').filter({ hasText: 'Qwen3.5-4B Q4_K_M' }).click();
    // The operation this page asked for, from the page's own response: an
    // earlier project's preview is in the same table and must not be answered.
    const asked = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith(`/organizations/${seed.orgId}/fleet/operations`),
    );
    await page.getByRole('button', { name: 'Preview' }).click();
    const opID: string = (await (await asked).json()).id;
    expect(opID).toBeTruthy();

    // The question was queued typed: the configuration, nothing else.
    const params = JSON.parse(
      psql(e2e.scopedDSN, `SELECT parameters::text FROM remote_operations WHERE id = '${opID}'`),
    );
    expect(params).toMatchObject({ model: 'qwen3.5-4b-q4km' });
    // The machine's defaults are left out, not written.
    expect(params).not.toHaveProperty('contextSize');

    // The connector answers.
    await sync(request, {
      observedHash: 'admission-e2e-1',
      operationResults: [{ id: opID, state: 'observed', preview: answer('pv-e2e') }],
    });

    const card = page.getByRole('region').filter({ hasText: 'Closest candidate' });
    await expect(card.getByRole('status')).toContainText("Held back by Nodeau's safety reserve, not by the hardware");
    await expect(card).toContainText('pranavs-macbook-pro');
    await expect(card).not.toContainText(/vram/i);
    await card.getByText('Show the arithmetic').click();
    await expect(card.getByRole('row', { name: /Allowance for unmeasured hardware/ })).toContainText('0.8 GiB');

    await card.getByRole('button', { name: /Run on pranavs-macbook-pro with a reduced safety reserve/ }).click();
    const confirm = page.getByRole('group', { name: /reduced safety reserve\?/ });
    await expect(confirm).toContainText('5.6 GiB');
    await confirm.getByRole('button', { name: 'Run with the reduced reserve' }).click();

    let run = '';
    await expect
      .poll(() => {
        run = psql(
          e2e.scopedDSN,
          `SELECT parameters::text FROM remote_operations
            WHERE installation_id = '${seed.installationId}' AND kind = 'workload.run'
              AND parameters->>'workloadName' = '${name}'`,
        );
        return run;
      })
      .not.toBe('');
    const ran = JSON.parse(run);
    expect(ran).toMatchObject({
      workloadName: name,
      model: 'qwen3.5-4b-q4km',
      spendSafetyReserve: 'true',
      overrideMachine: 'pranavs-macbook-pro',
      previewId: opID,
    });
    expect(run).not.toMatch(/2048|reserveMib|headroom/i);
  });

  test('the whole flow works from the keyboard', async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile-webkit', 'a phone has no keyboard');
    await page.goto('/fleet/run');
    await page.getByLabel('Name').fill(`qwen-keys-${testInfo.project.name}`);
    await page.getByRole('combobox', { name: 'Model' }).click();
    await page.getByRole('listbox').getByRole('option').filter({ hasText: 'Qwen3.5-4B Q4_K_M' }).click();
    const asked = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith(`/organizations/${seed.orgId}/fleet/operations`),
    );
    await page.getByRole('button', { name: 'Preview' }).focus();
    await page.keyboard.press('Enter');
    const opID: string = (await (await asked).json()).id;
    await sync(request, {
      observedHash: 'admission-e2e-1',
      operationResults: [{ id: opID, state: 'observed', preview: answer('pv-keys') }],
    });
    const offer = page.getByRole('button', { name: /with a reduced safety reserve/ });
    await offer.focus();
    await page.keyboard.press('Enter');
    // Focus lands on the question being asked.
    await expect(page.getByRole('heading', { name: /reduced safety reserve\?/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Run with the reduced reserve' })).toBeFocused();
    // Backing out keeps the reserve and sends nothing.
    await page.getByRole('button', { name: 'Keep the reserve' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: /reduced safety reserve\?/ })).toHaveCount(0);
    const runs = psql(
      e2e.scopedDSN,
      `SELECT count(*) FROM remote_operations WHERE installation_id = '${seed.installationId}'
         AND kind = 'workload.run' AND parameters->>'workloadName' = 'qwen-keys-${testInfo.project.name}'`,
    );
    expect(runs).toBe('0');
  });

  test('an override the preview did not offer is refused by the server, not the page', async ({ request }) => {
    const sessionCookie = `nodeau_session=${seed.sessionToken}`;
    const response = await request.post(`${apiURL()}/v1/organizations/${seed.orgId}/fleet/operations`, {
      headers: { Cookie: sessionCookie, 'X-Nodeau-Request': '1', Origin: 'http://127.0.0.1:4173' },
      data: {
        kind: 'workload.run', workloadName: 'qwen-c', model: 'qwen3.5-4b-q4km', contextSize: 4096, parallel: 1,
        spendSafetyReserve: true, overrideMachine: 'nodeforge', previewId: 'no-such-preview',
      },
    });
    expect([400, 404, 409]).toContain(response.status());
    expect(await response.text()).toMatch(/preview/i);
  });
});
