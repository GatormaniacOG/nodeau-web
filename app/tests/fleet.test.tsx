import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { operationTone } from '../src/pages/FleetWorkloads';
import { apiBase, type FleetView, type Me, type Operation } from '../src/lib/api';

/**
 * The fleet pages — Phase 14C.
 *
 * Driven through a mocked `fetch` for the same reason the rest of the suite is:
 * mocking the api module would test these components against a contract this
 * file invents, whereas mocking fetch exercises the real client.
 *
 * What is asserted is the set of things this page could get WRONG in a way that
 * matters — saying a machine is down when Nodeau Cloud simply cannot see it,
 * rendering a terminal success before anything observed one, and offering a
 * control the target machine cannot perform.
 */

const ME: Me = {
  user: { id: 'u1', email: 'person@example.com' },
  organizations: [
    { id: 'org1', name: "Sam's workspace", slug: 'sam', kind: 'personal', role: 'owner' },
  ],
};

function fleet(overrides: Partial<FleetView['installations'][0]> = {}): FleetView {
  return {
    installations: [
      {
        id: 'inst1',
        name: 'workstation',
        presence: 'online',
        connected: true,
        lastSyncAt: new Date().toISOString(),
        headline: 'Everything is running.',
        machines: [
          {
            id: 'm1',
            name: 'nodeforge',
            reportedName: 'nodeforge',
            presence: 'online',
            health: 'healthy',
            schedulingState: 'active',
            role: 'control-plane',
            capabilities: ['fleet.report', 'workload.run', 'workload.stop'],
            gpus: [
              {
                uuid: 'GPU-a1',
                ordinal: 1,
                model: 'NVIDIA GeForce RTX 5070 Ti',
                vramTotalMib: 15819,
                healthy: true,
                schedulable: true,
              },
            ],
          },
        ],
        ...overrides,
      },
    ],
  };
}

