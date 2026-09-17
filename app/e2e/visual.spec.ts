import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { e2e } from '../playwright.config';
import { psql } from './prepare';

/**
 * The console, every page, at five widths — the visual audit.
 *
 * # Off by default
 *
 * Runs only with `NODEAU_VISUAL=1`: it takes a few hundred screenshots, and the
 * ordinary browser suite is about behaviour. `NODEAU_VISUAL_DIR` says where the
 * pictures go.
 *
 * # Pictures, and the properties a picture shows
 *
 * A screenshot is for a person to look at. Beside each one this measures the
 * layout faults the audit is about, so the before-and-after is a table as well
 * as an impression:
 *
 *   overflow     the page scrolls sideways at this width
 *   lightControl a form control painted light on the dark console
 *   ribbon       a label or option squeezed so narrow it wraps a word or a
 *                character per line
 *   clipped      a text field too narrow for the value or placeholder it shows
 *
 * With `NODEAU_VISUAL_STRICT=1` any of those fails the test — the acceptance
 * gate. Without it they are recorded in `findings.json`.
 *
 * # The fleet is THIS project's, as it really is
 *
 * Two machines, the RTX 5060 Ti and the RTX 3080 by their real UUIDs, the
 * model ids the catalogue really ships, a refused two-card workload. Long real
 * values are what break a layout; placeholder data does not.
 */

const VISUAL = process.env.NODEAU_VISUAL === '1';
const STRICT = process.env.NODEAU_VISUAL_STRICT === '1';
const OUT = resolve(process.env.NODEAU_VISUAL_DIR ?? 'test-results/visual');

const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1280', width: 1280, height: 800 },
  { name: '768', width: 768, height: 1024 },
  { name: '390', width: 390, height: 844 },
];

const seeded = { orgId: '', ownerId: '', installationId: '', credential: '', machineId: '' };

function sessionFor(label: string): { token: string; sha: string } {
  const token = `e2e-visual-${label}-token`;
  return { token, sha: createHash('sha256').update(token).digest('hex') };
}

function apiBase(): string {
  return `http://127.0.0.1:${process.env.NODEAU_E2E_API_PORT ?? '8099'}`;
}

test.skip(!VISUAL, 'the visual audit runs only with NODEAU_VISUAL=1');

