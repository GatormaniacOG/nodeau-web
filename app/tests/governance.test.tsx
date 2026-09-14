import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { FleetGovernance, Me } from '../src/lib/api';

/**
 * The governance page — Phase 17C.
 *
 * # What these prove and what they do not
 *
 * Not that anybody is refused: that is the server's job and is proved against
 * the real API in `internal/cloud/api`. What these prove is that the console
 * does not INVENT a policy model — that it renders what the server answered,
 * keeps null and [] apart on the way back out, and never shows a saved policy
 * as one that is in force.
 *
 * The last of those is the one worth a test rather than a comment: a page that
 * said "in force" on save would be reporting a claim as a fact, and the person
 * reading it is relying on a limit.
 */

const ME: Me = {
  user: { id: 'u1', email: 'owner@acme.example', displayName: 'Sam Rivers' },
  organizations: [{ id: 'org1', name: 'Acme', slug: 'acme', kind: 'team', role: 'owner' }],
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
  window.history.pushState({}, '', '/fleet/governance');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function governance(over: Partial<FleetGovernance> = {}): FleetGovernance {
  return {
    installationId: 'inst1',
    desired: {
      allowedModels: null,
      allowedDevices: null,
      allowedNodes: null,
    },
    applied: false,
    consistent: true,
    mayManage: true,
    machines: 2,
    devices: [
      { uuid: 'GPU-a1', model: 'RTX 5070 Ti', machineName: 'nodeforge', inPool: true },
      { uuid: 'GPU-c1', model: 'RTX 3080', machineName: 'nodeau-c', inPool: true },
    ],
    nodes: [
      { name: 'nodeforge', machineId: 'm1', inGroup: true },
      { name: 'nodeau-c', machineId: 'm2', inGroup: true },
    ],
    ...over,
  };
}

function lastPut(): Record<string, unknown> {
  const put = [...sent].reverse().find((c) => c.method === 'PUT');
  if (!put?.body) throw new Error('no PUT was sent');
  return JSON.parse(put.body) as Record<string, unknown>;
}

describe('the governance page', () => {
  it('says a fleet with no policy has none, rather than showing six empty fields', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/fleet/governance', governance());
    render(<App />);

    const status = await screen.findByTestId('governance-status');
    expect(status.textContent).toContain('Nothing is limited');
    // The lists default to "any", which is the state a fleet with no policy is
    // in — and is NOT the same as an empty allow list.
    expect(screen.getByLabelText('models')).toBeTruthy();
  });

  it('shows a saved policy as NOT YET IN FORCE until the fleet reports it', async () => {
    reply('GET', '/v1/me', ME);
    reply(
      'GET',
      '/v1/organizations/org1/fleet/governance',
      governance({
        desired: { maxWorkloads: 2, allowedModels: null, allowedDevices: null, allowedNodes: null },
        applied: false,
        setByEmail: 'owner@acme.example',
      }),
    );
    render(<App />);

    const status = await screen.findByTestId('governance-status');
    expect(status.textContent).toContain('Saved, not yet in force');
    expect(status.textContent).not.toContain('In force.');
  });

  it('says IN FORCE only when the server says the fleet is enforcing it', async () => {
    reply('GET', '/v1/me', ME);
    reply(
      'GET',
      '/v1/organizations/org1/fleet/governance',
      governance({
        desired: { maxWorkloads: 2, allowedModels: null, allowedDevices: null, allowedNodes: null },
        observed: {
          maxWorkloads: 2,
          allowedModels: null,
          allowedDevices: null,
          allowedNodes: null,
        },
        observedAt: new Date().toISOString(),
        applied: true,
      }),
    );
    render(<App />);

    const status = await screen.findByTestId('governance-status');
    expect(status.textContent).toContain('In force');
  });

  it('sends null for "any" and [] for "only these, none chosen"', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/fleet/governance', governance());
    reply('PUT', '/v1/organizations/org1/fleet/governance', { id: 'op1', kind: 'governance.set' });
    render(<App />);

    await screen.findByTestId('governance-status');
    const user = userEvent.setup();

    // Switch models to "only these" and leave the box empty. That is a
    // DECISION that nothing is permitted, and it must not be sent as null.
    await user.click(screen.getByLabelText('Only these models'));
    // The page says what that means rather than letting somebody discover it.
    expect(screen.getByText(/no model would be permitted/i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /save policy/i }));
    await waitFor(() => expect(sent.some((c) => c.method === 'PUT')).toBe(true));

    const body = lastPut().governance as Record<string, unknown>;
    expect(body.allowedModels).toEqual([]);
    // The two lists nobody touched stay null — "no policy", not "permits
    // nothing". Collapsing these is silent and permissive in one direction and
    // silently forbids everything in the other.
    expect(body.allowedDevices).toBeNull();
    expect(body.allowedNodes).toBeNull();
  });

  it('omits a quota that was left empty rather than sending zero', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/fleet/governance', governance());
    reply('PUT', '/v1/organizations/org1/fleet/governance', { id: 'op1', kind: 'governance.set' });
    render(<App />);

    await screen.findByTestId('governance-status');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Workloads at once'), '3');
    await user.click(screen.getByRole('button', { name: /save policy/i }));
    await waitFor(() => expect(sent.some((c) => c.method === 'PUT')).toBe(true));

    const body = lastPut().governance as Record<string, unknown>;
    expect(body.maxWorkloads).toBe(3);
    expect('maxGpus' in body && body.maxGpus !== undefined).toBe(false);
  });

  it('picks cards by their own identifier, from what the server reported', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/fleet/governance', governance());
    reply('PUT', '/v1/organizations/org1/fleet/governance', { id: 'op1', kind: 'governance.set' });
    render(<App />);

    await screen.findByTestId('governance-status');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Only these cards'));
    // The real inventory is offered, so nobody types a UUID.
    expect(screen.getByText(/GPU-a1/)).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /RTX 5070 Ti/ }));
    await user.click(screen.getByRole('button', { name: /save policy/i }));
    await waitFor(() => expect(sent.some((c) => c.method === 'PUT')).toBe(true));

    const body = lastPut().governance as Record<string, unknown>;
    expect(body.allowedDevices).toEqual(['GPU-a1']);
  });

  it('offers no way to change a policy the server says the caller may not manage', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/fleet/governance', governance({ mayManage: false }));
    render(<App />);

    await screen.findByTestId('governance-status');
    expect(screen.queryByRole('button', { name: /save policy/i })).toBeNull();
    expect(screen.getByText(/can see this fleet.s policy and not change it/i)).toBeTruthy();
    // The permission came from the SERVER's own answer, not from the role name
    // in /v1/me — which says `owner` in this fixture, deliberately. A console
    // that recomputed it would show the button.
    expect(ME.organizations[0]!.role).toBe('owner');
  });

  it('marks the fields the server rejected, rather than one message for all of them', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/fleet/governance', governance());
    reply(
      'PUT',
      '/v1/organizations/org1/fleet/governance',
      {
        code: 'INVALID_REQUEST',
        message: 'maxWorkloads: A quota is a count of zero or more. Zero removes the quota.',
        fields: {
          maxWorkloads: 'A quota is a count of zero or more. Zero removes the quota.',
          maxGpus: 'That is larger than Nodeau stores as a quota.',
        },
      },
      400,
    );
    render(<App />);

    await screen.findByTestId('governance-status');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Workloads at once'), '5');
    await user.click(screen.getByRole('button', { name: /save policy/i }));

    // The whole message appears in the notice AND beside the field it is
    // about, which is the point — a form that only showed the banner would make
    // somebody hunt for which of three numbers was wrong.
    await waitFor(() =>
      expect(screen.getAllByText(/A quota is a count of zero or more/).length).toBeGreaterThan(1),
    );
    const gpus = screen.getByLabelText('Graphics cards in use at once');
    expect(gpus.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/larger than Nodeau stores/)).toBeTruthy();
  });
});