type Reply = { status: number; body: unknown };
let routes: Map<string, Reply>;

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`;
function reply(method: string, path: string, body: unknown, status = 200) {
  routes.set(key(method, path), { status, body });
}

beforeEach(() => {
  routes = new Map();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = new URL(url).pathname;
      const match = routes.get(key(init?.method ?? 'GET', path));
      if (!match) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'no route: ' + path }), {
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
  window.history.pushState({}, '', '/fleet');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the fleet page', () => {
  it('shows the machines, their accelerators and the fleet’s own sentence', async () => {
    reply('GET', '/v1/organizations/org1/fleet', fleet());
    render(<App />);

    expect(await screen.findByText('Everything is running.')).toBeInTheDocument();
    expect(screen.getByText('nodeforge')).toBeInTheDocument();
    expect(screen.getByText(/RTX 5070 Ti/)).toBeInTheDocument();
  });

  /**
   * The single most important string on this page.
   *
   * A machine Nodeau Cloud cannot see may be serving perfectly. Telling
   * somebody it is "offline" would be the product's first untrue claim, and
   * they would be right not to trust it again.
   */
  it('never says a machine is down when Nodeau Cloud simply cannot see it', async () => {
    reply(
      'GET',
      '/v1/organizations/org1/fleet',
      fleet({
        presence: 'offline',
        headline: 'Nodeau Cloud cannot currently see this fleet. Anything already running keeps running.',
      }),
    );
    render(<App />);

    expect(await screen.findByText(/cannot currently see this fleet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not visible/i).length).toBeGreaterThan(0);
    // The word that would be a lie.
    expect(screen.queryByText(/\bis down\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\boffline\b/i)).not.toBeInTheDocument();
  });

  it('tells an unconnected account what to do, and that nothing is wrong', async () => {
    reply('GET', '/v1/organizations/org1/fleet', {
      installations: [
        {
          id: 'inst1',
          name: 'workstation',
          presence: 'unknown',
          connected: false,
          headline: 'This fleet has not reported to Nodeau Cloud yet.',
          machines: [],
        },
      ],
    });
    render(<App />);

    expect(await screen.findByText(/No machine is reporting/i)).toBeInTheDocument();
    expect(screen.getByText('nodeau fleet connect')).toBeInTheDocument();
    // The invariant a person deciding whether to connect needs to read.
    expect(screen.getByText(/Nothing ever connects in/i)).toBeInTheDocument();
  });
});

describe('the machine page', () => {
  it('shows the machine’s own name beside a display name', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1', {
      id: 'm1',
      name: 'the box in the cupboard',
      reportedName: 'nodeau-c',
      presence: 'online',
      health: 'healthy',
      schedulingState: 'active',
      gpus: [],
    });
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'the box in the cupboard' })).toBeInTheDocument();
    // Without this a rename could make two machines look like one.
    expect(screen.getByText(/calls itself nodeau-c/i)).toBeInTheDocument();
  });

  /**
   * `v0.6.0-beta.1` and later builds disagree about what an unset scheduling
   * mode means — legacy for one, balanced for the other. Rendering the word
   * "default" would say two different things depending on which machine
   * somebody was looking at.
   */
  it('never renders the word "default" for a scheduling mode', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1', {
      id: 'm1',
      name: 'nodeau-c',
      reportedName: 'nodeau-c',
      presence: 'online',
      health: 'healthy',
      schedulingState: 'active',
      gpus: [],
    });
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    await screen.findByRole('heading', { name: 'nodeau-c' });
    expect(screen.queryByText(/\bdefault\b/i)).not.toBeInTheDocument();
    expect(screen.getByText(/built-in policy/i)).toBeInTheDocument();
  });

  it('shows a card the plan will not schedule, with the machine’s own reason', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1', {
      id: 'm1',
      name: 'nodeau-c',
      reportedName: 'nodeau-c',
      presence: 'online',
      health: 'healthy',
      schedulingState: 'active',
      gpus: [
        { uuid: 'GPU-1', ordinal: 1, model: 'RTX 3080', healthy: true, schedulable: true },
        {
          uuid: 'GPU-2',
          ordinal: 2,
          model: 'RTX 5060 Ti',
          healthy: true,
          schedulable: false,
          note: 'MultiGPU is part of a paid plan.',
        },
      ],
    });
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // HARDWARE IS SHOWN WHETHER OR NOT A PLAN ALLOWS IT. Hiding a card because
    // of a plan is the dishonest version of this view.
    expect(await screen.findByText('RTX 5060 Ti')).toBeInTheDocument();
    expect(screen.getByText(/MultiGPU is part of a paid plan/)).toBeInTheDocument();
  });
});

describe('operations', () => {
  /**
   * The guard §10.3 asks for, and the mapping IS the data.
   *
   * `applied` means the MACHINE says its local operation finished. Only
   * `observed` means the fleet's state matches what somebody asked for.
   * Clicking Stop must never render "Stopped".
   */
  it('renders no state as done except the one the fleet confirmed', () => {
    for (const [state, tone] of Object.entries(operationTone)) {
      if (state === 'observed') {
        expect(tone.done, 'observed is the successful terminal state').toBe(true);
        continue;
      }
      expect(
        tone.done,
        `${state} renders as a completed success. Only 'observed' means the fleet's own ` +
          `state matches the intent — everything before it is a claim, and 'applied' is ` +
          `the sharpest case because it sounds finished and is not.`,
      ).toBe(false);
    }
    expect(operationTone.failed.failed).toBe(true);
    expect(operationTone.expired.failed).toBe(true);
  });

  it('shows a refusal in the product’s own words rather than an HTTP status', async () => {
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [
        { name: 'qwen-main', state: 'serving', model: 'qwen3-8b-q4km', machineName: 'nodeforge' },
      ],
    });
    reply(
      'POST',
      '/v1/organizations/org1/fleet/operations',
      {
        code: 'FORBIDDEN',
        message:
          'Operating machines remotely is part of a paid plan. This fleet is visible here ' +
          'and everything on it keeps running.',
      },
      403,
    );
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    await screen.findByText('qwen-main');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() =>
      expect(screen.getByText(/part of a paid plan/i)).toBeInTheDocument(),
    );
    // Never a status code, and never "403".
    expect(screen.queryByText(/\b403\b/)).not.toBeInTheDocument();
    // And the workload is still shown as serving, because it is.
    expect(screen.getByText('serving')).toBeInTheDocument();
  });

  it('does not claim a workload stopped until the fleet says so', async () => {
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [{ name: 'qwen-main', state: 'serving', machineName: 'nodeforge' }],
    });
    const op: Operation = {
      id: 'op1',
      kind: 'workload.stop',
      state: 'delivered',
      summary: 'Stop a model and release the accelerator it holds.',
      requestedAt: new Date().toISOString(),
    };
    reply('POST', '/v1/organizations/org1/fleet/operations', op);
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    await screen.findByText('qwen-main');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(screen.getByText(/sent to the machine/i)).toBeInTheDocument());
    expect(screen.getByText(/Waiting for the machine to report back/i)).toBeInTheDocument();
    // The word that would be a lie at this moment.
    expect(screen.queryByText(/^stopped$/i)).not.toBeInTheDocument();
  });
});

