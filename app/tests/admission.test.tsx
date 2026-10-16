import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { AdmissionCard } from '../src/components/AdmissionCard';
import type { AdmissionPreview, FleetView, Me, Operation } from '../src/lib/api';

/**
 * Admission previews in the console — Phase 20I.
 *
 * Driven through a mocked `fetch` so the real client is exercised. What is
 * asserted is what this page could get WRONG in a way that matters: computing
 * a figure instead of showing the machine's, offering an override where the
 * limit is hard, losing the machine an override was accepted for, saying VRAM
 * about a Mac, and conveying a verdict by colour alone.
 */

const ME: Me = {
  user: { id: 'u1', email: 'person@example.com' },
  organizations: [{ id: 'org1', name: "Sam's workspace", slug: 'sam', kind: 'personal', role: 'owner' }],
};

/** The 36 GiB Mac's false refusal, as admission explains it. */
function softPreview(): AdmissionPreview {
  return {
    version: 1,
    id: 'pv1',
    decidedAt: '2026-10-14T18:00:00Z',
    expiresAt: '2026-10-14T18:05:00Z',
    outcome: 'Reject',
    reason: 'SafetyReserveViolation',
    message: 'No machine can run it as asked.',
    candidates: [
      {
        machine: 'pranavs-macbook-pro',
        eligible: false,
        summary: 'would need the safety reserve — short by 2,834 MiB',
        explanation: {
          version: 1,
          outcome: 'Reject',
          reason: 'SafetyReserveViolation',
          message: "It would fit inside Nodeau's 5,750 MiB safety reserve.",
          constraint: 'soft',
          machine: {
            name: 'pranavs-macbook-pro',
            accelerator: 'Apple M3 Pro',
            backend: 'metal',
            memoryKind: 'unified-memory',
          },
          confidence: 'conservative-estimate',
          evidence: { predictionSource: 'estimated-from-architecture', scope: 'derived' },
          memory: {
            kind: 'unified-memory',
            capacity: [
              { key: 'reclaimable-now', label: 'Memory free or reclaimable right now', mib: 7322, provenance: 'observed-current' },
              { key: 'accelerator-ceiling', label: 'Accelerator ceiling', mib: 28753, provenance: 'observed-current', informational: true },
            ],
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
            available: true,
            needs: ['soft-reserve'],
            reserveMiB: 5750,
            reserveWithOverrideMiB: 2048,
            hardFloorMiB: 2048,
            headroomWithOverrideMiB: 868,
            consequences: ['Other applications on this Mac will have less memory to work with while this model runs.'],
          },
        },
      },
      {
        machine: 'nodeforge',
        eligible: false,
        summary: 'GPU already allocated to qwen-local',
        explanation: {
          version: 1,
          outcome: 'Reject',
          reason: 'GPUAlreadyAllocated',
          constraint: 'hard',
          machine: { name: 'nodeforge', accelerator: 'NVIDIA GeForce RTX 5060 Ti', memoryKind: 'gpu-memory' },
          confidence: 'unknown',
          evidence: {},
        },
      },
    ],
  };
}

function fitsPreview(): AdmissionPreview {
  const p = softPreview();
  const mac = p.candidates![0]!;
  mac.selected = true;
  mac.eligible = true;
  mac.explanation.constraint = 'none';
  mac.explanation.override = undefined;
  mac.explanation.memory!.reserve = {
    totalMiB: 2560,
    hardFloorMiB: 2048,
    softMiB: 512,
    source: 'calibrated',
    defaultMiB: 5750,
    calibration: { id: 'c1', measuredAt: '2026-10-05T12:00:00Z', validUntil: '2026-11-04T12:00:00Z' },
  };
  mac.explanation.memory!.availableMiB = 4762;
  mac.explanation.memory!.headroomMiB = 356;
  p.outcome = 'Admit';
  p.selected = 'pranavs-macbook-pro';
  p.why = 'Placed on pranavs-macbook-pro: the only machine where it fits.';
  return p;
}

type Reply = { status: number; body: unknown };
let routes: Map<string, Reply[]>;
let calls: { method: string; url: string; body?: unknown }[];

function reply(method: string, path: string, body: unknown, status = 200) {
  const k = `${method} ${path}`;
  routes.set(k, [...(routes.get(k) ?? []), { status, body }]);
}