test.beforeAll(async ({ request }) => {
  if (!VISUAL) return;
  const dsn = e2e.scopedDSN;
  const existing = psql(dsn, `SELECT id FROM organizations WHERE slug = 'visual-audit'`);
  if (existing) {
    seeded.orgId = existing;
  } else {
    seeded.orgId = psql(
      dsn,
      `INSERT INTO organizations (kind, name, slug)
       VALUES ('team', 'Home lab', 'visual-audit') RETURNING id`,
    );
    const owner = psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name)
       VALUES ('owner-visual@example.com', 'test', 'owner-visual', 'Fleet Owner') RETURNING id`,
    );
    const member = psql(
      dsn,
      `INSERT INTO users (email, auth_provider, auth_subject, display_name)
       VALUES ('member-visual@example.com', 'test', 'member-visual', 'A Colleague') RETURNING id`,
    );
    psql(
      dsn,
      `INSERT INTO organization_memberships (organization_id, user_id, role)
       VALUES ('${seeded.orgId}', '${owner}', 'owner'), ('${seeded.orgId}', '${member}', 'member')`,
    );
    psql(
      dsn,
      `INSERT INTO auth_sessions (user_id, session_token_sha256, expires_at)
       VALUES ('${owner}', '${sessionFor('owner').sha}', now() + interval '4 hours')`,
    );
    psql(
      dsn,
      `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
       VALUES ('${seeded.orgId}', 'home-pro', 'active', now() + interval '90 days')`,
    );
    seeded.ownerId = owner;
  }
  seeded.ownerId =
    seeded.ownerId || psql(dsn, `SELECT id FROM users WHERE email = 'owner-visual@example.com'`);

  seeded.installationId =
    psql(dsn, `SELECT id FROM installations WHERE organization_id = '${seeded.orgId}' LIMIT 1`) ||
    psql(
      dsn,
      `INSERT INTO installations (organization_id, name)
       VALUES ('${seeded.orgId}', 'nodeforge-hp-qual') RETURNING id`,
    );
  // What an installation reports when it refreshes its entitlement, so the
  // overview and the installation page show what a live one shows.
  psql(
    dsn,
    `UPDATE installations
        SET nodeau_version = 'v0.14.0-beta.3', node_count = 2, gpu_count = 2,
            last_seen_at = now() - interval '2 minutes'
      WHERE id = '${seeded.installationId}'`,
  );
  seeded.credential = `nodeau-inst-v1.${seeded.installationId}.visual-audit-secret-value-32-bytes`;
  const credHash = createHash('sha256').update(seeded.credential).digest('hex');
  if (!psql(dsn, `SELECT 1 FROM installation_credentials WHERE installation_id = '${seeded.installationId}'`)) {
    psql(
      dsn,
      `INSERT INTO installation_credentials (installation_id, token_sha256, token_prefix)
       VALUES ('${seeded.installationId}', '${credHash}', 'nodeau-inst-v1.${seeded.installationId}')`,
    );
  }

  const caps = [
    'fleet.report', 'policy.set', 'workload.run', 'workload.stop', 'logs.tail',
    'machine.drain', 'machine.maintenance', 'power.budget', 'governance.set',
  ];
  const response = await request.post(`${apiBase()}/v1/fleet/sync`, {
    headers: { Authorization: `Bearer ${seeded.credential}`, 'X-Nodeau-Request': '1' },
    data: {
      protocolVersion: 1,
      observedHash: 'visual-1',
      observed: {
        nodeauVersion: 'v0.14.0-beta.3',
        machines: [
          {
            machineKey: '43d1a889da6943b5b788c6216a0c9cc0',
            name: 'nodeforge',
            platform: 'linux/amd64',
            osVersion: 'Ubuntu 24.04.4 LTS',
            role: 'control-plane',
            executionPlane: 'kubernetes',
            nodeauVersion: 'v0.14.0-beta.3',
            capabilities: caps,
            schedulingState: 'active',
            health: 'healthy',
            localOnline: true,
            gpus: [
              {
                uuid: 'GPU-c080d9be-9a09-0895-7162-fdb28011a7fd',
                ordinal: 1,
                model: 'NVIDIA GeForce RTX 5060 Ti',
                vramTotalMib: 15827,
                vramUsedMib: 5527,
                temperatureC: 44,
                healthy: true,
                schedulable: true,
              },
            ],
          },
          {
            machineKey: 'c2014b83e8d6414e8b93b57677e1058b',
            name: 'nodeau-c',
            platform: 'linux/amd64',
            osVersion: 'Ubuntu 24.04.4 LTS',
            role: 'worker',
            executionPlane: 'kubernetes',
            nodeauVersion: 'v0.14.0-beta.3',
            capabilities: caps,
            schedulingState: 'active',
            schedulingMode: 'balanced',
            health: 'healthy',
            localOnline: true,
            gpus: [
              {
                uuid: 'GPU-01237950-6ca5-4857-9f38-99178f546533',
                ordinal: 1,
                model: 'NVIDIA GeForce RTX 3080',
                vramTotalMib: 9877,
                vramUsedMib: 312,
                temperatureC: 38,
                healthy: true,
                schedulable: true,
              },
            ],
          },
        ],
        workloads: [
          {
            name: 'qwen-local',
            machineKey: '43d1a889da6943b5b788c6216a0c9cc0',
            type: 'service',
            task: 'chat',
            model: 'qwen3-8b-q4km',
            state: 'serving',
            gpuCount: 1,
            deviceUuids: ['GPU-c080d9be-9a09-0895-7162-fdb28011a7fd'],
            schedulingMode: 'balanced',
            placementSummary:
              'already placed here and still fits; 9,788 MiB of projected headroom on the NVIDIA GeForce RTX 5060 Ti',
          },
          {
            name: 'qwen38',
            type: 'service',
            task: 'chat',
            model: 'qwen3.8-27b-q4km',
            state: 'refused',
            reasonCode: 'IncompatibleDeviceSet',
            reasonDetail:
              'No machine in this fleet has two cards that can hold qwen3.8-27b-q4km together; it needs about 17,200 MiB across two cards in one machine.',
            gpuCount: 2,
          },
        ],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  seeded.machineId = psql(
    dsn,
    `SELECT id FROM fleet_machines WHERE installation_id = '${seeded.installationId}' AND reported_name = 'nodeau-c'`,
  );

  // Usage and an audit trail, so those pages have rows to lay out.
  psql(
    dsn,
    `INSERT INTO usage_intervals
       (usage_id, organization_id, installation_id, workload_kind, workload_name,
        replica, generation, node_name, device_uuids, model_id, started_at, ended_at)
     VALUES ('visual-1', '${seeded.orgId}', '${seeded.installationId}', 'service', 'qwen-local',
             0, 0, 'nodeforge', ARRAY['GPU-c080d9be-9a09-0895-7162-fdb28011a7fd'], 'qwen3-8b-q4km',
             now() - interval '6 hours', now() - interval '5 minutes'),
            ('visual-2', '${seeded.orgId}', '${seeded.installationId}', 'batch', 'nightly-summaries',
             0, 0, 'nodeau-c', ARRAY['GPU-01237950-6ca5-4857-9f38-99178f546533'], 'qwen3-4b-q4km',
             now() - interval '3 hours', now() - interval '2 hours')
     ON CONFLICT (usage_id) DO NOTHING`,
  );
  if (!psql(dsn, `SELECT 1 FROM teams WHERE organization_id = '${seeded.orgId}'`)) {
    psql(
      dsn,
      `INSERT INTO teams (organization_id, name, slug, role)
       VALUES ('${seeded.orgId}', 'Platform engineering', 'platform-engineering', 'member')`,
    );
    const account = psql(
      dsn,
      `INSERT INTO service_accounts (organization_id, name, description, role, created_by_user_id)
       VALUES ('${seeded.orgId}', 'nightly-pipeline', 'Starts the nightly batch summaries', 'member', '${seeded.ownerId}')
       RETURNING id`,
    );
    const keySha = createHash('sha256').update('visual-audit-not-a-real-key').digest('hex');
    psql(
      dsn,
      `INSERT INTO service_account_keys (service_account_id, name, token_sha256, token_prefix, scope)
       VALUES ('${account}', 'deploy pipeline', '${keySha}', 'nodeau-sak-v1.visual',
               ARRAY['fleet.view', 'fleet.operate', 'workload.logs.read'])`,
    );
  }
  psql(
    dsn,
    `INSERT INTO security_audit_events (event_type, organization_id, actor_user_id, target, result)
     VALUES ('fleet.governance_changed', '${seeded.orgId}', '${seeded.ownerId}', '${seeded.installationId}', 'applied'),
            ('fleet.channel_policy_changed', '${seeded.orgId}', '${seeded.ownerId}', '${seeded.installationId}', 'refused')`,
  );
});

async function signIn(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'nodeau_session',
      value: sessionFor('owner').token,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

interface Finding {
  page: string;
  viewport: string;
  kind: 'overflow' | 'lightControl' | 'ribbon' | 'clipped';
  detail: string;
}
const findings: Finding[] = [];

/** measure reads the three layout faults off the live DOM. */
async function measure(page: Page, label: string, viewport: string): Promise<Finding[]> {
  const raw = await page.evaluate(() => {
    const out: { kind: string; detail: string }[] = [];
    const doc = document.documentElement;
    // No tolerance: a popup one pixel past the edge is a page that scrolls.
    if (doc.scrollWidth > window.innerWidth) {
      out.push({ kind: 'overflow', detail: `scrollWidth ${doc.scrollWidth} > ${window.innerWidth}` });
    }
    const luminance = (css: string): number | null => {
      const m = css.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      if (m[4] !== undefined && Number(m[4]) < 0.05) return null; // transparent
      const channel = (v: string | undefined) => Number(v ?? 0) / 255;
      return 0.2126 * channel(m[1]) + 0.7152 * channel(m[2]) + 0.0722 * channel(m[3]);
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    for (const el of Array.from(document.querySelectorAll('input, select, textarea'))) {
      const type = (el as HTMLInputElement).type;
      if (['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(type)) continue;
      if (!visible(el)) continue;
      const l = luminance(getComputedStyle(el).backgroundColor);
      if (l !== null && l > 0.5) {
        const id = (el as HTMLElement).id || el.getAttribute('aria-label') || el.tagName.toLowerCase();
        out.push({ kind: 'lightControl', detail: `${id} background luminance ${l.toFixed(2)}` });
      }
    }
    // A text block whose lines hold one word each: many lines, a word wide.
    //
    // LINES ARE COUNTED FROM THE TEXT'S OWN BOXES, not from the element's
    // height: a table cell's padding or a control inside a label made a
    // two-line cell read as four. The text of a <select>'s options is not the
    // label's text and is left out.
    const lineCount = (el: Element): { lines: number; text: string } => {
      const tops = new Set<number>();
      let text = '';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement?.closest('select, option, [aria-hidden="true"]')) continue;
        const value = n.textContent ?? '';
        if (value.trim() === '') continue;
        text += value;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width > 0) tops.add(Math.round(r.top / 4));
        }
      }
      return { lines: tops.size, text: text.replace(/\s+/g, ' ').trim() };
    };
    const texts = document.querySelectorAll(
      'label, [role="option"], .choice-list li, .field > span, legend, .badge, button, td, th, .cap, dd, dt',
    );
    for (const el of Array.from(texts)) {
      if (!visible(el)) continue;
      const { lines, text } = lineCount(el);
      if (text.length < 12) continue;
      const words = text.split(' ').length;
      const width = Math.round(el.getBoundingClientRect().width);
      if (lines >= 3 && lines >= Math.min(words, 4) && width < 140) {
        out.push({ kind: 'ribbon', detail: `"${text.slice(0, 48)}" in ${lines} lines, ${width}px wide` });
      }
    }
    // A control narrower than the text it is showing: its value is cut off.
    for (const el of Array.from(document.querySelectorAll('input[placeholder], input[value]'))) {
      const input = el as HTMLInputElement;
      if (!visible(input) || ['checkbox', 'radio', 'hidden'].includes(input.type)) continue;
      const shown = input.value || input.placeholder;
      if (!shown) continue;
      const style = getComputedStyle(input);
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font};letter-spacing:${style.letterSpacing};text-transform:${style.textTransform}`;
      probe.textContent = shown;
      document.body.appendChild(probe);
      const needed = probe.getBoundingClientRect().width;
      probe.remove();
      const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (needed > room + 1 && input.type !== 'number') {
        const id = input.id || input.getAttribute('aria-label') || 'input';
        out.push({ kind: 'clipped', detail: `${id}: "${shown.slice(0, 32)}" needs ${Math.round(needed)}px, has ${Math.round(room)}px` });
      }
    }
    return out;
  });
  return raw.map((f) => ({ page: label, viewport, kind: f.kind as Finding['kind'], detail: f.detail }));
}

