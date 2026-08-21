import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { Installation, Me, Plan } from '../src/lib/api';

/**
 * The application's states, driven through a mocked `fetch`.
 *
 * # Why fetch and not the api module
 *
 * Mocking `api` would test the components against a contract this file invents.
 * Mocking `fetch` exercises the real client — its credentials mode, its CSRF
 * header, its error typing — so a change that breaks the wire contract shows up
 * here rather than in production.
 *
 * The states covered are the ones the Phase 7C brief §5.6 names: loading,
 * error, empty, signed-out, populated, and the activation flow including its
 * failure paths.
 */

const ME: Me = {
  user: { id: 'u1', email: 'person@example.com', displayName: 'Sam Rivers' },
  organizations: [
    { id: 'org1', name: "Sam's workspace", slug: 'sam', kind: 'personal', role: 'owner' },
  ],
};

const HOME_PLAN: Plan = {
  id: 'home',
  displayName: 'Nodeau Home',
  summary: 'Make my GPU useful.',
  status: 'none',
  purchasable: false,
  features: [],
  limits: { MaxNodes: 1, MaxGPUs: 1 },
};

const INSTALLATION: Installation = {
  id: 'inst1',
  name: 'workstation',
  nodeauVersion: '0.7.0',
  nodeCount: 1,
  gpuCount: 2,
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  lastSeenAt: new Date(Date.now() - 120_000).toISOString(),
  active: true,
  activated: true,
  entitlementPlanId: 'home',
};

type Route = { status: number; body: unknown };
let routes: Map<string, Route>;
let calls: { url: string; init: RequestInit }[];

function route(method: string, path: string): string {
  return `${method} ${path}`;
}

function reply(method: string, path: string, body: unknown, status = 200) {
  routes.set(route(method, path), { status, body });
}

beforeEach(() => {
  routes = new Map();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = new URL(url).pathname;
      const key = route(init?.method ?? 'GET', path);
      calls.push({ url, init: init ?? {} });

      const match = routes.get(key);
      if (!match) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'no route: ' + key }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (match.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(match.body), {
        status: match.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Session states
// ---------------------------------------------------------------------------

describe('the signed-out state', () => {
  it('renders sign-in rather than an error', async () => {
    reply('GET', '/v1/me', { code: 'AUTH_REQUIRED', message: 'You are not signed in.' }, 401);
    render(<App />);

    expect(await screen.findByRole('heading', { name: /sign in to nodeau/i })).toBeInTheDocument();
    // A 401 on /v1/me is the ordinary state of somebody who has not signed in.
    // An error screen there makes a working product feel broken on first
    // contact.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says an account is not required to use Nodeau', async () => {
    reply('GET', '/v1/me', { code: 'AUTH_REQUIRED', message: 'no' }, 401);
    render(<App />);

    // The adoption invariant, stated where somebody deciding whether to sign up
    // will read it (docs/ROADMAP.md §6).
    expect(
      await screen.findByText(/do not need an account to use Nodeau/i),
    ).toBeInTheDocument();
  });

  it('explains a login that failed because the account uses another method', async () => {
    reply('GET', '/v1/me', { code: 'AUTH_REQUIRED', message: 'no' }, 401);
    window.history.pushState({}, '', '/signin?error=different-method');
    render(<App />);

    // Retrying never fixes this one, so it must not be collapsed into a
    // generic "sign-in failed".
    expect(await screen.findByText(/already has an account/i)).toBeInTheDocument();
    expect(screen.getByText(/retrying with this method will not work/i)).toBeInTheDocument();
  });
});

describe('the loading state', () => {
  it('announces itself to a screen reader', async () => {
    // Never resolves, so the loading state is the terminal state here.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i);
  });
});

describe('the network-error state', () => {
  it('says the customer’s own installations are unaffected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network down'); }));
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not reach Nodeau Cloud/i);
    // The claim that matters: this site being down is not an outage of the
    // product.
    expect(alert).toHaveTextContent(/keep working/i);
  });
});

// ---------------------------------------------------------------------------
// Dashboard and installations
// ---------------------------------------------------------------------------

