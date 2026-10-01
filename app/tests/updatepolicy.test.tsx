import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { FleetChannelPolicy, FleetMaintenanceWindow, Me, RolloutList } from '../src/lib/api';
import { clock, daysLabel, lengthLabel, windowLabel } from '../src/pages/FleetUpdatePolicy';

/**
 * A fleet's maintenance window and release channel, set from the account
 * (post-18). These prove the console SAYS what the server holds — never "no
 * window" while it is still reading — sends exactly the request the form
 * shows, offers only the channels the server lists, and offers nothing to a
 * person the server says may not change it. That the server refuses such a
 * person anyway, and that a window reaches the machines, is proved against the
 * real API and on the fleet.
 */

const ORG = 'org1';
const FLEET = `/v1/organizations/${ORG}/fleet`;

const ME: Me = {
  user: { id: 'u1', email: 'owner@acme.example', displayName: 'Sam Rivers' },
  organizations: [{ id: ORG, name: 'Acme', slug: 'acme', kind: 'personal', role: 'owner' }],
};

const NO_ROLLOUTS: RolloutList = { operations: [], mayUpgrade: true };

type Reply = { status: number; body: unknown; hold?: Promise<void> };
let routes: Map<string, Reply>;
let sent: { method: string; path: string; body?: string }[];
const key = (method: string, path: string) => `${method} ${path}`;
const reply = (method: string, path: string, body: unknown, status = 200, hold?: Promise<void>) =>
  routes.set(key(method, path), { status, body, hold });

function windowOf(over: Partial<FleetMaintenanceWindow> = {}): FleetMaintenanceWindow {
  return {
    installationId: 'inst-1',
    startMinute: 180,
    durationMinutes: 60,
    timezone: 'America/New_York',
    daysOfWeek: [0],
    configured: true,
    openNow: false,
    nextOpensAt: '2026-10-04T07:00:00Z',
    setByEmail: 'owner@acme.example',
    updatedAt: '2026-09-30T06:22:23Z',
    mayManage: true,
    ...over,
  };
}

function channelOf(over: Partial<FleetChannelPolicy> = {}): FleetChannelPolicy {
  return {
    installationId: 'inst-1',
    channel: 'beta',
    configured: false,
    availableChannels: ['beta'],
    runningVersion: 'v0.15.0-beta.7',
    mayManage: true,
    ...over,
  };
}

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
      if (match?.hold) await match.hold;
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
  reply('GET', `${FLEET}/lifecycle/operations`, NO_ROLLOUTS);
  window.history.pushState({}, '', '/fleet/upgrade');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const windowPanel = async () => within(await screen.findByRole('region', { name: 'Maintenance window' }));
const channelPanel = async () => within(await screen.findByRole('region', { name: 'Release channel' }));

