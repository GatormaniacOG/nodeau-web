import { useEffect, useState } from 'react';
import { api, ApiError, signInURL, type InvitationPreview, type Organization } from '../lib/api';
import { hrefFor } from '../lib/router';
import { ErrorNotice, formatDate, Spinner } from '../components/ui';
import { roleLabel } from './Organization';

/**
 * Accepting an invitation — Phase 21.
 *
 * # The token never leaves the browser except in a request body
 *
 * The link puts it in the URL's FRAGMENT (after #), which a browser never sends
 * to a server, never writes into a Referer and no request log sees. This page
 * reads it, keeps it in sessionStorage for the length of a sign-in round trip
 * (a fragment does not survive the login redirect), and immediately removes it
 * from the address bar so it is not shared further by a copied URL or kept in
 * history. It reaches Nodeau Cloud only in the body of the preview and the
 * acceptance.
 */

const STORAGE_KEY = 'nodeau.invitation';

/** readToken takes the token from the fragment once, and from storage after. */
function readToken(): string {
  const fromHash = window.location.hash.replace(/^#/, '');
  if (fromHash) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, fromHash);
    } catch {
      /* storage may be unavailable; the token is still in hand for this render */
    }
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
    return fromHash;
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function forgetToken() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to forget */
  }
}

export function InvitePage({
  signedIn,
  email,
  navigate,
  onJoined,
}: {
  signedIn: boolean;
  email?: string;
  navigate?: (to: string) => void;
  onJoined?: (org: Organization) => void;
}) {
  const [token] = useState(readToken);
  const [preview, setPreview] = useState<
    { status: 'loading' } | { status: 'ready'; data: InvitationPreview } | { status: 'error'; error: unknown }
  >({ status: 'loading' });
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<unknown>(null);
  const [joined, setJoined] = useState<Organization | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api
      .previewInvitation(token, controller.signal)
      .then((data) => setPreview({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setPreview({ status: 'error', error });
      });
    return () => controller.abort();
  }, [token]);

  if (!token) {
    return (
      <section className="narrow">
        <h1>Invitation</h1>
        <p className="muted">
          This page opens from an invitation link. Ask whoever invited you to send the link again.
        </p>
      </section>
    );
  }
  if (joined) {
    return (
      <section className="narrow" data-testid="invite-joined">
        <h1>You&rsquo;re in</h1>
        <p>
          You are now part of <strong>{joined.name}</strong> as {roleLabel(joined.role)}.
        </p>
        <p>
          <a
            className="btn btn-primary btn-sm"
            href={hrefFor.dashboard()}
            onClick={(e) => {
              if (!navigate) return;
              e.preventDefault();
              // Entering it reloads who this person is: their new membership
              // is the server's to report, not this page's to assume.
              onJoined?.(joined);
              navigate(hrefFor.dashboard());
            }}
          >
            Go to {joined.name}
          </a>
        </p>
      </section>
    );
  }
  if (preview.status === 'loading') return <Spinner label="Reading the invitation…" />;
  if (preview.status === 'error') {
    return (
      <section className="narrow">
        <h1>Invitation</h1>
        <ErrorNotice error={preview.error} />
      </section>
    );
  }

  const p = preview.data;
  const live = p.state === 'pending';
  const wrongAddress = signedIn && email && email.toLowerCase() !== p.email.toLowerCase();

  return (
    <section className="narrow" data-testid="invite">
      <h1>Join {p.organizationName}</h1>
      <p>
        {p.invitedBy ? <>{p.invitedBy} invited </> : <>You were invited </>}
        <strong>{p.email}</strong> to join as {roleLabel(p.role)}.
      </p>
      {live ? (
        <p className="muted">This invitation works once and until {formatDate(p.expiresAt)}.</p>
      ) : (
        <div className="notice notice-error" role="alert">
          <p>
            {p.state === 'accepted'
              ? 'This invitation has already been used.'
              : p.state === 'revoked'
                ? 'This invitation was cancelled.'
                : 'This invitation has expired.'}{' '}
            Ask whoever sent it for a new one.
          </p>
        </div>
      )}

      {acceptError != null && <ErrorNotice error={acceptError} />}

      {live && !signedIn && (
        <p>
          <a className="btn btn-primary" href={signInURL(hrefFor.invite())}>
            Sign in as {p.email} to accept
          </a>
        </p>
      )}
      {live && signedIn && wrongAddress && (
        <div className="notice" role="status">
          <p>
            You are signed in as {email}. This invitation is for {p.email}: sign out and sign in with
            that address to accept it.
          </p>
        </div>
      )}
      {live && signedIn && !wrongAddress && (
        <p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={accepting}
            onClick={() => {
              setAccepting(true);
              setAcceptError(null);
              api
                .acceptInvitation(token)
                .then(({ organization }) => {
                  forgetToken();
                  try {
                    window.localStorage.setItem('nodeau.organization', organization.id);
                  } catch {
                    /* a convenience only */
                  }
                  setJoined(organization);
                })
                .catch((e: unknown) => {
                  if (e instanceof ApiError && (e.code === 'INVITATION_USED' || e.code === 'INVITATION_REVOKED' || e.code === 'INVITATION_EXPIRED')) {
                    forgetToken();
                  }
                  setAcceptError(e);
                })
                .finally(() => setAccepting(false));
            }}
          >
            Accept and join
          </button>
        </p>
      )}
    </section>
  );
}
