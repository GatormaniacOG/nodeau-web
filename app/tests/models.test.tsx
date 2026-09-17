import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { ModelSelect } from '../src/components/ModelSelect';
import type { CatalogModel, Me, ModelCatalog, Operation } from '../src/lib/api';

/**
 * Choosing a model — the selector that replaced a free-text field.
 *
 * What is asserted is what this control could get WRONG in a way that matters:
 * submitting a display name instead of an id, silently retargeting a model
 * somebody already chose, offering one their organisation does not permit,
 * inventing a list when the catalogue could not be read, and showing an empty
 * dropdown while it is still loading — which is indistinguishable from "you
 * have no models".
 */

const ME: Me = {
  user: { id: 'u1', email: 'person@example.com' },
  organizations: [
    { id: 'org1', name: "Sam's workspace", slug: 'sam', kind: 'personal', role: 'owner' },
  ],
};

function model(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: 'qwen3.5-4b-q4km',
    displayName: 'Qwen3.5-4B Q4_K_M',
    family: 'Qwen3.5',
    parameters: '4B',
    quantization: 'Q4_K_M',
    role: 'Compact general',
    recommendedVramGib: 8,
    tasks: ['chat'],
    capabilities: ['chat'],
    status: 'active',
    featured: true,
    source: 'catalog',
    permitted: true,
    ...overrides,
  };
}

function catalog(overrides: Partial<ModelCatalog> = {}): ModelCatalog {
  return {
    models: [
      model(),
      model({
        id: 'qwen3.5-9b-q4km',
        displayName: 'Qwen3.5-9B Q4_K_M',
        parameters: '9B',
        recommendedVramGib: 12,
      }),
      model({
        id: 'qwen3-embedding-0.6b-q8_0',
        displayName: 'Qwen3-Embedding 0.6B Q8_0',
        parameters: '0.6B',
        tasks: ['embed'],
        capabilities: ['embed'],
      }),
      model({
        id: 'qwen3-8b-q4km',
        displayName: 'Qwen3-8B Q4_K_M',
        role: 'General (superseded by Qwen3.5-9B)',
        status: 'deprecated',
        featured: false,
        recommendedVramGib: undefined,
      }),
    ],
    policyApplied: false,
    ...overrides,
  };
}

type Reply = { status: number; body: unknown };
let routes: Map<string, Reply>;
let calls: { method: string; url: string; body?: unknown }[];

const key = (method: string, path: string) => `${method.toUpperCase()} ${path}`;
function reply(method: string, path: string, body: unknown, status = 200) {
  routes.set(key(method, path), { status, body });
}