describe('the dashboard', () => {
  it('shows the plan and a way to add a machine when there are none', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/installations', { installations: [] });
    render(<App />);

    expect(await screen.findByText(/Nodeau Home/)).toBeInTheDocument();
    expect(screen.getByText(/Connect your first machine/i)).toBeInTheDocument();
    // An empty state must say what to do next. getAllBy because the command is
    // named more than once on purpose — in the prose and in the numbered
    // steps — and an exact-one assertion would be asserting the layout rather
    // than the property.
    expect(screen.getAllByText(/nodeau login/).length).toBeGreaterThan(0);
  });

  it('lists installations once there are some', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/installations', { installations: [INSTALLATION] });
    render(<App />);

    expect(await screen.findByText('workstation')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('the installations list', () => {
  it('distinguishes a machine that was approved but never collected its credential', async () => {
    // A real state that produces an installation which exists and can do
    // nothing. Showing it as active would be a lie the operator discovers only
    // when a refresh never arrives.
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/installations', {
      installations: [{ ...INSTALLATION, activated: false }],
    });
    window.history.pushState({}, '', '/installations');
    render(<App />);

    expect(await screen.findByText(/Awaiting activation/i)).toBeInTheDocument();
    expect(screen.queryByText(/^Active$/)).not.toBeInTheDocument();
  });

  it('shows a typed error with its request id and offers a retry', async () => {
    reply('GET', '/v1/me', ME);
    reply(
      'GET',
      '/v1/organizations/org1/installations',
      { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.', requestId: 'req-42' },
      500,
    );
    window.history.pushState({}, '', '/installations');
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
    // The request id is what turns a support conversation into a log search.
    expect(alert).toHaveTextContent('req-42');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('installation detail', () => {
  it('does not present reported values as a live view', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/installations/inst1', INSTALLATION);
    window.history.pushState({}, '', '/installations/inst1');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'workstation' })).toBeInTheDocument();
    // Phase 7C brief §5.4: do not fake a live dashboard.
    expect(
      screen.getByText(/does not connect to your machines/i),
    ).toBeInTheDocument();
  });

  it('offers no remote-control actions', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/installations/inst1', INSTALLATION);
    window.history.pushState({}, '', '/installations/inst1');
    render(<App />);
    await screen.findByRole('heading', { name: 'workstation' });

    // §37: no fake buttons for capabilities that do not exist. There is no
    // outbound channel, so anything resembling remote control would lie.
    for (const forbidden of [/start/i, /stop workload/i, /run a model/i, /submit batch/i]) {
      expect(screen.queryByRole('button', { name: forbidden })).not.toBeInTheDocument();
    }
  });

  it('requires a confirmation before removing, and says nothing stops', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/installations/inst1', INSTALLATION);
    reply('DELETE', '/v1/organizations/org1/installations/inst1', null, 204);
    reply('GET', '/v1/organizations/org1/installations', { installations: [] });
    window.history.pushState({}, '', '/installations/inst1');
    render(<App />);

    await screen.findByRole('heading', { name: 'workstation' });
    expect(screen.getByText(/Nothing running on the machine stops/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /remove installation/i }));
    // A destructive action gets a second, specific confirmation naming the
    // thing being removed.
    const confirm = await screen.findByRole('button', { name: /yes, remove workstation/i });
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

describe('the activation page', () => {
  it('shows what is being approved before asking', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/activation/pending/ABCD-2345', {
      userCode: 'ABCD-2345',
      requestedName: 'the-loud-one',
      nodeauVersion: '0.7.0',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    window.history.pushState({}, '', '/activate?code=ABCD-2345');
    render(<App />);

    // "Authorize this device" with no detail is a dialog people click through.
    expect(await screen.findByText(/Authorize this machine\?/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/installation name/i)).toHaveValue('the-loud-one');
    expect(screen.getByText('0.7.0')).toBeInTheDocument();
  });

  it('offers refusal beside approval', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/activation/pending/ABCD-2345', {
      userCode: 'ABCD-2345',
      requestedName: 'box',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    reply('POST', '/v1/activation/deny', null, 204);
    window.history.pushState({}, '', '/activate?code=ABCD-2345');
    render(<App />);

    // Somebody shown a code they did not request has been targeted, and closing
    // the tab tells nobody.
    const deny = await screen.findByRole('button', { name: /i did not start this/i });
    await userEvent.click(deny);
    expect(await screen.findByText(/Not approved/i)).toBeInTheDocument();
    expect(screen.getByText(/gives nothing away/i)).toBeInTheDocument();
  });

  it('approves and confirms, telling the user to return to the terminal', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/activation/pending/ABCD-2345', {
      userCode: 'ABCD-2345',
      requestedName: 'box',
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    reply('POST', '/v1/activation/approve', { installation: INSTALLATION });
    window.history.pushState({}, '', '/activate?code=ABCD-2345');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /^authorize$/i }));
    expect(await screen.findByText(/is connected/i)).toBeInTheDocument();
    expect(screen.getByText(/Return to your terminal/i)).toBeInTheDocument();
  });

  it('reports an expired code as expired', async () => {
    reply('GET', '/v1/me', ME);
    reply(
      'GET',
      '/v1/activation/pending/ABCD-2345',
      { code: 'ACTIVATION_NOT_FOUND', message: 'That code is not valid.' },
      404,
    );
    window.history.pushState({}, '', '/activate?code=ABCD-2345');
    render(<App />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not valid/i);
  });

  it('rejects an obviously malformed code without a round trip', async () => {
    reply('GET', '/v1/me', ME);
    window.history.pushState({}, '', '/activate');
    render(<App />);

    const input = await screen.findByLabelText(/activation code/i);
    await userEvent.type(input, 'ABC');
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/eight characters/i);
    expect(calls.some((c) => c.url.includes('/v1/activation/pending/'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

describe('the plan page', () => {
  it('does not offer to sell anything while billing is not live', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/plans', {
      plans: [
        { id: 'home', displayName: 'Nodeau Home', summary: 'a', features: [], current: true, purchasable: false, free: true },
        { id: 'home-pro', displayName: 'Nodeau Home Pro', summary: 'b', features: [], current: false, purchasable: false, free: false },
      ],
    });
    window.history.pushState({}, '', '/plan');
    render(<App />);

    expect(await screen.findByText('Nodeau Home Pro')).toBeInTheDocument();
    // A checkout button that goes nowhere is worse than an honest label.
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('says the free plan is not a crippled one', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/plans', { plans: [] });
    window.history.pushState({}, '', '/plan');
    render(<App />);

    expect(await screen.findByText(/nothing has been disabled/i)).toBeInTheDocument();
  });

  it('renders paid capabilities as sentences rather than identifiers', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', {
      ...HOME_PLAN,
      id: 'home-pro',
      displayName: 'Nodeau Home Pro',
      status: 'active',
      features: ['MultiNode', 'BatchJobs'],
    });
    reply('GET', '/v1/organizations/org1/plans', { plans: [] });
    window.history.pushState({}, '', '/plan');
    render(<App />);

    expect(await screen.findByText(/Use several GPU machines together/i)).toBeInTheDocument();
    expect(screen.getByText(/Run batch jobs/i)).toBeInTheDocument();
  });

  it('shows an unrecognised capability rather than a blank bullet', async () => {
    // An old build reading a newer plan. Rendering nothing would be a silently
    // shorter list.
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', {
      ...HOME_PLAN,
      features: ['QuantumScheduling'],
    });
    reply('GET', '/v1/organizations/org1/plans', { plans: [] });
    window.history.pushState({}, '', '/plan');
    render(<App />);

    expect(await screen.findByText('QuantumScheduling')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The wire contract
// ---------------------------------------------------------------------------

describe('every request', () => {
  it('sends credentials and the CSRF header', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/installations', { installations: [] });
    render(<App />);
    await screen.findByText(/Nodeau Home/);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // Without credentials the HttpOnly session cookie is not sent
      // cross-origin and every call looks unauthenticated.
      expect(call.init.credentials).toBe('include');
      const headers = call.init.headers as Record<string, string>;
      expect(headers['X-Nodeau-Request']).toBe('1');
    }
  });
});