describe('a stop is about the copy on the screen (#132)', () => {
  it('submits the incarnation of the row it shows, never just the name', async () => {
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [
        {
          name: 'reuse-me',
          state: 'serving',
          machineName: 'nodeforge',
          incarnation: 'k4tq3mfxzz2a7c5bnwe6r4yupd',
        },
      ],
    });
    reply('POST', '/v1/organizations/org1/fleet/operations', {
      id: 'op1',
      kind: 'workload.stop',
      state: 'requested',
      requestedAt: new Date().toISOString(),
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    await screen.findByText('reuse-me');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(call).toBeDefined();
      const body = JSON.parse(String((call?.[1] as RequestInit).body));
      expect(body).toMatchObject({
        kind: 'workload.stop',
        workloadName: 'reuse-me',
        workloadIncarnation: 'k4tq3mfxzz2a7c5bnwe6r4yupd',
      });
    });
    // The token is for the server, not for a person.
    expect(screen.queryByText('k4tq3mfxzz2a7c5bnwe6r4yupd')).not.toBeInTheDocument();
  });

  it('says so in the server’s own words when that copy was replaced', async () => {
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [
        { name: 'reuse-me', state: 'serving', incarnation: 'k4tq3mfxzz2a7c5bnwe6r4yupd' },
      ],
    });
    reply(
      'POST',
      '/v1/organizations/org1/fleet/operations',
      {
        code: 'CONFLICT',
        message:
          'The copy of reuse-me you stopped is no longer the one running: it was replaced by ' +
          'a newer copy with the same name. Nothing was stopped. Refresh to see the copy ' +
          'running now, and stop that one if you mean to.',
      },
      409,
    );
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    await screen.findByText('reuse-me');
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() =>
      expect(screen.getByText(/replaced by a newer copy with the same name/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/\b409\b/)).not.toBeInTheDocument();
  });
});

describe('the run form', () => {
  it('asks for a model and never for a machine or a card', async () => {
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);

    await screen.findByRole('heading', { name: /run a workload/i });
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
    // PLACEMENT IS THE LOCAL SCHEDULER'S. A browser that chose a device would
    // be a second scheduler beside the one that works.
    expect(screen.queryByLabelText(/machine/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/gpu uuid/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Nodeau picks the machine and the accelerator/i)).toBeInTheDocument();
  });

  it('does not offer "default" as a scheduling choice', async () => {
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);

    await screen.findByRole('heading', { name: /run a workload/i });
    const options = Array.from(
      (screen.getByLabelText(/scheduling/i) as HTMLSelectElement).options,
    ).map((o) => o.textContent ?? '');
    expect(options.some((o) => /default/i.test(o))).toBe(false);
    expect(options).toContain('balanced');
  });
});

// ---------------------------------------------------------------------------
// Drain, maintenance and the power budget — Phase 14E
// ---------------------------------------------------------------------------

/** machine builds one machine detail response. */
function machine(overrides: Record<string, unknown> = {}) {
  return {
    ...fleet().installations[0]!.machines[0]!,
    capabilities: ['fleet.report', 'workload.run', 'machine.drain'],
    ...overrides,
  };
}