beforeEach(() => {
  routes = new Map();
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = new URL(url).pathname;
      calls.push({
        method: (init?.method ?? 'GET').toUpperCase(),
        url,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
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
  reply('GET', '/v1/organizations/org1/models', catalog());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Harness holds the value a form would, so what is SUBMITTED is observable. */
function Harness({
  initial = '',
  task,
  onValue,
}: {
  initial?: string;
  task?: string;
  onValue?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form>
      <label htmlFor="m">Model</label>
      <ModelSelect
        id="m"
        orgId="org1"
        value={value}
        task={task}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
      <output data-testid="submitted">{value}</output>
    </form>
  );
}

async function openList(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: /model/i }));
  return screen.findByRole('listbox');
}

describe('the model selector', () => {
  it('offers what the catalogue says, grouped, and never a hard-coded list', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = await openList(user);

    expect(within(list).getByText('Qwen3.5-4B Q4_K_M')).toBeInTheDocument();
    expect(within(list).getByText('Qwen3-Embedding 0.6B Q8_0')).toBeInTheDocument();

    // A deprecated entry is LISTED and not featured — somebody's fleet may be
    // serving one right now, and hiding it would lose it.
    const superseded = within(list).getByRole('group', { name: 'Superseded' });
    expect(within(superseded).getByText('Qwen3-8B Q4_K_M')).toBeInTheDocument();
    const nodeau = within(list).getByRole('group', { name: 'Nodeau models' });
    expect(within(nodeau).queryByText('Qwen3-8B Q4_K_M')).not.toBeInTheDocument();

    // THE CANONICAL ID IS VISIBLE beside the human name, because it is what is
    // submitted and somebody comparing with their terminal needs to see it.
    expect(within(list).getByText('qwen3.5-4b-q4km')).toBeInTheDocument();
  });

  it('submits the canonical id and never the display name', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    const list = await openList(user);

    await user.click(within(list).getByText('Qwen3.5-9B Q4_K_M'));

    expect(seen).toEqual(['qwen3.5-9b-q4km']);
    expect(screen.getByTestId('submitted')).toHaveTextContent('qwen3.5-9b-q4km');
    // And the box now reads as the person would recognise it.
    expect(screen.getByRole('combobox', { name: /model/i })).toHaveValue('Qwen3.5-9B Q4_K_M');
  });

  it('resolves a value it was given and shows its human name', async () => {
    render(<Harness initial="qwen3-8b-q4km" />);
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /model/i })).toHaveValue('Qwen3-8B Q4_K_M'),
    );
    expect(screen.queryByText(/is not in this list/)).not.toBeInTheDocument();
  });

  it('never silently retargets a model id the list does not contain', async () => {
    render(<Harness initial="a-model-that-went-away" />);

    // The value is KEPT, exactly as it is, and said out loud. Choosing a
    // different model on somebody's behalf is the one thing a selector must
    // not do.
    await waitFor(() => expect(screen.getByText(/is not in this list/)).toBeInTheDocument());
    expect(screen.getByTestId('submitted')).toHaveTextContent('a-model-that-went-away');
    expect(screen.getByRole('combobox', { name: /model/i })).toHaveValue(
      'a-model-that-went-away',
    );
  });

  it('filters as you type, across the id as well as the name', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openList(user);
    const box = screen.getByRole('combobox', { name: /model/i });

    await user.type(box, 'embedding');
    const list = await screen.findByRole('listbox');
    expect(within(list).getByText('Qwen3-Embedding 0.6B Q8_0')).toBeInTheDocument();
    expect(within(list).queryByText('Qwen3.5-4B Q4_K_M')).not.toBeInTheDocument();

    // Matching is case-insensitive and reaches the canonical id.
    await user.clear(box);
    await user.type(box, 'Q4KM');
    expect(within(await screen.findByRole('listbox')).getByText('Qwen3.5-4B Q4_K_M'))
      .toBeInTheDocument();

    // Nothing matching says so rather than showing an empty panel.
    await user.clear(box);
    await user.type(box, 'zzz');
    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument();
  });

  it('is usable from the keyboard alone', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findByRole('combobox', { name: /model/i });

    await user.tab();
    const box = screen.getByRole('combobox', { name: /model/i });
    expect(box).toHaveFocus();

    // Focus opens the list; the arrow keys walk it and Enter chooses.
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('submitted')).toHaveTextContent('qwen3.5-9b-q4km');

    // Escape closes without changing anything.
    await user.keyboard('{ArrowDown}');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('submitted')).toHaveTextContent('qwen3.5-9b-q4km');
  });

  it('shows a model the organisation does not permit, marked, and refuses to select it', async () => {
    reply(
      'GET',
      '/v1/organizations/org1/models',
      catalog({
        policyApplied: true,
        models: [
          model(),
          model({
            id: 'qwen3.5-9b-q4km',
            displayName: 'Qwen3.5-9B Q4_K_M',
            permitted: false,
            notPermittedReason:
              "Your organisation's model policy does not include this model. " +
              'Nodeau can run it and your machines may well hold it — whoever manages ' +
              'your fleet’s policy can add it.',
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);
    const list = await openList(user);

    // SHOWN, not hidden: somebody refused by a policy has to be able to see
    // the list that refused them.
    const refused = within(list).getByText('Qwen3.5-9B Q4_K_M').closest('[role="option"]');
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    expect(within(list).getByText(/model policy does not include/i)).toBeInTheDocument();

    // And the remedy is a COLLEAGUE. A policy refusal that named a plan or a
    // graphics card would send somebody to the wrong place entirely.
    const reason = within(list).getByText(/model policy does not include/i).textContent ?? '';
    expect(reason).not.toMatch(/plan|upgrade|purchase|vram|memory/i);

    await user.click(within(list).getByText('Qwen3.5-9B Q4_K_M'));
    expect(screen.getByTestId('submitted')).toHaveTextContent('');

    // The page says a policy is in force, so an unexplained short list is not
    // mistaken for a missing catalogue.
    expect(screen.getByText(/has a model policy/i)).toBeInTheDocument();
  });

  it("offers a model only the customer's own fleet knows about, and claims nothing about it", async () => {
    reply(
      'GET',
      '/v1/organizations/org1/models',
      catalog({
        models: [
          model(),
          {
            id: 'my-imported-gguf',
            featured: false,
            source: 'fleet',
            runningAs: ['my-assistant'],
            permitted: true,
          },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);
    const list = await openList(user);

    const group = within(list).getByRole('group', { name: /fleet is running/i });
    expect(within(group).getByText('my-imported-gguf')).toBeInTheDocument();
    // Nothing is claimed about what it can do.
    expect(within(group).getByText(/does not know what these can do/i)).toBeInTheDocument();
    // It is not presented as a curated model.
    expect(within(group).queryByText(/qwen/i)).not.toBeInTheDocument();

    await user.click(within(group).getByText('my-imported-gguf'));
    expect(screen.getByTestId('submitted')).toHaveTextContent('my-imported-gguf');
  });

  it('keeps a way to name a model this list cannot know about', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const list = await openList(user);

    // Deliberately INSIDE the list and last, so it is a choice somebody makes
    // rather than a text box sitting beside the dropdown.
    await user.click(within(list).getByText(/not listed/i));

    const manual = screen.getByLabelText(/model id/i);
    await user.type(manual, 'imported-but-never-run');
    expect(screen.getByTestId('submitted')).toHaveTextContent('imported-but-never-run');
    expect(screen.getByText(/imported on a machine and have not run yet/i)).toBeInTheDocument();

    // And a way back, which clears the typed value rather than carrying it.
    await user.click(screen.getByRole('button', { name: /choose from the list/i }));
    expect(screen.getByTestId('submitted')).toHaveTextContent('');
  });

  it('asks the server for the task, rather than filtering in the browser', async () => {
    render(<Harness task="embed" />);
    await screen.findByRole('combobox', { name: /model/i });

    const asked = calls.find((c) => c.url.includes('/models'));
    expect(asked?.url).toContain('task=embed');
  });

  it('asks for chat when the task is empty, because empty IS chat', async () => {
    render(<Harness task="" />);
    await screen.findByRole('combobox', { name: /model/i });

    const asked = calls.find((c) => c.url.includes('/models'));
    expect(asked?.url).toContain('task=chat');
  });

  it('asks for every model when no task is given at all, which a policy needs', async () => {
    render(<Harness />);
    await screen.findByRole('combobox', { name: /model/i });

    const asked = calls.find((c) => c.url.includes('/models'));
    expect(asked).toBeDefined();
    expect(asked?.url).not.toContain('task=');
  });

  it('says it is loading rather than showing an empty dropdown', async () => {
    // A request that never resolves: the state under test is the one before an
    // answer, and an empty list here reads as "you have no models".
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    render(<Harness />);

    expect(await screen.findByPlaceholderText(/loading models/i)).toBeDisabled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('offers a retry when the catalogue cannot be read, and never a stale list', async () => {
    routes.delete(key('GET', '/v1/organizations/org1/models'));
    const user = userEvent.setup();
    render(<Harness />);

    expect(await screen.findByPlaceholderText(/could not be loaded/i)).toBeInTheDocument();
    // NEVER a fallback list: a hard-coded set shown when the catalogue could
    // not be read is wrong precisely when nobody can check it.
    expect(screen.queryByText(/Qwen/)).not.toBeInTheDocument();

    reply('GET', '/v1/organizations/org1/models', catalog());
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /model/i })).toBeInTheDocument(),
    );
  });

  it('says plainly when an organisation has nothing to choose from', async () => {
    reply('GET', '/v1/organizations/org1/models', { models: [], policyApplied: false });
    render(<Harness />);

    expect(await screen.findByText(/no models are available/i)).toBeInTheDocument();
  });
});

describe('the run form', () => {
  it('sends the canonical id it was given, to the real operations endpoint', async () => {
    const op: Operation = {
      id: 'op1',
      kind: 'workload.run',
      state: 'requested',
      summary: 'Run a model.',
      requestedAt: new Date().toISOString(),
    };
    reply('POST', '/v1/organizations/org1/fleet/operations', op);
    const user = userEvent.setup();
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);

    await screen.findByRole('heading', { name: /run a workload/i });
    await user.type(screen.getByLabelText('Name'), 'browser-started');

    await user.click(screen.getByRole('combobox', { name: /model/i }));
    const list = await screen.findByRole('listbox');
    await user.click(within(list).getByText('Qwen3.5-9B Q4_K_M'));

    await user.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      const posted = calls.find((c) => c.method === 'POST' && c.url.includes('/fleet/operations'));
      expect(posted?.body).toMatchObject({
        kind: 'workload.run',
        workloadName: 'browser-started',
        // THE ASSERTION THAT MATTERS: an id, not a label.
        model: 'qwen3.5-9b-q4km',
      });
    });
  });

  it('no longer has a free-text model field in the ordinary path', async () => {
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);

    const box = await screen.findByRole('combobox', { name: /model/i });
    // The control is a combobox rather than a plain text input, and it holds a
    // SEARCH STRING rather than the value: typing into it submits nothing.
    expect(box).toHaveAttribute('aria-expanded');
    expect(box).toHaveAttribute('aria-autocomplete', 'list');
    expect(box).toHaveAttribute('placeholder', 'Select a model');
    // The old placeholder named a DEPRECATED catalogue id, which is exactly
    // the kind of thing a free-text field teaches people to copy.
    expect(screen.queryByPlaceholderText('qwen3-8b-q4km')).not.toBeInTheDocument();
  });

  it('will not let the form be submitted with no model chosen', async () => {
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);

    const box = (await screen.findByRole('combobox', { name: /model/i })) as HTMLInputElement;
    // THE PLATFORM'S OWN VALIDITY, attached to the VALUE rather than to the
    // text in the box — which holds a search string. And it says what to do
    // rather than "please fill out this field".
    expect(box.checkValidity()).toBe(false);
    expect(box.validationMessage).toMatch(/choose a model/i);

    const user = userEvent.setup();
    // Typing is not choosing, which is the whole point of the control.
    await user.type(box, 'qwen3.5-9b-q4km');
    expect(box.checkValidity()).toBe(false);

    const list = await screen.findByRole('listbox');
    await user.click(within(list).getByText('Qwen3.5-9B Q4_K_M'));
    expect(box.checkValidity()).toBe(true);
    expect(box.validationMessage).toBe('');
  });

  it("keeps the name field's pattern a regular expression browsers accept", async () => {
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);

    const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
    const source = name.getAttribute('pattern');
    expect(source).toBeTruthy();

    // THE PROPERTY, NOT THE SPELLING. Chromium compiles `pattern` with the `v`
    // flag and DROPS one it cannot parse — so a field can look constrained and
    // validate nothing. This one did: `[a-z0-9-]` is an invalid character
    // class under `v`, and the browser logged it while accepting any name.
    for (const flags of ['u', 'v']) {
      expect(
        () => new RegExp(`^(?:${source})$`, flags),
        `the name pattern does not compile with the ${flags} flag, so a browser using it validates nothing`,
      ).not.toThrow();
    }
    // And it still means what it says.
    const re = new RegExp(`^(?:${source})$`, 'v');
    expect(re.test('my-assistant')).toBe(true);
    expect(re.test('My_Assistant')).toBe(false);
    expect(re.test('-leading')).toBe(false);
  });

  it('narrows the models to the task being asked for', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/fleet/run');
    render(<App />);
    await screen.findByRole('combobox', { name: /model/i });

    await user.selectOptions(screen.getByLabelText(/task/i), 'embed');

    await waitFor(() => {
      const asked = calls.filter((c) => c.url.includes('/models')).pop();
      expect(asked?.url).toContain('task=embed');
    });
  });
});