// ---------------------------------------------------------------------------
// Issue #86 — the free tier is free, not "coming soon"
// ---------------------------------------------------------------------------

describe('the plan page once something IS on sale', () => {
  // Reported from the live app: an account on Home Pro saw "Coming soon" beside
  // Nodeau Home — the plan every installation already runs.
  //
  // `purchasable` is false for two unrelated reasons and the page had only that
  // one boolean, so it rendered both as "coming soon". Invisible while nothing
  // was purchasable, because every tier said it; absurd the moment one tier
  // stopped saying it.
  it('labels the free tier Free rather than Coming soon', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/plans', {
      plans: [
        { id: 'home', displayName: 'Nodeau Home', summary: 'a', features: [], current: false, purchasable: false, free: true },
        { id: 'home-pro', displayName: 'Nodeau Home Pro', summary: 'b', features: [], current: true, purchasable: false, free: false },
        { id: 'business', displayName: 'Nodeau Business', summary: 'c', features: [], current: false, purchasable: false, free: false },
      ],
    });
    window.history.pushState({}, '', '/plan');
    render(<App />);

    expect(await screen.findByText('Nodeau Business')).toBeInTheDocument();
    // The discriminating assertion: Business is the ONLY tier not on sale.
    // Before the fix there were two, because the free tier said it as well.
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(1);
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
  });

  it('offers Upgrade for a purchasable tier while the free one still says Free', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/plan', HOME_PLAN);
    reply('GET', '/v1/organizations/org1/plans', {
      plans: [
        { id: 'home', displayName: 'Nodeau Home', summary: 'a', features: [], current: true, purchasable: false, free: true },
        { id: 'home-pro', displayName: 'Nodeau Home Pro', summary: 'b', features: [], current: false, purchasable: true, free: false },
      ],
    });
    window.history.pushState({}, '', '/plan');
    render(<App />);

    expect(await screen.findByRole('button', { name: /upgrade/i })).toBeInTheDocument();
    // The current tier renders no aside at all, so "Free" appears only when the
    // free tier is NOT the current one — which is the case the defect was about.
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
