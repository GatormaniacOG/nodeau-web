import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { Me, RolloutList, RolloutPlan, RolloutView } from '../src/lib/api';

/**
 * Fleet rollouts — Phase 18B.
 *
 * # What these prove and what they do not
 *
 * Not that anybody is refused, and not that a machine upgrades: those are the
 * server's and the machine's, proved against the real API and on hardware.
 * What these prove is that the console AUTHORISES WHAT IT SHOWED — the plan's
 * own identity, after the person has confirmed the downtime — offers nothing
 * the server said this person may not do, withdraws a confirmation the server
 * refused because the plan moved, and never renders "asked for" as "done".
 */

const ORG = 'org1';
const BASE = `/v1/organizations/${ORG}/fleet/lifecycle`;

const ME: Me = {
  user: { id: 'u1', email: 'owner@acme.example', displayName: 'Sam Rivers' },
  organizations: [{ id: ORG, name: 'Acme', slug: 'acme', kind: 'personal', role: 'owner' }],
};

type Reply = { status: number; body: unknown };
let routes: Map<string, Reply>;
let sent: { method: string; path: string; body?: string }[];

const key = (method: string, path: string) => `${method} ${path}`;
const reply = (method: string, path: string, body: unknown, status = 200) =>
  routes.set(key(method, path), { status, body });