beforeEach(() => {
  routes = new Map();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const list = routes.get(`${method} ${new URL(url).pathname}`);
      const match = list && (list.length > 1 ? list.shift() : list[0]);
      if (!match) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'no route' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(match.body), {
        status: match.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  reply('GET', '/v1/me', ME);
  reply('GET', '/v1/organizations/org1/models', {
    policyApplied: false,
    models: [
      {
        id: 'qwen3.5-4b-q4km',
        displayName: 'Qwen3.5-4B Q4_K_M',
        family: 'Qwen3.5',
        parameters: '4B',
        role: 'Compact general',
        tasks: ['chat'],
        capabilities: ['chat'],
        status: 'active',
        featured: true,
        source: 'catalog',
        permitted: true,
      },
    ],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the admission card', () => {
  it('says where, what it costs and what is kept back — in words, not colour', () => {
    render(<AdmissionCard preview={fitsPreview()} />);
    expect(screen.getByText('Will run on')).toBeInTheDocument();
    expect(screen.getByText('pranavs-macbook-pro')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Fits');
    expect(screen.getAllByText(/unified memory/i).length).toBeGreaterThan(0);
    // A Mac is never VRAM.
    expect(screen.queryByText(/vram/i)).not.toBeInTheDocument();
    // The reserve says it was calibrated, and when.
    expect(screen.getAllByText('Calibrated').length).toBeGreaterThan(0);
    expect(screen.getByText(/measured 2026-10-05/)).toBeInTheDocument();
    // The figures are the machine's, formatted and nothing more.
    // 4,406 MiB is 4.3 GiB: the expected cost as admission computed it.
    const facts = screen.getByText('Expected cost', { selector: 'dt' }).nextElementSibling;
    expect(facts).toHaveTextContent(/^4\.3 GiB/);
  });

  it('offers a one-run override only where the obstacle is the soft reserve', async () => {
    const chosen: string[] = [];
    render(<AdmissionCard preview={softPreview()} onOverride={(c) => chosen.push(c.machine)} />);
    expect(screen.getByRole('status')).toHaveTextContent(/safety reserve, not by the hardware/);
    const offer = screen.getByRole('button', { name: /Run on pranavs-macbook-pro with a reduced safety reserve/ });
    // Nothing is offered for the machine whose limit is hard.
    expect(screen.queryByRole('button', { name: /nodeforge/ })).not.toBeInTheDocument();
    await userEvent.click(offer);
    expect(chosen).toEqual(['pranavs-macbook-pro']);
  });

  it('shows no override when every limit is hard', () => {
    const p = softPreview();
    p.candidates![0]!.explanation.constraint = 'hard';
    p.candidates![0]!.explanation.override = undefined;
    render(<AdmissionCard preview={p} onOverride={() => undefined} />);
    expect(screen.queryByRole('button', { name: /reduced safety reserve/ })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Will not fit as asked');
    expect(screen.getByText(/there is nothing to override/)).toBeInTheDocument();
  });

  it('keeps every other machine’s reason one click away', async () => {
    render(<AdmissionCard preview={fitsPreview()} />);
    const summary = screen.getByText('Other machines (1)');
    await userEvent.click(summary);
    expect(screen.getByText(/GPU already allocated to qwen-local/)).toBeVisible();
  });
});

describe('the run form previews first', () => {
  const previewOp: Operation = {
    id: 'op-preview',
    kind: 'admission.preview',
    state: 'requested',
    summary: 'See where a model would run.',
    requestedAt: new Date().toISOString(),
  };

  async function choose(user: ReturnType<typeof userEvent.setup>) {
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);
    await screen.findByRole('heading', { name: /run a workload/i });
    await user.type(screen.getByLabelText('Name'), 'qwen-mac');
    await user.click(screen.getByRole('combobox', { name: /model/i }));
    const list = await screen.findByRole('listbox');
    await user.click(within(list).getByText('Qwen3.5-4B Q4_K_M'));
  }

  it('asks the fleet, shows its answer, and scopes an accepted override to the machine shown', async () => {
    reply('POST', '/v1/organizations/org1/fleet/operations', previewOp, 202);
    reply('POST', '/v1/organizations/org1/fleet/operations', { ...previewOp, id: 'op-run', kind: 'workload.run' }, 202);
    reply('GET', '/v1/organizations/org1/fleet/operations/op-preview', { ...previewOp, state: 'observed' });
    reply('GET', '/v1/organizations/org1/fleet/previews/op-preview', {
      operationId: 'op-preview',
      preview: softPreview(),
      collectedAt: '2026-10-14T18:00:00Z',
      expiresAt: '2026-10-14T18:10:00Z',
    });
    const user = userEvent.setup();
    await choose(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    const asked = calls.find((c) => c.method === 'POST' && c.url.includes('/fleet/operations'));
    expect(asked?.body).toMatchObject({ kind: 'admission.preview', model: 'qwen3.5-4b-q4km' });
    // The machine's defaults are left out, not written: they mean the same
    // there, and an older Nodeau Cloud refuses fields it does not know.
    expect(asked?.body).not.toHaveProperty('contextSize');
    expect(asked?.body).not.toHaveProperty('parallel');

    const offer = await screen.findByRole(
      'button',
      { name: /Run on pranavs-macbook-pro with a reduced safety reserve/ },
      { timeout: 4000 },
    );
    await user.click(offer);
    // The recalculated arithmetic, shown before anything is accepted.
    const confirm = screen.getByRole('group', { name: /reduced safety reserve\?/ });
    expect(within(confirm).getByText('5.6 GiB')).toBeInTheDocument();
    expect(within(confirm).getByText(/2\.0 GiB \(the 2\.0 GiB floor stays\)/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Run with the reduced reserve' }));

    await waitFor(() => {
      const run = calls.filter((c) => c.method === 'POST' && c.url.includes('/fleet/operations'))[1];
      expect(run?.body).toMatchObject({
        kind: 'workload.run',
        workloadName: 'qwen-mac',
        model: 'qwen3.5-4b-q4km',
        spendSafetyReserve: true,
        overrideMachine: 'pranavs-macbook-pro',
        previewId: 'op-preview',
      });
    });
    const run = calls.filter((c) => c.method === 'POST' && c.url.includes('/fleet/operations'))[1];
    // Never a number from the browser: the machine computes the reserve.
    expect(screen.queryByRole('button', { name: /run anyway/i })).not.toBeInTheDocument();
    expect(JSON.stringify(run?.body)).not.toMatch(/reserveMiB|2048|headroom/i);
  });

  it('sends a context size only when it is not the default', async () => {
    reply('POST', '/v1/organizations/org1/fleet/operations', previewOp, 202);
    const user = userEvent.setup();
    await choose(user);
    const ctx = screen.getByLabelText('Context size');
    await user.clear(ctx);
    await user.type(ctx, '32768');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const asked = calls.find((c) => c.method === 'POST' && c.url.includes('/fleet/operations'));
    expect(asked?.body).toMatchObject({ kind: 'admission.preview', contextSize: 32768 });
  });

  it('shows the server’s own sentence when Nodeau Cloud does not ask, and keeps Run', async () => {
    reply(
      'POST',
      '/v1/organizations/org1/fleet/operations',
      { code: 'INVALID_REQUEST', message: 'The request body could not be read: json: unknown field "contextSize"' },
      400,
    );
    const user = userEvent.setup();
    await choose(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText(/Nodeau Cloud did not ask the fleet for a preview: The request body/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  it('runs as before when the fleet predates previews', async () => {
    reply(
      'POST',
      '/v1/organizations/org1/fleet/operations',
      { code: 'CONFLICT', message: 'No machine in this fleet can do that yet.' },
      409,
    );
    const user = userEvent.setup();
    await choose(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText(/run a Nodeau without previews/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });
});

describe('a Mac on the machine page', () => {
  it('shows unified memory and its calibration, never "did not report"', async () => {
    const view: FleetView = {
      installations: [
        {
          id: 'inst1',
          name: 'workstation',
          presence: 'online',
          connected: true,
          lastSyncAt: new Date().toISOString(),
          headline: 'Everything is running.',
          machines: [],
        },
      ],
    };
    reply('GET', '/v1/organizations/org1/fleet', view);
    reply('GET', '/v1/organizations/org1/fleet/workloads', { workloads: [] });
    reply('GET', '/v1/organizations/org1/fleet/machines/mac1', {
      id: 'mac1',
      name: 'pranavs-macbook-pro',
      reportedName: 'pranavs-macbook-pro',
      presence: 'online',
      health: 'healthy',
      schedulingState: 'active',
      executionPlane: 'native',
      capabilities: ['fleet.report', 'machine.drain'],
      gpus: [
        {
          uuid: 'apple-0123',
          ordinal: 1,
          model: 'Apple M3 Pro',
          healthy: true,
          schedulable: true,
          backend: 'metal',
          unifiedWorkingSetMib: 28753,
          calibration: {
            state: 'active',
            reserveMib: 2560,
            defaultMib: 5750,
            floorMib: 2048,
            source: 'calibrated',
            confidence: 'high',
            measuredAt: '2026-10-05T12:00:00Z',
            validUntil: '2026-11-04T12:00:00Z',
          },
        },
      ],
    });
    window.history.pushState({}, '', '/fleet/machines/mac1');
    render(<App />);
    expect(await screen.findByText(/a pool it shares with the rest of the system/)).toBeInTheDocument();
    expect(screen.getByText('28.1 GiB')).toBeInTheDocument();
    expect(screen.queryByText(/did not report this card's memory/)).not.toBeInTheDocument();
    expect(screen.getByText(/measured on this machine 2026-10-05/)).toBeInTheDocument();
  });
});
