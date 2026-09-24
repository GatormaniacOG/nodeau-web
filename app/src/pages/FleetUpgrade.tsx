import { useState } from 'react';
import {
  api,
  ApiError,
  type Organization,
  type RolloutList,
  type RolloutPlan,
  type RolloutPlanMachine,
  type RolloutStep,
  type RolloutView,
} from '../lib/api';
import { hrefFor } from '../lib/router';
import { useResource } from '../lib/useResource';
import { Badge, Empty, ErrorNotice, relativeTime, Spinner } from '../components/ui';

/**
 * Fleet rollouts — Phase 18B.
 *
 * # THE PLAN YOU SAW IS THE PLAN YOU AUTHORISE
 *
 * Planning is a read. Authorising names the plan's identity, and the server
 * recomputes its own and refuses — with a sentence — if anything moved in
 * between. So this page never builds a request from anything but the plan it
 * is showing, and a refusal says "plan again", not "try again".
 *
 * # ASKED FOR IS NOT REPORTED
 *
 * Each step shows the version its machine was asked to reach AND the version
 * the machine reports running. A step is complete only on the second; showing
 * the first as progress would be the claim this whole feature exists to avoid.
 *
 * # WHAT IT DOES NOT SAY
 *
 * No "zero downtime", no "failover", no "migration": a machine's workloads
 * stop and start again on that machine, and nothing is moved elsewhere. The
 * page says that before anybody can authorise.
 */
