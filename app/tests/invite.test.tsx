import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

/**
 * Accepting an invitation — Phase 21.
 *
 * The token lives in the link's FRAGMENT; these prove the page reads it there,
 * removes it from the address bar, sends it only in a request BODY, and says
 * plainly what to do in each state.
 */

const TOKEN = 'nodeau-inv-v1.0b0d2c48-0000-4000-8000-000000000001.SECRETTOKEN';
let calls: { key: string; body?: string }[];
let routes: Map<string, { status: number; body: unknown }>;

function reply(method: string, path: string, body: unknown, status = 200) {
  routes.set(`${method} ${path}`, { status, body });
}

beforeEach(() => {
  routes = new Map();
  calls = [];
  window.sessionStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const key = `${init?.method ?? 'GET'} ${url.pathname}`;
      calls.push({ key: key + url.search, body: init?.body as string | undefined });
      const match = routes.get(key);
      if (!match) {
        return new Response(JSON.stringify({ code: 'AUTH_REQUIRED', message: 'You are not signed in.' }), { status: 401 });
      }
      return new Response(JSON.stringify(match.body), { status: match.status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  window.history.pushState({}, '', '/invite#' + TOKEN);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PERSONAL = { id: 'own', name: 'Mine', slug: 'mine', kind: 'personal', role: 'owner', capabilities: [], features: [] };

const PREVIEW = {
  organizationName: 'Acme',
  role: 'member',
  invitedBy: 'Sam Rivers',
  expiresAt: '2026-10-28T00:00:00Z',
  state: 'pending',
  email: 'dana@acme.example',
};

describe('the invitation page', () => {
  it('lets a signed-out person read it, takes the token out of the address bar, and sends it only in a body', async () => {
    reply('POST', '/v1/invitations/preview', PREVIEW);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Join Acme' })).toBeInTheDocument();
    expect(screen.getByText(/as Operator/)).toBeInTheDocument();
    expect(window.location.href).not.toContain('SECRETTOKEN');
    for (const c of calls) {
      expect(c.key).not.toContain('SECRETTOKEN');
    }
    const preview = calls.find((c) => c.key.startsWith('POST /v1/invitations/preview'));
    expect(JSON.parse(preview!.body!)).toEqual({ token: TOKEN });
    const signIn = screen.getByRole('link', { name: /sign in as dana@acme\.example to accept/i });
    expect(signIn.getAttribute('href')).toContain('returnTo=%2Finvite');
    expect(signIn.getAttribute('href')).not.toContain('SECRETTOKEN');
  });

  it('accepts for the right signed-in person and says where they are', async () => {
    reply('GET', '/v1/me', { user: { id: 'u2', email: 'dana@acme.example' }, organizations: [PERSONAL] });
    reply('POST', '/v1/invitations/preview', PREVIEW);
    reply('POST', '/v1/invitations/accept', { organization: { id: 'org1', name: 'Acme', slug: 'acme', kind: 'team', role: 'member' } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /accept and join/i }));
    expect(await screen.findByTestId('invite-joined')).toHaveTextContent(/part of Acme as Operator/);
    expect(window.sessionStorage.getItem('nodeau.invitation')).toBeNull();
  });

  it('tells somebody signed in as another address what to do, and offers no accept', async () => {
    reply('GET', '/v1/me', { user: { id: 'u3', email: 'mallory@elsewhere.example' }, organizations: [PERSONAL] });
    reply('POST', '/v1/invitations/preview', PREVIEW);
    render(<App />);
    expect(await screen.findByText(/this invitation is for dana@acme\.example/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });

  it('says an invitation is used, cancelled or expired rather than offering it', async () => {
    reply('POST', '/v1/invitations/preview', { ...PREVIEW, state: 'expired' });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/);
    expect(screen.queryByRole('link', { name: /to accept/i })).toBeNull();
  });

  it('turns an acceptance refusal into its own sentence', async () => {
    reply('GET', '/v1/me', { user: { id: 'u2', email: 'dana@acme.example' }, organizations: [PERSONAL] });
    reply('POST', '/v1/invitations/preview', PREVIEW);
    reply('POST', '/v1/invitations/accept', { code: 'EMAIL_NOT_VERIFIED', message: 'Your email address has not been verified yet.' }, 403);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /accept and join/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not verified yet/));
  });
});
