import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { Me } from '../src/lib/api';

/**
 * The organisation admin page — Phase 17B, Phase 21's Teams & Identity.
 *
 * # What these tests are for, and what they are NOT
 *
 * UI HIDING IS NOT AUTHORIZATION. Nothing here proves anybody is refused;
 * that is the server's job and is proved against the real API in
 * `internal/cloud/api`. What these prove is that the console does not INVENT
 * authorization — it renders what the server said and offers nothing the server
 * said the caller may not do.
 *
 * The failure mode being guarded against is a client that recomputes
 * permissions from a role name. That is a second implementation of the
 * permission model, and it disagrees with the server the day a role changes.
 */

const BUSINESS = ['MultiNode', 'MultiGPU', 'BatchJobs', 'RemoteManagement', 'Teams', 'ServiceAccounts', 'SingleSignOn'];

const ME: Me = {
  user: { id: 'u1', email: 'owner@acme.example', displayName: 'Sam Rivers' },
  organizations: [
    {
      id: 'org1',
      name: 'Acme',
      slug: 'acme',
      kind: 'team',
      role: 'owner',
      capabilities: [
        'billing.manage', 'credentials.manage', 'fleet.operate', 'fleet.upgrade', 'fleet.view',
        'governance.manage', 'machine.manage', 'members.manage', 'organization.manage',
        'organization.view', 'workload.logs.read',
      ],
      features: BUSINESS,
    },
  ],
};

const HOME_ME: Me = {
  user: { id: 'u9', email: 'solo@home.example' },
  organizations: [
    {
      id: 'home1',
      name: 'solo@home.example',
      slug: 'solo',
      kind: 'personal',
      role: 'owner',
      capabilities: ['organization.view', 'fleet.view', 'members.manage', 'organization.manage'],
      features: [],
    },
  ],
};

type Reply = { status: number; body: unknown };
let routes: Map<string, Reply>;
let calls: { key: string; body?: string }[];