beforeEach(() => {
  routes = new Map();
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = new URL(url).pathname;
      const method = init?.method ?? 'GET';
      sent.push({ method, path, body: init?.body as string | undefined });
      const match = routes.get(key(method, path));
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
  window.history.pushState({}, '', '/fleet/upgrade');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function plan(over: Partial<RolloutPlan> = {}): RolloutPlan {
  return {
    state: 'ready',
    target: { Channel: 'beta', Version: 'v0.15.0-beta.3', Commit: 'abcdef1234567890' },
    hash: 'plan-hash-the-person-saw',
    notes: ['maintenance window: none is set (set in your organisation’s account)'],
    machines: [
      {
        key: 'uid-a', name: 'nodeforge', controlPlane: true, state: 'ready', from: 'v0.15.0-beta.2',
        to: 'v0.15.0-beta.3', order: 2,
        impact: { serving: 1, downtime: true, summary: 'qwen-local stops and starts again on this machine' },
      },
      {
        key: 'uid-c', name: 'nodeau-c', state: 'ready', from: 'v0.15.0-beta.2', to: 'v0.15.0-beta.3', order: 1,
        impact: { serving: 0, downtime: false, summary: 'nothing is running here' },
      },
    ],
    ...over,
  };
}

function view(over: Partial<RolloutView['operation']> = {}, extra: Partial<RolloutView> = {}): RolloutView {
  return {
    operation: {
      id: 'op-1', generation: 1, state: 'in-progress', createdAt: new Date().toISOString(),
      target: { channel: 'beta', version: 'v0.15.0-beta.3', commit: 'abcdef12' },
      authorizedBy: 'owner@acme.example', run: { seq: 1, attempt: 1 },
      steps: [
        { seq: 1, machineKey: 'uid-c', machineName: 'nodeau-c', from: 'v0.15.0-beta.2', to: 'v0.15.0-beta.3',
          state: 'in-progress', phase: 'rolling', attempt: 1 },
        { seq: 2, machineKey: 'uid-a', machineName: 'nodeforge', controlPlane: true, from: 'v0.15.0-beta.2',
          to: 'v0.15.0-beta.3', state: 'pending', attempt: 1 },
      ],
      ...over,
    },
    observed: {
      'uid-c': { version: 'v0.15.0-beta.2', reportedAt: new Date().toISOString(), present: true },
      'uid-a': { version: 'v0.15.0-beta.2', reportedAt: new Date().toISOString(), present: true },
    },
    ...extra,
  };
}

function list(over: Partial<RolloutList> = {}): RolloutList {
  return { operations: [], mayUpgrade: true, ...over };
}

describe('fleet upgrade page', () => {
  it('authorises THE PLAN IT SHOWED, and only after the downtime is confirmed', async () => {
    reply('GET', `${BASE}/operations`, list());
    reply('POST', `${BASE}/plan`, plan());
    reply('POST', `${BASE}/operations`, view(), 201);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Plan' }));
    // The worker first, the control plane last — the plan's own order.
    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('nodeau-c');
    expect(rows[1]).toHaveTextContent('nodeforge');
    expect(rows[1]).toHaveTextContent('qwen-local stops and starts again');

    const go = screen.getByRole('button', { name: /Authorise upgrading 2 machine/ });
    expect(go).toBeDisabled();
    // No override is offered when no machine is waiting for a window.
    expect(screen.queryByText(/outside our maintenance window/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /stop and start again/ }));
    expect(go).toBeEnabled();
    await user.click(go);

    await waitFor(() => expect(sent.some((r) => r.method === 'POST' && r.path === `${BASE}/operations`)).toBe(true));
    const body = JSON.parse(sent.find((r) => r.method === 'POST' && r.path === `${BASE}/operations`)!.body!);
    expect(body).toEqual({ channel: 'beta', planHash: 'plan-hash-the-person-saw', windowOverride: false });
  });

  it('offers nothing the server said this person may not do, and says why', async () => {
    reply('GET', `${BASE}/operations`, list({
      mayUpgrade: false,
      whyNot: 'Your role (member) does not include fleet.upgrade.',
    }));
    reply('POST', `${BASE}/plan`, plan());
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Plan' }));
    expect(await screen.findByText(/does not include fleet.upgrade/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authorise/ })).not.toBeInTheDocument();
  });

  it('withdraws the confirmation when the server says the plan moved', async () => {
    reply('GET', `${BASE}/operations`, list());
    reply('POST', `${BASE}/plan`, plan());
    reply('POST', `${BASE}/operations`, {
      code: 'CONFLICT',
      message: 'The plan changed since it was looked at — a machine reported in, the channel moved or a policy changed.',
    }, 409);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Plan' }));
    await user.click(await screen.findByRole('checkbox', { name: /stop and start again/ }));
    await user.click(screen.getByRole('button', { name: /Authorise/ }));
    expect(await screen.findByText(/The plan changed since it was looked at/)).toBeInTheDocument();
    // What they confirmed is no longer what would run.
    expect(screen.queryByRole('button', { name: /Authorise/ })).not.toBeInTheDocument();
  });

  it('offers the window override only when a machine waits for the window, and sends it', async () => {
    const waiting = plan();
    waiting.state = 'waiting';
    waiting.machines = waiting.machines!.map((m) => ({ ...m, state: 'waiting' as const }));
    reply('GET', `${BASE}/operations`, list());
    reply('POST', `${BASE}/plan`, waiting);
    reply('POST', `${BASE}/operations`, view(), 201);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Plan' }));
    await user.click(await screen.findByRole('checkbox', { name: /stop and start again/ }));
    await user.click(screen.getByRole('checkbox', { name: /outside our maintenance window/ }));
    await user.click(screen.getByRole('button', { name: /Authorise/ }));
    await waitFor(() => expect(sent.some((r) => r.method === 'POST' && r.path === `${BASE}/operations`)).toBe(true));
    const body = JSON.parse(sent.find((r) => r.method === 'POST' && r.path === `${BASE}/operations`)!.body!);
    expect(body.windowOverride).toBe(true);
  });

  it('shows a held rollout: asked for BESIDE reported, the hold, and resume', async () => {
    const held = view(
      {
        state: 'held', run: undefined, holdReason: 'VerifyFailed',
        holdDetail: 'step 1 (nodeau-c): the agent did not report v0.15.0-beta.3. Rolled back: nodeau-c reports v0.15.0-beta.2 again.',
        steps: [
          { seq: 1, machineKey: 'uid-c', machineName: 'nodeau-c', from: 'v0.15.0-beta.2', to: 'v0.15.0-beta.3',
            state: 'failed', attempt: 1, reason: 'VerifyFailed', detail: 'Rolled back.' },
          { seq: 2, machineKey: 'uid-a', machineName: 'nodeforge', controlPlane: true, from: 'v0.15.0-beta.2',
            to: 'v0.15.0-beta.3', state: 'pending', attempt: 1 },
        ],
      },
    );
    reply('GET', `${BASE}/operations`, list({ operations: [held] }));
    reply('POST', `${BASE}/operations/op-1/resume`, view());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/Held.*VerifyFailed/);
    // The step says what was ASKED and what the machine REPORTS — never the
    // first as though it were the second.
    const step = screen.getAllByRole('listitem')[0];
    expect(step).toHaveTextContent('asked: v0.15.0-beta.2 → v0.15.0-beta.3');
    expect(step).toHaveTextContent('reports v0.15.0-beta.2');
    // No plan form while a rollout is unfinished.
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await waitFor(() =>
      expect(sent.some((r) => r.method === 'POST' && r.path === `${BASE}/operations/op-1/resume`)).toBe(true),
    );
  });

  it('says why a machine has not started when it waits for the window', async () => {
    const pending = view({ state: 'authorized' }, { waiting: 'nodeau-c waits: your organisation’s maintenance window is not open. It next opens at 2026-09-25T02:00:00Z.' });
    pending.operation.steps = pending.operation.steps!.map((s, i) =>
      i === 0 ? { ...s, state: 'pending' as const, phase: undefined } : s,
    );
    reply('GET', `${BASE}/operations`, list({ operations: [pending], mayUpgrade: false }));
    render(<App />);
    expect(await screen.findByText(/nodeau-c waits: .*next opens/)).toBeInTheDocument();
    // A person who may not steer it is offered nothing to press.
    expect(screen.queryByRole('button', { name: /Cancel rollout|Resume/ })).not.toBeInTheDocument();
  });
});