export function FleetUpgradePage({ org }: { org: Organization }) {
  const [resource, reload] = useResource<RolloutList>((signal) => api.rollouts(org.id, signal), [org.id]);

  if (resource.status === 'loading') return <Spinner label="Reading this fleet's rollouts" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  const list = resource.data;
  const active = list.operations.find((v) =>
    ['authorized', 'in-progress', 'held'].includes(v.operation.state),
  );
  const last = active ? undefined : list.operations[0];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Upgrade</h1>
          <p className="page-lede">
            Move your machines to a Nodeau release <strong>one at a time</strong> — workers first, the
            machine running your control plane last. Each machine is checked on what it reports running
            before the next one starts. A machine that fails its check is rolled back where that is
            possible, and the rollout <strong>holds</strong> until you resume or cancel it.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          Refresh
        </button>
      </div>

      {active ? (
        <RolloutPanel org={org} view={active} mayUpgrade={list.mayUpgrade} onChanged={reload} />
      ) : (
        <PlanPanel org={org} list={list} onAuthorized={reload} />
      )}

      {last && <RolloutPanel org={org} view={last} mayUpgrade={false} onChanged={reload} previous />}

      <p className="muted small">
        Nodeau fetches a release only from its own published origin, and each machine checks the
        checksum and every image digest before it installs anything. Your machines call out for their
        instructions; nothing calls in.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// planning and authorising
// ---------------------------------------------------------------------------

function PlanPanel({
  org,
  list,
  onAuthorized,
}: {
  org: Organization;
  list: RolloutList;
  onAuthorized: () => void;
}) {
  const [channel, setChannel] = useState('beta');
  const [version, setVersion] = useState('');
  const [plan, setPlan] = useState<RolloutPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [understood, setUnderstood] = useState(false);
  const [override, setOverride] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  async function makePlan(event: React.FormEvent) {
    event.preventDefault();
    setPlanning(true);
    setError(null);
    setPlan(null);
    setUnderstood(false);
    setOverride(false);
    try {
      setPlan(await api.planRollout(org.id, { channel: channel.trim(), version: version.trim() || undefined }));
    } catch (e) {
      setError(e);
    } finally {
      setPlanning(false);
    }
  }

  async function authorize() {
    if (!plan) return;
    setAuthorizing(true);
    setError(null);
    try {
      await api.authorizeRollout(org.id, {
        channel: channel.trim(),
        version: version.trim() || undefined,
        planHash: plan.hash,
        windowOverride: override,
      });
      onAuthorized();
    } catch (e) {
      setError(e);
      // A 409 is the plan having moved under the person: what they confirmed
      // is no longer what would run, so the confirmation is withdrawn with it.
      if (e instanceof ApiError && e.status === 409) {
        setPlan(null);
      }
    } finally {
      setAuthorizing(false);
    }
  }

  const machines = plan?.machines ?? [];
  const moving = machines.filter((m) => m.state === 'ready' || m.state === 'waiting');
  const waiting = machines.some((m) => m.state === 'waiting');

  return (
    <section className="panel" aria-labelledby="plan-head">
      <header className="rollout-head">
        <h2 id="plan-head">Plan an upgrade</h2>
        <p className="muted small">Planning changes nothing. It shows what would happen, and why.</p>
      </header>

      <form onSubmit={makePlan} className="inline-form" aria-label="Plan an upgrade">
        <div className="inline-field">
          <label htmlFor="rollout-channel">Channel</label>
          <input
            id="rollout-channel"
            value={channel}
            required
            pattern="[a-z][a-z0-9\-]*"
            onChange={(e) => setChannel(e.currentTarget.value)}
          />
        </div>
        <div className="inline-field">
          <label htmlFor="rollout-version">Version (empty for the channel&rsquo;s release)</label>
          <input id="rollout-version" value={version} onChange={(e) => setVersion(e.currentTarget.value)} />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={planning || channel.trim() === ''}>
          {planning ? 'Planning…' : 'Plan'}
        </button>
      </form>

      {error !== null && <ErrorNotice error={error} />}

      {plan && (
        <div className="stack">
          <p>
            <strong>{plan.target.Version}</strong>{' '}
            <span className="muted small">
              from the {plan.target.Channel} channel, built from {plan.target.Commit.slice(0, 8)}
            </span>{' '}
            <PlanStateBadge state={plan.state} />
          </p>
          {machines.length === 0 ? (
            <Empty title="No machine has reported">Plans are made from what your machines report.</Empty>
          ) : (
            <ol className="rollout-steps" aria-label="Machines, in the order they would go">
              {[...machines]
                .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
                .map((m) => (
                  <PlanMachineRow key={m.key} m={m} />
                ))}
            </ol>
          )}
          {(plan.notes ?? []).length > 0 && (
            <ul className="muted small" aria-label="About this plan">
              {(plan.notes ?? []).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {moving.length > 0 &&
            (list.mayUpgrade ? (
              <div className="panel quiet stack">
                <label className="check">
                  <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  I understand the workloads on each of these machines stop and start again on that
                  machine while it upgrades. Nothing is moved elsewhere.
                </label>
                {waiting && (
                  <label className="check">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    Upgrade outside our maintenance window. This is recorded as my decision.
                  </label>
                )}
                <p>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!understood || authorizing}
                    onClick={() => void authorize()}
                  >
                    {authorizing ? 'Authorising…' : `Authorise upgrading ${moving.length} machine(s)`}
                  </button>
                </p>
              </div>
            ) : (
              <p className="muted small" role="note">
                {list.whyNot ?? 'You cannot authorise a rollout of this fleet.'}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}

function PlanStateBadge({ state }: { state: RolloutPlan['state'] }) {
  switch (state) {
    case 'ready':
      return <Badge tone="ok">ready</Badge>;
    case 'waiting':
      return <Badge tone="warn">waiting for the window</Badge>;
    case 'blocked':
      return <Badge tone="warn">blocked</Badge>;
    default:
      return <Badge>nothing to do</Badge>;
  }
}

function PlanMachineRow({ m }: { m: RolloutPlanMachine }) {
  return (
    <li className="rollout-step">
      <div className="rollout-step-head">
        <strong>{m.name ?? m.key}</strong>
        <span className="muted small">{m.controlPlane ? 'control plane' : 'worker'}</span>
        <Badge tone={m.state === 'ready' ? 'ok' : m.state === 'up-to-date' ? 'neutral' : 'warn'}>{m.state}</Badge>
      </div>
      <p className="small">
        {m.from ? `${m.from} → ${m.to}` : `→ ${m.to}`}
        {m.explanation && <span className="muted"> — {m.explanation}</span>}
      </p>
      {m.impact.summary && <p className="muted small">{m.impact.summary}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// a rollout
// ---------------------------------------------------------------------------

function RolloutPanel({
  org,
  view,
  mayUpgrade,
  onChanged,
  previous = false,
}: {
  org: Organization;
  view: RolloutView;
  mayUpgrade: boolean;
  onChanged: () => void;
  previous?: boolean;
}) {
  const op = view.operation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function act(what: 'cancel' | 'resume') {
    const question =
      what === 'cancel'
        ? 'Cancel this rollout? A machine already upgrading finishes first, and none starts after it.'
        : 'Resume this rollout? The machine that failed is tried again, after every check it needs.';
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(null);
    try {
      await (what === 'cancel' ? api.cancelRollout(org.id, op.id) : api.resumeRollout(org.id, op.id));
      onChanged();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={previous ? 'panel quiet' : 'panel'} aria-label={previous ? 'The last rollout' : 'This rollout'}>
      <header className="rollout-head">
        <h2>
          {previous ? 'The last rollout' : 'Rollout'} to {op.target.version}{' '}
          <RolloutStateBadge state={op.state} />
        </h2>
        <p className="muted small">
          Authorised {relativeTime(op.createdAt)}
          {op.authorizedBy ? ` by ${op.authorizedBy}` : ''}
          {op.windowOverride ? ' — outside the maintenance window, by decision' : ''}.
        </p>
      </header>

      {view.waiting && (
        <p role="status" className="small">
          {view.waiting}
        </p>
      )}
      {op.cancelRequested && (
        <p role="status" className="small">
          Cancelled: the machine upgrading now finishes, and none starts after it.
        </p>
      )}
      {op.state === 'held' && (
        <p role="alert" className="small">
          <strong>Held</strong> ({op.holdReason}): {op.holdDetail}
        </p>
      )}

      <ol className="rollout-steps" aria-label="Machines, in order">
        {(op.steps ?? []).map((s) => (
          <StepRow key={s.seq} step={s} observed={view.observed[s.machineKey]} />
        ))}
      </ol>

      <details className="small">
        <summary>What this rollout installs</summary>
        <p className="muted">
          {op.target.version}, built from {op.target.commit}. Each machine installs these exact bytes, and
          checks them before it does:
        </p>
        <ul className="digest-list">
          {Object.entries(op.target.artifacts ?? {}).map(([platform, sum]) => (
            <li key={platform}>
              archive {platform}: <code>{sum}</code>
            </li>
          ))}
          {Object.entries(op.target.images ?? {}).map(([component, digest]) => (
            <li key={component}>
              {component} image: <code>{digest}</code>
            </li>
          ))}
        </ul>
      </details>

      {error !== null && <ErrorNotice error={error} />}

      {!previous && mayUpgrade && (
        <p className="row-actions">
          {op.state === 'held' && (
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void act('resume')}>
              Resume
            </button>
          )}
          {!op.cancelRequested && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void act('cancel')}>
              Cancel rollout
            </button>
          )}
        </p>
      )}
      {!previous && (
        <p className="muted small">
          Follow each machine on <a href={hrefFor.fleet()}>Fleet</a>. From a terminal on the machine that
          runs your control plane: <code>nodeau fleet upgrade status</code>.
        </p>
      )}
    </section>
  );
}

function RolloutStateBadge({ state }: { state: RolloutView['operation']['state'] }) {
  switch (state) {
    case 'complete':
      return <Badge tone="ok">complete</Badge>;
    case 'held':
      return <Badge tone="warn">held</Badge>;
    case 'in-progress':
    case 'authorized':
      return <Badge>{state === 'authorized' ? 'authorised' : 'in progress'}</Badge>;
    default:
      return <Badge>{state}</Badge>;
  }
}

function StepRow({
  step,
  observed,
}: {
  step: RolloutStep;
  observed?: { version?: string; reportedAt?: string; present: boolean };
}) {
  return (
    <li className="rollout-step">
      <div className="rollout-step-head">
        <strong>{step.machineName ?? step.machineKey}</strong>
        <span className="muted small">{step.controlPlane ? 'control plane' : 'worker'}</span>
        <Badge tone={step.state === 'complete' || step.state === 'skipped' ? 'ok' : step.state === 'failed' ? 'warn' : 'neutral'}>
          {step.state}
          {step.phase ? ` · ${step.phase}` : ''}
        </Badge>
        {step.attempt > 1 && <span className="muted small">attempt {step.attempt}</span>}
      </div>
      <p className="small">
        asked: {step.from} → {step.to}
        <span className="muted">
          {' '}
          · reports{' '}
          {observed?.present
            ? `${observed.version || 'no version'}${observed.reportedAt ? `, ${relativeTime(observed.reportedAt)}` : ''}`
            : 'nothing — it is not reporting'}
        </span>
      </p>
      {step.reason && (
        <p className="small">
          <code>{step.reason}</code> {step.detail}
        </p>
      )}
    </li>
  );
}