describe('taking a machine out of service', () => {
  it('says plainly that nothing running is stopped', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1', machine());
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // THE SENTENCE IS THE FEATURE. The most likely misreading of a button
    // labelled "Stop new work" is that it takes models offline, and the person
    // most likely to misread it is the one reaching for it in a hurry.
    expect(
      await screen.findByText(/Nothing running here is stopped, moved or evicted/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop new work' })).toBeInTheDocument();
  });

  it('offers nothing to a machine whose build cannot be drained', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1',
      machine({ capabilities: ['fleet.report'] }));
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // A control the machine cannot perform is ABSENT, not disabled and not
    // failing on click. The page says what would add it instead.
    expect(await screen.findByText(/arrives with a newer version of Nodeau/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop new work' })).not.toBeInTheDocument();
  });

  it('shows a pending drain as pending, never as done', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1',
      machine({ schedulingState: 'active', desiredSchedulingState: 'draining' }));
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // The machine still reports `active`; somebody asked for `draining`. That
    // is reconciliation in flight — not a failure, and not yet a success.
    expect(await screen.findByText('draining…')).toBeInTheDocument();
  });

  it('explains a machine that is out of service on purpose', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1',
      machine({ schedulingState: 'drained', maintenanceReason: 'replacing a fan' }));
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // Without this a fleet with a machine down on purpose reads as a fleet
    // with a fault, and somebody goes looking for a problem that is not there.
    expect(await screen.findByText(/Out of service on purpose/)).toBeInTheDocument();
    expect(screen.getByText(/replacing a fan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take new work again' })).toBeInTheDocument();
  });

  it('says that putting a machine back moves nothing back', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1',
      machine({ schedulingState: 'drained' }));
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // Phase 6A's rule: a healthy workload is never restarted for a better
    // score, and undraining must not read as a promise that it will be.
    expect(await screen.findByText(/does not move anything back/)).toBeInTheDocument();
  });

  it('calls a power budget a scheduling ceiling, not a power limit', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1',
      machine({ powerBudgetWatts: 300 }));
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    // CLAUDE.md §4 draws this line and the UI must not blur it: one changes
    // where a workload goes, the other changes what a card draws.
    expect(await screen.findByText(/leaves what each card draws exactly as it was/)).toBeInTheDocument();
  });

  it('requires a reason before it will offer maintenance', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1', machine());
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    const button = await screen.findByRole('button', { name: 'Maintenance' });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/take it out for maintenance/i), 'new thermal paste');
    expect(screen.getByRole('button', { name: 'Maintenance' })).toBeEnabled();
  });

  it('sends the typed operation and nothing else', async () => {
    reply('GET', '/v1/organizations/org1/fleet/machines/m1', machine());
    reply('POST', '/v1/organizations/org1/fleet/operations', {
      id: 'op1', kind: 'machine.drain', state: 'requested',
      requestedAt: new Date().toISOString(),
    } satisfies Operation, 202);
    window.history.pushState({}, '', '/fleet/machines/m1');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Stop new work' }));

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(call, 'no operation was requested').toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);

    // A KIND AND A TARGET. No command, no arguments, no script — and the
    // browser cannot invent one, because there is no field for it.
    expect(body).toEqual({ kind: 'machine.drain', machineId: 'm1' });
  });
});

describe('Open in Playground (Phase 19)', () => {
  const withCapability = (caps: string[]) =>
    fleet({
      machines: [
        {
          id: 'm1', name: 'nodeforge', reportedName: 'nodeforge', presence: 'online', health: 'healthy',
          schedulingState: 'active', role: 'control-plane', capabilities: caps, gpus: [],
        },
        {
          id: 'm2', name: 'nodeau-c', reportedName: 'nodeau-c', presence: 'online', health: 'healthy',
          schedulingState: 'active', role: 'worker', capabilities: caps, gpus: [],
        },
      ],
    });
  const rows = {
    workloads: [
      { name: 'qwen-local', state: 'serving', machineId: 'm1', machineName: 'nodeforge', type: 'service' },
      { name: 'on-worker', state: 'serving', machineId: 'm2', machineName: 'nodeau-c', type: 'service' },
      { name: 'warming-up', state: 'starting', machineId: 'm1', machineName: 'nodeforge', type: 'service' },
      { name: 'nightly', state: 'running', machineId: 'm2', machineName: 'nodeau-c', type: 'batch' },
    ],
  };

  it('says where to open it, and names the machine that runs the Playground', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCapability(['fleet.report', 'local.playground']));
    reply('GET', '/v1/organizations/org1/fleet/workloads', rows);
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    await screen.findByText('on-worker');
    // A workload on the worker opens from the control-plane machine, where
    // nodeau runs; a starting workload and a batch job are not offered.
    const offers = await screen.findAllByRole('button', { name: 'Open in Playground' });
    expect(offers).toHaveLength(2);
    await userEvent.click(offers[1]!);
    const panel = screen.getByRole('region', { name: 'Playground for on-worker' });
    expect(panel).toHaveTextContent('nodeau playground on-worker');
    expect(panel).toHaveTextContent('On nodeforge, run:');
    const link = screen.getByRole('link', { name: 'Open the Playground on this computer' });
    expect(link).toHaveAttribute('href', 'http://127.0.0.1:7371/playground?workload=on-worker');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('is not offered to a fleet whose build has no Playground', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCapability(['fleet.report', 'workload.stop']));
    reply('GET', '/v1/organizations/org1/fleet/workloads', rows);
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await screen.findByText('qwen-local');
    expect(screen.queryByRole('button', { name: 'Open in Playground' })).not.toBeInTheDocument();
  });

  it('never asks the machine anything from this page', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCapability(['local.playground']));
    reply('GET', '/v1/organizations/org1/fleet/workloads', rows);
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Open in Playground' }))[0]!);
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u));
    // Every request goes to the API; none to the Playground's own address.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((u) => u.startsWith(apiBase))).toBe(true);
    expect(calls.some((u) => /:7371\b|\/playground/.test(u))).toBe(false);
  });
});