function key(method: string, path: string) {
  return `${method} ${path}`;
}
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
      const k = key(init?.method ?? 'GET', new URL(url).pathname);
      calls.push({ k, body: init?.body as string | undefined } as never);
      const match = routes.get(k);
      if (!match) {
        return new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'no route: ' + k }), {
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
  window.history.pushState({}, '', '/organization');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function capabilitiesFor(role: string): string[] {
  const viewer = ['fleet.view', 'organization.view'];
  const member = [...viewer, 'fleet.operate', 'workload.logs.read'];
  const admin = [...member, 'credentials.manage', 'machine.manage', 'members.manage'];
  const owner = [...admin, 'billing.manage', 'organization.manage'];
  switch (role) {
    case 'owner':
      return owner.sort();
    case 'admin':
      return admin.sort();
    case 'member':
      return member.sort();
    default:
      return viewer.sort();
  }
}

function members(over: Partial<{ role: string; grantable: string[] }> = {}) {
  const role = over.role ?? 'owner';
  const grantable = over.grantable ?? ['viewer', 'member', 'admin', 'owner'];
  return {
    members: [
      {
        userId: 'u1',
        email: 'owner@acme.example',
        displayName: 'Sam Rivers',
        role,
        // WHAT THE SERVER WOULD SAY, per role. The fixture has to be honest
        // about this or the page is being tested against a permission set no
        // server produces — which is how a console starts recomputing its own.
        capabilities: capabilitiesFor(role),
        active: true,
      },
      {
        userId: 'u2',
        email: 'dana@acme.example',
        role: 'viewer',
        teamRoles: ['member'],
        capabilities: ['fleet.operate', 'fleet.view', 'organization.view', 'workload.logs.read'],
        active: true,
        fromDirectory: true,
      },
      {
        userId: 'u3',
        email: 'gone@acme.example',
        role: 'member',
        capabilities: [],
        active: false,
      },
    ],
    roles: [
      { role: 'viewer', capabilities: ['fleet.view', 'organization.view'], grantable: grantable.includes('viewer') },
      { role: 'member', capabilities: ['fleet.operate'], grantable: grantable.includes('member') },
      { role: 'admin', capabilities: ['members.manage'], grantable: grantable.includes('admin') },
      { role: 'owner', capabilities: ['billing.manage'], grantable: grantable.includes('owner') },
    ],
  };
}

function serviceAccounts() {
  return {
    accounts: [
      {
        id: 'sa1',
        name: 'ci',
        role: 'viewer',
        capabilities: ['fleet.view', 'organization.view'],
        enabled: true,
        keyCount: 0,
        createdAt: new Date().toISOString(),
      },
    ],
    roles: members().roles,
  };
}

describe('people', () => {
  it('renders what the SERVER says each person may do, and names member Operator', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/invitations', { invitations: [] });
    render(<App />);
    expect(await screen.findByText('dana@acme.example')).toBeInTheDocument();
    // Dana's team makes her an operator; the server says so in her capabilities.
    expect(screen.getByText(/\+ Operator by team/)).toBeInTheDocument();
    // A removed person is shown, flagged, and may be brought back by a person.
    expect(screen.getByText('gone@acme.example')).toBeInTheDocument();
    expect(screen.getByText('no access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore access/i })).toBeInTheDocument();
  });

  it('offers only the roles the server says the caller may grant, and not over somebody above them', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members({ grantable: ['viewer', 'member'] }));
    reply('GET', '/v1/organizations/org1/invitations', { invitations: [] });
    render(<App />);
    await screen.findByText('dana@acme.example');
    // Dana's membership is her directory's: not editable here.
    expect(screen.queryByLabelText('Role for dana@acme.example')).toBeNull();
    // The owner's row (role owner) is above what this caller may grant.
    expect(screen.queryByLabelText('Role for owner@acme.example')).toBeNull();
    const invite = await screen.findByLabelText('as');
    const options = Array.from((invite as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(['Viewer', 'Operator']);
  });

  it('does not offer to demote or remove the only owner, and says why', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/invitations', { invitations: [] });
    render(<App />);
    expect(await screen.findByText(/the only owner\. make somebody else an owner first/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Role for owner@acme.example')).toBeNull();
  });
});

describe('invitations', () => {
  it('shows the link once, carrying the token only in its fragment', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/invitations', { invitations: [] });
    reply('POST', '/v1/organizations/org1/invitations', {
      invitation: { id: 'i1', email: 'new@acme.example', role: 'viewer', state: 'pending', createdAt: '2026-10-21T00:00:00Z', expiresAt: '2026-10-28T00:00:00Z' },
      token: 'nodeau-inv-v1.i1.SECRETINVITE',
      link: 'https://app.nodeau.test/invite#nodeau-inv-v1.i1.SECRETINVITE',
      delivery: 'link',
      notice: 'Copy this link and send it to new@acme.example yourself.',
    }, 201);
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Email address'), 'new@acme.example');
    await user.click(screen.getByRole('button', { name: /create invitation/i }));
    const shown = await screen.findByTestId('invite-link');
    expect(shown).toHaveTextContent('/invite#nodeau-inv-v1.i1.SECRETINVITE');
    expect(window.location.href).not.toContain('SECRETINVITE');
    const sent = calls.find((c) => (c as unknown as { k: string }).k === 'POST /v1/organizations/org1/invitations');
    expect(JSON.parse(sent!.body!)).toEqual({ email: 'new@acme.example', role: 'viewer' });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByText(/SECRETINVITE/)).not.toBeInTheDocument());
  });

  it('lists waiting invitations with a way to cancel, and accepted ones without', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/invitations', {
      invitations: [
        { id: 'i1', email: 'wait@acme.example', role: 'member', state: 'pending', createdAt: '2026-10-21T00:00:00Z', expiresAt: '2026-10-28T00:00:00Z', invitedBy: 'Sam Rivers' },
        { id: 'i2', email: 'in@acme.example', role: 'viewer', state: 'accepted', createdAt: '2026-10-20T00:00:00Z', expiresAt: '2026-10-27T00:00:00Z', acceptedAt: '2026-10-20T01:00:00Z' },
      ],
    });
    render(<App />);
    const table = await screen.findByTestId('invitations');
    expect(table).toHaveTextContent('wait@acme.example');
    expect(table).toHaveTextContent('waiting');
    expect(table).toHaveTextContent('accepted');
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });
});