const PAGES: { label: string; path: () => string; prepare?: (page: Page) => Promise<void> }[] = [
  { label: 'dashboard', path: () => '/' },
  { label: 'installations', path: () => '/installations' },
  { label: 'installation', path: () => `/installations/${seeded.installationId}` },
  { label: 'fleet', path: () => '/fleet' },
  { label: 'machine', path: () => `/fleet/machines/${seeded.machineId}` },
  { label: 'workloads', path: () => '/fleet/workloads' },
  { label: 'run', path: () => '/fleet/run' },
  { label: 'governance', path: () => '/fleet/governance' },
  {
    label: 'governance-open',
    path: () => '/fleet/governance',
    prepare: async (page) => {
      await page.getByLabel('Only these models').check();
      await page.getByLabel('Only these cards').check();
      await page.getByLabel('Only these machines').check();
      const combo = page.getByRole('combobox', { name: /add a model/i });
      await combo.click();
      await page.waitForTimeout(300);
    },
  },
  {
    label: 'run-open',
    path: () => '/fleet/run',
    prepare: async (page) => {
      await page.locator('#run-model').click();
      await page.waitForTimeout(300);
    },
  },
  { label: 'usage', path: () => '/usage' },
  { label: 'organization', path: () => '/organization' },
  {
    label: 'organization-teams',
    path: () => '/organization',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Teams' }).click();
      await page.getByText('Platform engineering').waitFor();
    },
  },
  {
    label: 'organization-accounts',
    path: () => '/organization',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Service accounts' }).click();
      await page.getByRole('button', { name: /manage keys/i }).click();
      await page.getByText('deploy pipeline').waitFor();
    },
  },
  {
    label: 'organization-sso',
    path: () => '/organization',
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Single sign-on' }).click();
      await page.getByText('Directory sync').waitFor();
    },
  },
  { label: 'plan', path: () => '/plan' },
  { label: 'billing', path: () => '/billing' },
  { label: 'settings', path: () => '/settings' },
  { label: 'activate', path: () => '/activate' },
  { label: 'notfound', path: () => '/no-such-page' },
];

for (const vp of VIEWPORTS) {
  test.describe(`at ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const p of PAGES) {
      test(`${p.label}`, async ({ page, context }) => {
        await signIn(context);
        await page.goto(p.path());
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main, [role="main"], body').first()).toBeVisible();
        if (p.prepare) await p.prepare(page);
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: resolve(OUT, `${p.label}-${vp.name}.png`), fullPage: true });
        const found = await measure(page, p.label, vp.name);
        findings.push(...found);
        if (STRICT) {
          expect(found, JSON.stringify(found, null, 1)).toEqual([]);
        }
      });
    }

    test('sign-in, signed out', async ({ page }) => {
      await page.goto('/signin');
      await page.waitForLoadState('networkidle');
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: resolve(OUT, `signin-${vp.name}.png`), fullPage: true });
      const found = await measure(page, 'signin', vp.name);
      findings.push(...found);
      if (STRICT) expect(found, JSON.stringify(found, null, 1)).toEqual([]);
    });
  });
}

test.afterAll(() => {
  if (!VISUAL) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, 'findings.json'), JSON.stringify(findings, null, 1));
});
