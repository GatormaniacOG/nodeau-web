import { api, type AvailablePlan, type Organization, type Plan } from '../lib/api';
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
 * live. Home Pro is a real, approved tier that cannot be bought yet, so it is
 * shown with "coming soon" rather than a checkout button that goes nowhere —
 * Phase 7C brief §5 and §68.
 */
export function PlanPage({ org }: { org: Organization }) {
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
                  <button className="btn btn-primary btn-sm" disabled>
                    Upgrade
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
