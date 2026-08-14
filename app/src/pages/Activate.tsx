import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type ActivationPendingView,
  type Installation,
  type Organization,
} from '../lib/api';
import { ErrorNotice, Spinner } from '../components/ui';
import { hrefFor } from '../lib/router';

/**
 * The approval page — the moment a machine joins an account.
 *
 * # This dialog is a security control, not a formality
 *
 * Somebody arrives here holding a code they read off a terminal. What they are
 * being asked is "should THIS machine join THIS organisation?", and the page has
 * to make both halves answerable:
 *
 *   - the machine's requested name and Nodeau version are shown, because
 *     "authorize this device" with no detail is a dialog people click through;
 *   - the organisation is CHOSEN, not assumed, whenever there is more than one,
 *     because approving into the wrong workspace is not a mistake somebody
 *     notices;
 *   - denying is offered as a first-class action beside approving, because a
 *     person who did not start an activation has been targeted, and closing the
 *     tab tells nobody.
 *
 * The values shown are unverified client input, and the backend normalises them
 * before storage — control characters, bidi overrides and zero-width characters
 * are stripped there — so a machine cannot make this page say something other
 * than what approving it will do.
 */

type Phase =
  | { kind: 'entering' }
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'confirm'; pending: ActivationPendingView }
  | { kind: 'submitting'; pending: ActivationPendingView }
  | { kind: 'approved'; installation: Installation }
  | { kind: 'denied' };

export function ActivatePage({
  organizations,
  initialCode,
  navigate,
}: {
  organizations: Organization[];
  initialCode?: string;
  navigate: (to: string) => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const [phase, setPhase] = useState<Phase>(
    initialCode ? { kind: 'loading' } : { kind: 'entering' },
  );
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? '');
  const [name, setName] = useState('');

  const lookup = useCallback(
    async (raw: string, showSpinner = true) => {
      const normalized = normalizeUserCode(raw);
      if (normalized.length !== 8) {
        setPhase({
          kind: 'error',
          error: new ApiError(400, {
            code: 'INVALID_REQUEST',
            message: 'An activation code is eight characters, shown as XXXX-XXXX.',
          }),
        });
        return;
      }
      if (showSpinner) setPhase({ kind: 'loading' });
      try {
        const pending = await api.pendingActivation(formatUserCode(normalized));
        setName(pending.requestedName ?? '');
        setPhase({ kind: 'confirm', pending });
      } catch (error) {
        setPhase({ kind: 'error', error });
      }
    },
    [],
  );

  // A code in the URL is the ordinary path: the CLI prints a verification link
  // with it already filled in.
  //
  // The initial phase is set from `initialCode` at construction rather than by
  // an effect, so nothing writes state synchronously inside one — the effect
  // only starts the request. React 19's set-state-in-effect rule is right about
  // why: the alternative renders the page, immediately re-renders it as
  // loading, and only then fetches.
  useEffect(() => {
    if (!initialCode) return;
    let live = true;
    void (async () => {
      await lookup(initialCode, false);
      if (!live) return;
    })();
    return () => {
      live = false;
    };
    // Deliberately only the initial code; retyping goes through the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  if (phase.kind === 'approved') {
    return (
      <section className="narrow">
        <div className="notice notice-ok">
          <h1>{phase.installation.name} is connected</h1>
          <p>
            Return to your terminal — <code>nodeau login</code> will finish on its own within
            a few seconds.
          </p>
        </div>
        <p>
          <a
            className="btn btn-primary"
            href={hrefFor.installation(phase.installation.id)}
            onClick={(e) => {
              e.preventDefault();
              navigate(hrefFor.installation(phase.installation.id));
            }}
          >
            View this installation
          </a>
        </p>
      </section>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <section className="narrow">
        <div className="notice">
          <h1>Not approved</h1>
          <p>
            Nothing was granted and no installation was created. If you did not start this
            activation, no further action is needed — a refused code gives nothing away.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="narrow">
      <header className="page-head">
        <h1>Connect a machine</h1>
        <p className="muted">
          Enter the code shown by <code>nodeau login</code> on the machine you want to connect.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(code);
        }}
      >
        <label className="field">
          <span>Activation code</span>
          <input
            className="input code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="Activation code"
            disabled={phase.kind === 'loading' || phase.kind === 'submitting'}
          />
        </label>
        {(phase.kind === 'entering' || phase.kind === 'error') && (
          <button className="btn btn-primary" type="submit" disabled={code.trim() === ''}>
            Continue
          </button>
        )}
      </form>

      {phase.kind === 'loading' && <Spinner label="Checking that code…" />}
      {phase.kind === 'error' && <ErrorNotice error={phase.error} />}

      {(phase.kind === 'confirm' || phase.kind === 'submitting') && (
        <ConfirmPanel
          pending={phase.pending}
          organizations={organizations}
          orgId={orgId}
          setOrgId={setOrgId}
          name={name}
          setName={setName}
          busy={phase.kind === 'submitting'}
          onApprove={async () => {
            setPhase({ kind: 'submitting', pending: phase.pending });
            try {
              const res = await api.approveActivation(phase.pending.userCode, orgId, name.trim());
              setPhase({ kind: 'approved', installation: res.installation });
            } catch (error) {
              setPhase({ kind: 'error', error });
            }
          }}
          onDeny={async () => {
            setPhase({ kind: 'submitting', pending: phase.pending });
            try {
              await api.denyActivation(phase.pending.userCode);
              setPhase({ kind: 'denied' });
            } catch (error) {
              setPhase({ kind: 'error', error });
            }
          }}
        />
      )}
    </section>
  );
}