describe('one person\'s plan', () => {
  it('shows Home its own membership and a plain sentence about Business, never a 404 or a broken control', async () => {
    reply('GET', '/v1/me', HOME_ME);
    render(<App />);
    expect(await screen.findByTestId('plan-boundary')).toHaveTextContent(/part of Nodeau Business/i);
    expect(screen.queryByRole('navigation', { name: /organisation sections/i })).toBeNull();
    expect(screen.queryByText(/create invitation/i)).toBeNull();
    // And the navigation does not offer a team surface that does not apply.
    expect(screen.queryByRole('link', { name: 'Organisation' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fleet' })).toBeInTheDocument();
  });

  it('shows Business the Organisation item', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/invitations', { invitations: [] });
    render(<App />);
    expect(await screen.findByRole('link', { name: 'Organisation' })).toBeInTheDocument();
  });
});

describe('service accounts and keys', () => {
  it('shows a secret exactly once, sends the chosen expiry, and never asks for it again', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/service-accounts', serviceAccounts());
    reply('GET', '/v1/organizations/org1/service-accounts/sa1/keys', { keys: [], grantable: ['fleet.view', 'organization.view'] });
    reply('POST', '/v1/organizations/org1/service-accounts/sa1/keys', {
      key: { id: 'k1', name: 'deploy', prefix: 'nodeau-sak-v1.sa1', scope: ['fleet.view'], createdAt: new Date().toISOString(), live: true },
      token: 'nodeau-sak-v1.sa1.SECRETVALUE',
      notice: 'Copy this now. Nodeau stores only a hash of it.',
    }, 201);
    window.history.pushState({}, '', '/organization/service-accounts');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /manage keys/i }));
    await user.type(await screen.findByLabelText(/new key/i), 'deploy');
    await user.selectOptions(screen.getByLabelText(/expires after/i), '30');
    await user.click(screen.getByLabelText('fleet.view'));
    await user.click(screen.getByRole('button', { name: /create key/i }));
    expect(await screen.findByText('nodeau-sak-v1.sa1.SECRETVALUE')).toBeInTheDocument();
    const sent = calls.find((c) => (c as unknown as { k: string }).k === 'POST /v1/organizations/org1/service-accounts/sa1/keys');
    const body = JSON.parse(sent!.body!);
    const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
    await user.click(screen.getByRole('button', { name: /i have copied it/i }));
    await waitFor(() => expect(screen.queryByText('nodeau-sak-v1.sa1.SECRETVALUE')).not.toBeInTheDocument());
  });

  it('cannot create a key with no scope', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/service-accounts', serviceAccounts());
    reply('GET', '/v1/organizations/org1/service-accounts/sa1/keys', { keys: [], grantable: ['fleet.view'] });
    window.history.pushState({}, '', '/organization/service-accounts');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /manage keys/i }));
    await user.type(await screen.findByLabelText(/new key/i), 'deploy');
    expect(screen.getByRole('button', { name: /create key/i })).toBeDisabled();
  });

  it('reads a refusal as an ordinary state rather than a fault', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/service-accounts', { code: 'FORBIDDEN', message: 'This needs the credentials.manage permission.' }, 403);
    window.history.pushState({}, '', '/organization/service-accounts');
    render(<App />);
    expect(await screen.findByText(/not yours to manage/i)).toBeInTheDocument();
  });
});

function ssoStatus(over: Record<string, unknown> = {}) {
  return {
    sso: 'unconfigured',
    directory: 'unconfigured',
    provider: 'workos',
    notice: 'Send your IT administrator a setup link to connect your identity provider.',
    setup: {
      configured: true,
      connectionActive: false,
      connections: [],
      required: false,
      domains: [{ id: 'd1', domain: 'acme.example', verified: false, state: 'pending', verificationPrefix: '_workos-challenge', verificationToken: 'tok-123' }],
      canRequire: false,
      requireBlockers: ['No email domain is verified yet, so nobody would be held to it.', 'Your identity provider\'s connection is not active yet.'],
      recentRecoveryAccess: 0,
      providerReachable: true,
      ...over,
    },
  };
}

