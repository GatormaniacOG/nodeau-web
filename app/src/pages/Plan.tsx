import { useState } from 'react';

import { ApiError, api, type AvailablePlan, type Organization, type Plan } from '../lib/api';
import { Badge, ErrorNotice, Spinner, formatDate } from '../components/ui';
import { useResource } from '../lib/useResource';

/**
 * The plan page.
 *
 * # It renders labels. It does not enforce anything.
 *
 * `docs/ROADMAP.md` §7 and the Phase 7C brief §60. What a customer may actually
 * do is decided by `internal/entitlement` on their own machine, from a signed
 * claim. This page shows which tier is in force and what each includes. There is
 * no code here — and there must never be — that gates a control on a plan id.
 *
 * # It does not claim you can buy anything
 *
 * `purchasable` comes from the backend and is false until a billing provider is
 * live AND the launch gate is open — it is `cfg.CheckoutEnabled()`, not "are
 * keys present". A tier that is approved but not yet on sale shows "coming
 * soon" rather than a checkout button that goes nowhere.
 *
 * # Buying is a redirect, and nothing here grants anything
 *
 * The Upgrade button asks the API for a hosted checkout URL and navigates to it.
 * It never sets a plan, and the customer's return trip is not evidence of
 * payment — see BillingPage. Two refusals are ordinary rather than exceptional
 * and are shown as sentences, not stack traces: 403 when the launch gate is
 * closed, 409 when this deployment defines a plan but maps no price to it.
 */
export function PlanPage({ org }: { org: Organization }) {
  // Which plan's button is busy, so two clicks cannot open two checkouts.
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function go(action: () => Promise<{ url: string }>, key: string) {
    setBusy(key);
    setRefusal(null);
    try {
      const { url } = await action();
      // A full navigation, not a router push: the destination is the payment
      // provider's own domain.
      window.location.assign(url);
    } catch (cause) {
      setBusy(null);
      if (cause instanceof ApiError) {
        setRefusal(cause.message);
        return;
      }
      setRefusal('Could not reach Nodeau Cloud. Nothing was charged.');
    }
  }
  const [state, reload] = useResource<{ plan: Plan; available: AvailablePlan[] }>(
    (signal) =>
      Promise.all([api.plan(org.id, signal), api.availablePlans(org.id, signal)]).then(
        ([plan, list]) => ({ plan, available: list.plans ?? [] }),
      ),
    [org.id],
  );

  if (state.status === 'loading') return <Spinner label="Loading your plan…" />;
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={reload} />;

  const { plan, available } = state.data;

  return (
    <section>
      <header className="page-head">
        <h1>Plan</h1>
        <p className="muted">What {org.name} is entitled to.</p>
      </header>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>{plan.displayName}</h2>
            {plan.summary && <p className="muted">{plan.summary}</p>}
          </div>
          <Badge tone={plan.status === 'past_due' ? 'warn' : 'ok'}>
            {plan.status === 'none' ? 'Free' : plan.status}
          </Badge>
        </div>

        {plan.currentPeriodEnd && (
          <p className="muted small">Renews {formatDate(plan.currentPeriodEnd)}</p>
        )}

        {/* Deliberately keyed on "there is a subscription", NOT on whether
            checkout is open. Somebody who has already paid must always be able
            to see, change and cancel it — the API takes the same position. */}
        {plan.status !== 'none' && (
          <p>
            <button
              className="btn btn-sm"
              disabled={busy !== null}
              onClick={() => go(() => api.billingPortal(org.id), 'portal')}
            >
              {busy === 'portal' ? 'Opening…' : 'Manage billing'}
            </button>
          </p>
        )}

        <h3>Included</h3>
        {plan.features.length === 0 ? (
          <p className="muted">
            Everything a single machine needs, and nothing that requires a second one.
            Admission, artifact verification and authentication are the same here as on any
            paid plan — nothing has been disabled.
          </p>
        ) : (
          <ul className="feature-list">
            {plan.features.map((f) => (
              <li key={f}>{humaniseFeature(f)}</li>
            ))}
          </ul>
        )}

        {Object.keys(plan.limits).length > 0 && (
          <>
            <h3>Limits</h3>
            <dl className="detail">
              {Object.entries(plan.limits)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => (
                  <div key={k} className="detail-row">
                    <dt>{humaniseLimit(k)}</dt>
                    <dd>{v === -1 ? 'unlimited' : v}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
      </div>

      {refusal && (
        <div className="notice notice-warn" role="status">
          <p>{refusal}</p>
        </div>
      )}

      <h2 className="section-head">All plans</h2>
      <ul className="card-list">
        {available.map((p) => (
          <li key={p.id}>
            <div className={`card${p.current ? ' card-current' : ''}`}>
              <div className="card-main">
                <h3>
                  {p.displayName} {p.current && <Badge tone="ok">Current</Badge>}
                </h3>
                <p className="muted">{p.summary}</p>
              </div>
              <div className="card-aside">
                {p.current ? null : p.purchasable ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy !== null}
                    onClick={() => go(() => api.startCheckout(org.id, p.id), p.id)}
                  >
                    {busy === p.id ? 'Opening…' : 'Upgrade'}
                  </button>
                ) : (
                  <Badge tone="neutral">Coming soon</Badge>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="muted small">
        Nodeau verifies entitlements offline. A plan change reaches a machine the next time
        it refreshes, and a machine that cannot reach Nodeau Cloud keeps working on the
        entitlement it already holds.
      </p>
      {/*
        The full capability comparison lives on the marketing site rather than
        being duplicated here. Two copies of a pricing table drift, and the one
        that drifts is always the one nobody is looking at.
      */}
      <p className="muted small">
        <a href="https://nodeau.ai/pricing/">Compare what each plan includes</a>
      </p>
    </section>
  );
}

/**
 * humaniseFeature turns a semantic capability into a sentence.
 *
 * The capability names are the contract and are never renamed for presentation
 * (`internal/entitlement`: a feature named for a tier is named wrong). This is
 * the presentation layer that lets them stay that way.
 */
function humaniseFeature(f: string): string {
  const known: Record<string, string> = {
    MultiNode: 'Use several GPU machines together',
    MultiGPU: 'Use several GPUs in one machine',
    BatchJobs: 'Run batch jobs',
    ScheduledBatch: 'Schedule and repeat batch jobs',
    PriorityQueues: 'Priority and preemption between workloads',
    RemoteManagement: 'Manage installations from this site',
    ModelReplication: 'Move model weights to the machines that need them',
    TeamRBAC: 'Several people, with different permissions',
    Audit: 'A durable record of who changed what',
    SSO: 'Organisational single sign-on',
  };
  // An unmapped capability shows its own name rather than nothing. A build that
  // has not been taught about a new feature must not render a blank bullet.
  return known[f] ?? f;
}

function humaniseLimit(l: string): string {
  const known: Record<string, string> = {
    MaxNodes: 'Machines',
    MaxGPUs: 'GPUs',
    MaxUsers: 'People',
    MaxConcurrentServices: 'Models served at once',
    MaxBatchJobs: 'Batch jobs',
  };
  return known[l] ?? l;
}