function ConfirmPanel({
  pending,
  organizations,
  orgId,
  setOrgId,
  name,
  setName,
  busy,
  onApprove,
  onDeny,
}: {
  pending: ActivationPendingView;
  organizations: Organization[];
  orgId: string;
  setOrgId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  return (
    <div className="panel confirm">
      <h2>Authorize this machine?</h2>

      <dl className="detail">
        <dt>Machine name</dt>
        <dd>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Installation name"
            disabled={busy}
            maxLength={64}
          />
          <span className="muted small">
            {pending.requestedName
              ? `The machine asked to be called “${pending.requestedName}”. You can change it.`
              : 'The machine did not suggest a name.'}
          </span>
        </dd>

        <dt>Nodeau version</dt>
        <dd>{pending.nodeauVersion || 'not reported'}</dd>

        <dt>Code</dt>
        <dd className="mono">{pending.userCode}</dd>
      </dl>

      {organizations.length > 1 && (
        <label className="field">
          <span>Add to</span>
          <select
            className="input"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            disabled={busy}
            aria-label="Organisation"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="muted small">
        Approving lets this machine receive a signed entitlement for your plan. It does not
        give Nodeau Cloud access to the machine, its models or anything it runs.
      </p>

      <div className="btn-row">
        <button
          className="btn btn-primary"
          onClick={onApprove}
          disabled={busy || name.trim() === '' || orgId === ''}
        >
          {busy ? 'Working…' : 'Authorize'}
        </button>
        <button className="btn btn-ghost" onClick={onDeny} disabled={busy}>
          I did not start this
        </button>
      </div>
    </div>
  );
}

/**
 * normalizeUserCode mirrors the server's rule exactly.
 *
 * Upper-case, and drop everything outside the alphabet — dashes, spaces, and
 * the invisible characters a copy-paste from a terminal can carry. The server
 * normalises again, so this is a convenience rather than a check; doing it here
 * means an obviously-wrong length is reported before a round trip.
 */
export function normalizeUserCode(input: string): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  return Array.from(input.toUpperCase())
    .filter((ch) => alphabet.includes(ch))
    .join('');
}

export function formatUserCode(normalized: string): string {
  return normalized.length === 8 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}