describe('single sign-on', () => {
  it('keeps configured, active, tested and required apart, and says what blocks requiring it', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/identity', ssoStatus());
    window.history.pushState({}, '', '/organization/sign-in');
    render(<App />);
    const states = await screen.findByTestId('sso-states');
    expect(states).toHaveTextContent('Set up');
    expect(states).toHaveTextContent('not active');
    expect(states).toHaveTextContent('nobody has signed in through it yet');
    expect(states).toHaveTextContent('optional');
    expect(screen.getByRole('button', { name: 'Require single sign-on' })).toBeDisabled();
    expect(screen.getByTestId('sso-blockers')).toHaveTextContent(/no email domain is verified/i);
    // The DNS record that proves the domain.
    expect(screen.getByText('_workos-challenge.acme.example')).toBeInTheDocument();
    expect(screen.getByText('tok-123')).toBeInTheDocument();
  });

  it('asks before requiring it, and only once the server says it can', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/identity', ssoStatus({ connectionActive: true, lastSignInAt: new Date().toISOString(), canRequire: true, requireBlockers: [], domains: [{ id: 'd1', domain: 'acme.example', verified: true }] }));
    reply('PATCH', '/v1/organizations/org1/identity', ssoStatus({ connectionActive: true, required: true, canRequire: true, requireBlockers: [] }));
    window.history.pushState({}, '', '/organization/sign-in');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Require single sign-on' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/asked to sign in again/i);
    await user.click(screen.getByRole('button', { name: 'Require it' }));
    await waitFor(() => expect(screen.getByTestId('sso-states')).toHaveTextContent('required'));
    const sent = calls.find((c) => (c as unknown as { k: string }).k === 'PATCH /v1/organizations/org1/identity');
    expect(JSON.parse(sent!.body!)).toEqual({ ssoRequired: true });
  });

  it('has no form that types a provider id any more', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/identity', ssoStatus({ configured: false, domains: [] }));
    window.history.pushState({}, '', '/organization/sign-in');
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Set up single sign-on' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/org_/)).toBeNull();
    expect(screen.queryByLabelText(/identity provider organisation/i)).toBeNull();
  });
});

describe('the organisation switcher', () => {
  it('lists every organisation the person is in, and remembers the choice in this browser only', async () => {
    const two: Me = { ...ME, organizations: [...ME.organizations, { ...HOME_ME.organizations[0]!, id: 'home2', name: 'My own' }] };
    reply('GET', '/v1/me', two);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/invitations', { invitations: [] });
    window.localStorage.removeItem('nodeau.organization');
    const user = userEvent.setup();
    render(<App />);
    const switcher = (await screen.findByLabelText('Organisation')) as HTMLSelectElement;
    // The personal one first when nothing was chosen.
    expect(switcher.value).toBe('home2');
    await user.selectOptions(switcher, 'org1');
    expect(window.localStorage.getItem('nodeau.organization')).toBe('org1');
    await waitFor(() => expect((screen.getByLabelText('Organisation') as HTMLSelectElement).value).toBe('org1'));
    window.localStorage.removeItem('nodeau.organization');
  });
});

describe('a refusal that has a way back', () => {
  it('turns SSO_REQUIRED into a sign-in through the organisation\'s own connection', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', {
      code: 'SSO_REQUIRED', message: 'Acme requires you to sign in through its single sign-on.', signInUrl: '/v1/auth/login?sso=org1',
    }, 403);
    render(<App />);
    const link = await screen.findByRole('link', { name: /sign in with single sign-on/i });
    expect(link.getAttribute('href')).toMatch(/\/v1\/auth\/login\?sso=org1&returnTo=%2Forganization$/);
  });
});