describe('the maintenance window', () => {
  it('says it is reading, never "no window", until the server answers', async () => {
    let release!: () => void;
    reply('GET', `${FLEET}/maintenance`, windowOf({ configured: false }), 200,
      new Promise<void>((r) => { release = r; }));
    reply('GET', `${FLEET}/channel`, channelOf());
    render(<App />);
    const panel = await windowPanel();
    expect(await panel.findByText(/Reading this fleet's maintenance window/)).toBeInTheDocument();
    expect(panel.queryByText(/No window set/)).not.toBeInTheDocument();
    release();
    expect(await panel.findByText('No window set')).toBeInTheDocument();
  });

  it('shows a set window, that it is closed, and when it next opens, from the server', async () => {
    reply('GET', `${FLEET}/maintenance`, windowOf());
    reply('GET', `${FLEET}/channel`, channelOf());
    render(<App />);
    const panel = await windowPanel();
    expect(await panel.findByText('Sundays, 03:00 to 04:00 (America/New_York)')).toBeInTheDocument();
    expect(panel.getByText('Closed')).toBeInTheDocument();
    expect(panel.getByText(/It next opens/)).toBeInTheDocument();
  });

  it('a server error is shown as an error, not as "no window"', async () => {
    reply('GET', `${FLEET}/maintenance`, { code: 'INTERNAL', message: 'the database is unreachable' }, 500);
    reply('GET', `${FLEET}/channel`, channelOf());
    render(<App />);
    const panel = await windowPanel();
    expect(await panel.findByText('the database is unreachable')).toBeInTheDocument();
    expect(panel.queryByText('No window set')).not.toBeInTheDocument();
  });

  it('sends exactly the window the form shows, and clears with clear:true', async () => {
    reply('GET', `${FLEET}/maintenance`, windowOf({ configured: false, daysOfWeek: [], openNow: undefined, nextOpensAt: undefined }));
    reply('GET', `${FLEET}/channel`, channelOf());
    reply('PUT', `${FLEET}/maintenance`, windowOf());
    const user = userEvent.setup();
    render(<App />);
    const panel = await windowPanel();
    await user.click(await panel.findByRole('button', { name: 'Set a window' }));
    // Default draft: Sunday 03:00 for 1 hour. Add Saturday.
    await user.click(panel.getByRole('checkbox', { name: /Saturday/ }));
    await user.selectOptions(panel.getByRole('combobox', { name: 'Time zone' }), 'America/New_York');
    await user.click(panel.getByRole('button', { name: 'Save window' }));
    await waitFor(() => expect(sent.some((r) => r.method === 'PUT')).toBe(true));
    const put = sent.find((r) => r.method === 'PUT' && r.path === `${FLEET}/maintenance`)!;
    expect(JSON.parse(put.body!)).toEqual({
      startMinute: 180, durationMinutes: 60, timezone: 'America/New_York', daysOfWeek: [0, 6],
    });
  });

  it('removing the window asks first, then sends clear:true', async () => {
    reply('GET', `${FLEET}/maintenance`, windowOf());
    reply('GET', `${FLEET}/channel`, channelOf());
    reply('PUT', `${FLEET}/maintenance`, windowOf({ configured: false }));
    const user = userEvent.setup();
    render(<App />);
    const panel = await windowPanel();
    await user.click(await panel.findByRole('button', { name: 'Change window' }));
    await user.click(panel.getByRole('button', { name: 'Remove window' }));
    expect(sent.some((r) => r.method === 'PUT')).toBe(false);
    await user.click(panel.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(sent.some((r) => r.method === 'PUT')).toBe(true));
    const put = sent.find((r) => r.method === 'PUT')!;
    expect(JSON.parse(put.body!)).toEqual({ clear: true });
  });

  it('offers nothing to somebody the server says may not change it', async () => {
    reply('GET', `${FLEET}/maintenance`, windowOf({ mayManage: false }));
    reply('GET', `${FLEET}/channel`, channelOf({ mayManage: false }));
    render(<App />);
    const wp = await windowPanel();
    expect(await wp.findByText(/You can see this setting and not change it/)).toBeInTheDocument();
    expect(wp.queryByRole('button', { name: /window/i })).not.toBeInTheDocument();
    const cp = await channelPanel();
    expect(cp.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });
});

describe('the release channel', () => {
  it('says whether anybody chose the channel, and offers only the ones the server lists', async () => {
    reply('GET', `${FLEET}/maintenance`, windowOf());
    reply('GET', `${FLEET}/channel`, channelOf());
    reply('PUT', `${FLEET}/channel`, channelOf({ configured: true, pinnedVersion: 'v0.15.0-beta.7' }));
    const user = userEvent.setup();
    render(<App />);
    const panel = await channelPanel();
    expect(await panel.findByText('(the default)')).toBeInTheDocument();
    await user.click(panel.getByRole('button', { name: 'Change' }));
    // One published channel: said, not offered as a choice of one.
    expect(panel.getByText(/Nodeau publishes one channel today/)).toBeInTheDocument();
    expect(panel.queryByRole('combobox')).not.toBeInTheDocument();
    // Hold at what the machines run — a version they really run, never typed.
    await user.click(panel.getByRole('radio', { name: 'Stay on v0.15.0-beta.7' }));
    await user.click(panel.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent.some((r) => r.method === 'PUT')).toBe(true));
    const put = sent.find((r) => r.method === 'PUT' && r.path === `${FLEET}/channel`)!;
    expect(JSON.parse(put.body!)).toEqual({ channel: 'beta', pinnedVersion: 'v0.15.0-beta.7' });
  });

  it('a channel list with several entries is a choice, and nothing else can be picked', async () => {
    reply('GET', `${FLEET}/maintenance`, windowOf());
    reply('GET', `${FLEET}/channel`, channelOf({ availableChannels: ['beta', 'stable'] }));
    const user = userEvent.setup();
    render(<App />);
    const panel = await channelPanel();
    await user.click(await panel.findByRole('button', { name: 'Change' }));
    const options = within(panel.getByRole('combobox', { name: 'Channel' })).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['beta', 'stable']);
  });
});

describe('formatting', () => {
  it('reads a window off its own clock', () => {
    expect(clock(180)).toBe('03:00');
    expect(clock(1439)).toBe('23:59');
    expect(lengthLabel(60)).toBe('1 hour');
    expect(lengthLabel(90)).toBe('1 h 30 min');
    expect(daysLabel([])).toBe('Every day');
    expect(daysLabel([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(windowLabel({ startMinute: 1380, durationMinutes: 120, daysOfWeek: [6], timezone: 'UTC' }))
      .toBe('Saturdays, 23:00 to 01:00 the next day (UTC)');
  });
});