describe('recovery and model copies (Phase 20)', () => {
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const recovered = {
    name: 'qwen-c',
    state: 'serving',
    type: 'service',
    model: 'qwen3-8b-q4km',
    machineId: 'm1',
    machineName: 'nodeforge',
    recoveryChoosable: true,
    recovery: {
      policy: 'automatic',
      afterSeconds: 180,
      copies: 2,
      state: 'Recovered',
      reason: 'Recovered',
      message: 'qwen-c serves on nodeforge, brought up there after nodeau-c stopped answering.',
      from: 'nodeau-c',
      to: 'nodeforge',
      machineUnreachableSince: minutesAgo(12),
      decidedAt: minutesAgo(9),
      readyAt: minutesAgo(8),
      generation: 1,
    },
  };
  const choice = { may: true, automaticIncluded: true };
  const withCopies = (copies: unknown) =>
    fleet({ modelCopies: copies as FleetView['installations'][0]['modelCopies'] });

  it('shows the choice and the last recovery in the machine’s own words and moments', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCopies([]));
    reply('GET', '/v1/organizations/org1/fleet/workloads', { workloads: [recovered], recoveryChoice: choice });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    const block = await screen.findByRole('group', { name: 'Recovery for qwen-c' });
    expect(block).toHaveTextContent('Automatic, after its machine has stopped answering for 3 minutes.');
    expect(block).toHaveTextContent('2 machines keep a verified copy of its model.');
    expect(block).toHaveTextContent('recovered: qwen-c serves on nodeforge');
    expect(block).toHaveTextContent('nodeau-c stopped answering');
    expect(block).toHaveTextContent('Serving on nodeforge since');
  });

  it('says held and recovering as the machine does, never serving', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCopies(null));
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [
        {
          ...recovered,
          state: 'held',
          recovery: {
            policy: 'never',
            afterSeconds: 180,
            copies: 1,
            state: 'Held',
            message: 'nodeau-c has been unreachable for 4 minutes. Recovery is off for qwen-c, so it waits for nodeau-c to return.',
            from: 'nodeau-c',
            machineUnreachableSince: minutesAgo(4),
          },
        },
      ],
      recoveryChoice: choice,
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    const block = await screen.findByRole('group', { name: 'Recovery for qwen-c' });
    expect(block).toHaveTextContent('Off. If its machine stops answering, it waits for it to come back.');
    expect(block).toHaveTextContent('held: nodeau-c has been unreachable');
    expect(screen.queryByText('serving')).not.toBeInTheDocument();
  });

  it('sends the typed choice and nothing else', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCopies(null));
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [{ ...recovered, recovery: { policy: 'never', afterSeconds: 180, copies: 1 } }],
      recoveryChoice: choice,
    });
    reply('POST', '/v1/organizations/org1/fleet/operations', {
      id: 'op9',
      kind: 'workload.recovery.set',
      state: 'requested',
      requestedAt: new Date().toISOString(),
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: 'Change recovery' }));
    await userEvent.click(screen.getByLabelText('Bring it up on another of my machines'));
    const minutes = screen.getByLabelText('Minutes before recovering');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
        kind: 'workload.recovery.set',
        workloadName: 'qwen-c',
        recoveryPolicy: 'automatic',
        recoveryAfterSeconds: 600,
      });
    });
    // Not done until the fleet reports it.
    expect(await screen.findByText(/asked/)).toBeInTheDocument();
  });

  it('offers no choice the server did not offer', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCopies(null));
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [{ ...recovered, recoveryChoosable: false }],
      recoveryChoice: choice,
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await screen.findByRole('group', { name: 'Recovery for qwen-c' });
    expect(screen.queryByRole('button', { name: 'Change recovery' })).not.toBeInTheDocument();
  });

  it('holds automatic back, with the server’s sentence, on a plan without it', async () => {
    const why = 'Automatic recovery across your machines is part of Home Pro and Business.';
    reply('GET', '/v1/organizations/org1/fleet', withCopies(null));
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [{ ...recovered, recovery: { policy: 'never', afterSeconds: 180, copies: 1 } }],
      recoveryChoice: { may: true, automaticIncluded: false, whyNot: why },
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change recovery' }));
    expect(screen.getByLabelText('Bring it up on another of my machines')).toBeDisabled();
    expect(screen.getByText(why)).toBeInTheDocument();
  });

  it('shows where each model’s copies are, and who they are kept for', async () => {
    reply(
      'GET',
      '/v1/organizations/org1/fleet',
      withCopies([
        { model: 'qwen3-8b-q4km', machineName: 'nodeau-c', state: 'Ready', requested: false, workload: 'nodeau-dev/qwen-c' },
        { model: 'qwen3-8b-q4km', machineName: 'nodeforge', state: 'Fetching', requested: true },
        { model: 'finance-model', machineName: 'nodeau-c', state: 'NeedsCustomerCopy', requested: true },
      ]),
    );
    reply('GET', '/v1/organizations/org1/fleet/workloads', { workloads: [recovered], recoveryChoice: choice });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);

    const table = await screen.findByTestId('model-copies');
    expect(table).toHaveTextContent('nodeau-dev/qwen-c’s recovery'.replace('’', "'"));
    expect(table).toHaveTextContent('fetching');
    expect(table).toHaveTextContent('needs your copy');
    expect(screen.getByRole('group', { name: 'Recovery for qwen-c' })).toHaveTextContent(
      'Verified copies on nodeau-c.',
    );
  });

  it('says nothing about copies a fleet does not report, rather than “none”', async () => {
    reply('GET', '/v1/organizations/org1/fleet', withCopies(null));
    reply('GET', '/v1/organizations/org1/fleet/workloads', { workloads: [recovered], recoveryChoice: choice });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await screen.findByRole('group', { name: 'Recovery for qwen-c' });
    expect(screen.queryByTestId('model-copies')).not.toBeInTheDocument();
    expect(screen.queryByText(/No copies yet/)).not.toBeInTheDocument();
  });

  it('shows nothing about recovery from an API or a machine that predates it', async () => {
    reply('GET', '/v1/organizations/org1/fleet', fleet());
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [{ name: 'qwen-local', state: 'serving', machineName: 'nodeforge' }],
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await screen.findByText('qwen-local');
    expect(screen.queryByRole('group', { name: /Recovery for/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-copies')).not.toBeInTheDocument();
  });
});

describe('the recovery delay (Phase 20)', () => {
  it('refuses a delay outside 1 to 60 minutes, and sends nothing', async () => {
    reply('GET', '/v1/organizations/org1/fleet', fleet({ modelCopies: null }));
    reply('GET', '/v1/organizations/org1/fleet/workloads', {
      workloads: [
        {
          name: 'qwen-c', state: 'serving', type: 'service', recoveryChoosable: true,
          recovery: { policy: 'never', afterSeconds: 180, copies: 1 },
        },
      ],
      recoveryChoice: { may: true, automaticIncluded: true },
    });
    window.history.pushState({}, '', '/fleet/workloads');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change recovery' }));
    await userEvent.click(screen.getByLabelText('Bring it up on another of my machines'));
    const minutes = screen.getByLabelText('Minutes before recovering');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '90');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('from 1 to 60');
    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });
});
