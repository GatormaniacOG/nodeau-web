import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import type { Me } from '../src/lib/api';

/**
 * The organisation admin page — Phase 17B.
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

const ME: Me = {
  user: { id: 'u1', email: 'owner@acme.example', displayName: 'Sam Rivers' },
  organizations: [
    { id: 'org1', name: 'Acme', slug: 'acme', kind: 'team', role: 'owner' },
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

describe('the members tab', () => {
  it('renders what the SERVER says each person may do, never a recomputation', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    render(<App />);

    expect(await screen.findByText('dana@acme.example')).toBeInTheDocument();
    // Dana is a viewer whose TEAM makes her an operator. Showing only the
    // direct role would send somebody to grant a permission she already has.
    expect(screen.getByText(/\+ member by team/i)).toBeInTheDocument();
    expect(screen.getAllByText(/fleet\.operate/).length).toBeGreaterThan(0);
  });

  it('shows a deactivated person rather than dropping them', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    render(<App />);

    // A list that silently dropped them makes "why is this person in the audit
    // log" unanswerable from the product.
    expect(await screen.findByText('gone@acme.example')).toBeInTheDocument();
    expect(screen.getByText(/no access/i)).toBeInTheDocument();
    // And they hold nothing, which is what the server said.
    expect(screen.getByText('nothing')).toBeInTheDocument();
  });

  it('offers only the roles the server says the caller may grant', async () => {
    reply('GET', '/v1/me', ME);
    // An admin: may grant up to admin, never owner.
    reply(
      'GET',
      '/v1/organizations/org1/members',
      members({ role: 'admin', grantable: ['viewer', 'member', 'admin'] }),
    );
    render(<App />);

    await screen.findByText('gone@acme.example');
    // The caller's own row: active, not directory-owned, so it is editable.
    const select = screen.getByLabelText('Role for owner@acme.example') as HTMLSelectElement;
    const offered = Array.from(select.options).map((o) => o.value);
    // `grantable` is the SERVER's answer. A client that decided this from the
    // role name would be a second implementation of the rule.
    expect(offered).toContain('admin');
    expect(offered).not.toContain('owner');
  });

  it('does not offer to edit a membership an identity provider owns', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    render(<App />);

    await screen.findByText('dana@acme.example');
    // A control the next sync would undo is worse than no control: it appears
    // to work and the change is gone within the hour.
    expect(screen.queryByLabelText('Role for dana@acme.example')).not.toBeInTheDocument();
    expect(screen.getAllByText(/from your directory/i).length).toBeGreaterThan(0);
  });
});

describe('service accounts and keys', () => {
  it('shows a secret exactly once, and never asks for it again', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/service-accounts', {
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
    });
    reply('GET', '/v1/organizations/org1/service-accounts/sa1/keys', {
      keys: [],
      grantable: ['fleet.view', 'organization.view'],
    });
    reply('POST', '/v1/organizations/org1/service-accounts/sa1/keys', {
      key: {
        id: 'k1',
        name: 'deploy',
        prefix: 'nodeau-sak-v1.sa1',
        scope: ['fleet.view'],
        createdAt: new Date().toISOString(),
        live: true,
      },
      token: 'nodeau-sak-v1.sa1.SECRETVALUE',
      notice: 'Copy this now. Nodeau stores only a hash of it.',
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: /service accounts/i }));
    await user.click(await screen.findByRole('button', { name: /manage keys/i }));

    await user.type(await screen.findByLabelText(/new key/i), 'deploy');
    await user.click(screen.getByLabelText('fleet.view'));
    await user.click(screen.getByRole('button', { name: /create key/i }));

    // The one place a credential is ever rendered.
    expect(await screen.findByText('nodeau-sak-v1.sa1.SECRETVALUE')).toBeInTheDocument();
    expect(screen.getByText(/stores only a hash/i)).toBeInTheDocument();

    // And it is gone once acknowledged. There is no endpoint that reads it
    // back, so a page that kept showing it would be the only copy.
    await user.click(screen.getByRole('button', { name: /i have copied it/i }));
    await waitFor(() =>
      expect(screen.queryByText('nodeau-sak-v1.sa1.SECRETVALUE')).not.toBeInTheDocument(),
    );
  });

  it('cannot create a key with no scope', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/service-accounts', {
      accounts: [
        {
          id: 'sa1',
          name: 'ci',
          role: 'viewer',
          capabilities: ['fleet.view'],
          enabled: true,
          keyCount: 0,
          createdAt: new Date().toISOString(),
        },
      ],
      roles: members().roles,
    });
    reply('GET', '/v1/organizations/org1/service-accounts/sa1/keys', {
      keys: [],
      grantable: ['fleet.view'],
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /service accounts/i }));
    await user.click(await screen.findByRole('button', { name: /manage keys/i }));
    await user.type(await screen.findByLabelText(/new key/i), 'deploy');

    // The server refuses one too. This stops the caller sending a request that
    // cannot succeed, which is courtesy — the refusal is the server's.
    expect(screen.getByRole('button', { name: /create key/i })).toBeDisabled();
  });

  it('reads a refusal as an ordinary state rather than a fault', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members({ role: 'viewer', grantable: [] }));
    reply(
      'GET',
      '/v1/organizations/org1/service-accounts',
      { code: 'FORBIDDEN', message: 'This needs the credentials.manage permission.' },
      403,
    );

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /service accounts/i }));

    // A viewer without the permission is not an error screen. It is somebody
    // being told, in the server's own words, what they would need.
    expect(await screen.findByText(/credentials\.manage/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('single sign-on', () => {
  it('distinguishes "not configured" from "we have not asked"', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/identity', {
      sso: 'unknown',
      directory: 'unconfigured',
      provider: 'workos',
      notice: 'Nodeau has not yet been told which identity provider organisation this is.',
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /single sign-on/i }));

    // Three-valued, never a boolean: "we have never asked" and "there is none"
    // send different people to do different things.
    expect(await screen.findByText(/not known yet/i)).toBeInTheDocument();
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    // The 'last directory event' cell, specifically — an exact match, because
    // 'never' also appears in the explanatory prose below it.
    expect(screen.getByText('never')).toBeInTheDocument();
  });

  it('says Nodeau does not run a directory of its own', async () => {
    reply('GET', '/v1/me', ME);
    reply('GET', '/v1/organizations/org1/members', members());
    reply('GET', '/v1/organizations/org1/identity', {
      sso: 'active',
      directory: 'active',
      provider: 'workos',
      lastDirectoryEventAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /single sign-on/i }));

    // The claim that must not drift: Nodeau receives directory events. It does
    // not implement SCIM and does not become an identity provider.
    expect(
      await screen.findByText(/does not run a directory of its own/i),
    ).toBeInTheDocument();
  });
});
