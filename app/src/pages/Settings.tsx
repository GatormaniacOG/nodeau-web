import { useState } from 'react';
import { api, type Me, type Organization } from '../lib/api';
import { ErrorNotice } from '../components/ui';

/**
 * Settings, kept to what genuinely exists.
 *
 * There is no profile editing here because the identity provider owns the name
 * and the email — Nodeau records what it was told and would only be offering a
 * field that gets overwritten at the next sign-in. Renaming an organisation and
 * inviting members are Business features (Phase 13) and are not stubbed:
 * an input that saves nothing is worse than its absence.
 */
export function SettingsPage({ me, org }: { me: Me; org: Organization }) {
  const [error, setError] = useState<unknown>(null);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await api.logout();
      // A full navigation rather than a route change: signing out must clear
      // every piece of in-memory state, and reloading is the one way to be
      // certain of that.
      window.location.assign('/signin');
    } catch (e) {
      setError(e);
      setSigningOut(false);
    }
  };

  return (
    <section className="narrow">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <dl className="detail">
        <dt>Signed in as</dt>
        <dd>{me.user.email}</dd>

        <dt>Name</dt>
        <dd>{me.user.displayName || '—'}</dd>

        <dt>Workspace</dt>
        <dd>
          {org.name} <span className="muted small">({org.kind})</span>
        </dd>

        <dt>Your role</dt>
        <dd>{org.role}</dd>
      </dl>

      <div className="panel quiet">
        <h2>What this account holds</h2>
        <p className="muted">
          Your identity, your organisation, your subscription, and the installations you
          have linked with the version and machine counts they reported. It does not hold
          prompts, documents, batch inputs, results or model weights — Nodeau does not send
          them, and there is nowhere here to put them.
        </p>
      </div>

      {error ? <ErrorNotice error={error} /> : null}

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </section>
  );
}
