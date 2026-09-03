import { useCallback, useState } from 'react';
import {
  api,
  ApiError,
  type FleetInstallation,
  type FleetMachineView,
  type FleetPresence,
  type Organization,
} from '../lib/api';
import { hrefFor } from '../lib/router';
import { Badge, Empty, ErrorNotice, relativeTime, Spinner } from '../components/ui';
import { useResource } from '../lib/useResource';

/**
 * The fleet — Phase 14C.
 *
 * # Everything here is a value a machine reported
 *
 * This page derives nothing. Presence and the headline are computed by the API
 * from the server's own clock; every other value — health, scheduling state,
 * accelerator inventory, why a card is not schedulable — is the machine's own
 * word for it, passed through. That is ADR-P7-002's rule one boundary further
 * out: the browser cannot disagree with `nodeau fleet list`, and neither can
 * disagree with the scheduler that produced the placement.
 *
 * # The three dimensions stay apart
 *
 * PRESENCE answers "can Nodeau Cloud see this?", HEALTH answers "does the
 * machine report a problem?", and SCHEDULING STATE answers "may new work go
 * here?". A connected machine can be unhealthy, a draining machine is perfectly
 * healthy, and a machine Nodeau Cloud cannot see may be serving happily.
 * Rendering them as one badge is how a dashboard tells somebody their fleet is
 * down when it is not.
 *
 * # A machine Nodeau Cloud cannot see is UNOBSERVED, not offline
 *
 * One connector reports a whole installation, so when it is quiet the cloud
 * knows it cannot see the machines — not that they are gone. Every string on
 * this page says the first thing.
 */

export function FleetPage({
  org,
  navigate,
}: {
  org: Organization;
  navigate: (to: string) => void;
}) {
  const [fleet, reload] = useResource((signal) => api.fleet(org.id, signal), [org.id]);

  if (fleet.status === 'loading') return <Spinner label="Reading your fleet…" />;
  if (fleet.status === 'error') return <ErrorNotice error={fleet.error} onRetry={reload} />;

  const installations = fleet.data.installations;
  const connected = installations.filter((i) => i.connected);

  if (connected.length === 0) {
    return (
      <section className="narrow">
        <h1>Your fleet</h1>
        <Empty title="No machine is reporting to Nodeau Cloud yet">
          <p className="muted">
            Connecting is a separate step from signing in, on purpose: upgrading Nodeau
            never makes a machine remotely operable. On the machine that runs your models:
          </p>
          <pre className="code">nodeau fleet connect</pre>
          <p className="muted">
            Your machines reach out to Nodeau Cloud. Nothing ever connects in, and nothing
            you compute leaves them.
          </p>
        </Empty>
      </section>
    );
  }

  return (
    <section>
      <div className="page-head">
        <h1>Your fleet</h1>
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          Refresh
        </button>
      </div>
      {installations.map((inst) => (
        <FleetCard key={inst.id} inst={inst} navigate={navigate} />
      ))}
      <p className="muted small">
        Several installations are separate fleets. They cannot place work on each other's
        machines, which is why they are listed apart rather than merged.
      </p>
    </section>
  );
}

function FleetCard({
  inst,
  navigate,
}: {
  inst: FleetInstallation;
  navigate: (to: string) => void;
}) {
  const gpus = inst.machines.reduce((n, m) => n + (m.gpus?.length ?? 0), 0);

  return (
    <article className="card fleet-card">
      <header className="fleet-head">
        <div>
          <h2>{inst.name}</h2>
          <p className="muted small">
            {inst.machines.length} machine{inst.machines.length === 1 ? '' : 's'} · {gpus}{' '}
            GPU{gpus === 1 ? '' : 's'}
            {inst.nodeauVersion ? ` · Nodeau ${inst.nodeauVersion}` : ''}
          </p>
        </div>
        <PresenceBadge presence={inst.presence} lastSyncAt={inst.lastSyncAt} />
      </header>

      {/* The product's own sentence, never a count of warnings and never a
          status code. When something is wrong it carries the machine's own
          reason text. */}
      <p className="fleet-headline">{inst.headline}</p>

      {inst.machines.length === 0 ? (
        <p className="muted">This fleet has not reported a machine yet.</p>
      ) : (
        <ul className="machine-list">
          {inst.machines.map((m) => (
            <li key={m.id}>
              <a
                className="machine-row"
                href={hrefFor.fleetMachine(m.id)}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(hrefFor.fleetMachine(m.id));
                }}
              >
                <span className="machine-name">
                  {m.name}
                  {m.name !== m.reportedName && (
                    <span className="muted small"> ({m.reportedName})</span>
                  )}
                </span>
                <span className="machine-gpus muted small">
                  {(m.gpus ?? []).map((g) => g.model ?? g.uuid).join(' · ') || 'no accelerator reported'}
                </span>
                <span className="machine-badges">
                  <PresenceBadge presence={m.presence} compact />
                  <HealthBadge machine={m} />
                  <SchedulingBadge machine={m} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * PresenceBadge says what Nodeau Cloud can SEE, and never what a machine is
 * doing.
 *
 * "Not visible" rather than "offline", deliberately and everywhere. A machine
 * whose owner's internet is out is serving perfectly, and telling them it is
 * down would be the product's first untrue claim.
 */
export function PresenceBadge({
  presence,
  lastSyncAt,
  compact,
}: {
  presence: FleetPresence;
  lastSyncAt?: string;
  compact?: boolean;
}) {
  const label: Record<FleetPresence, string> = {
    online: 'visible',
    stale: 'not heard from recently',
    offline: 'not visible',
    unknown: 'not reporting',
  };
  const tone: Record<FleetPresence, 'ok' | 'warn' | 'neutral'> = {
    online: 'ok',
    stale: 'warn',
    offline: 'warn',
    unknown: 'neutral',
  };
  return (
    <span className="presence">
      <Badge tone={tone[presence]}>{label[presence]}</Badge>
      {!compact && lastSyncAt && (
        <span className="muted small"> last report {relativeTime(lastSyncAt)}</span>
      )}
    </span>
  );
}

function HealthBadge({ machine }: { machine: FleetMachineView }) {
  if (machine.health === 'healthy') return <Badge tone="ok">healthy</Badge>;
  if (machine.health === 'unknown') return <Badge tone="neutral">health unknown</Badge>;
  return <Badge tone="warn">{machine.health}</Badge>;
}

function SchedulingBadge({ machine }: { machine: FleetMachineView }) {
  if (machine.schedulingState === 'active') return null;
  return <Badge tone="neutral">{machine.schedulingState}</Badge>;
}

// ---------------------------------------------------------------------------
// Machine detail
// ---------------------------------------------------------------------------

export function FleetMachinePage({
  org,
  id,
  navigate,
}: {
  org: Organization;
  id: string;
  navigate: (to: string) => void;
}) {
  const [machine, reload] = useResource(
    (signal) => api.fleetMachine(org.id, id, signal),
    [org.id, id],
  );

  if (machine.status === 'loading') return <Spinner label="Reading this machine…" />;
  if (machine.status === 'error') return <ErrorNotice error={machine.error} onRetry={reload} />;

  const m = machine.data;

  return (
    <section>
      <p className="muted small">
        <a
          href={hrefFor.fleet()}
          onClick={(e) => {
            e.preventDefault();
            navigate(hrefFor.fleet());
          }}
        >
          ← Your fleet
        </a>
      </p>

      <div className="page-head">
        <div>
          <h1>{m.name}</h1>
          {/* The machine's OWN name, always shown beside a display name, so a
              rename can never make two machines look like one. */}
          {m.name !== m.reportedName && (
            <p className="muted small">This machine calls itself {m.reportedName}.</p>
          )}
        </div>
        <PresenceBadge presence={m.presence} lastSyncAt={m.lastReportedAt} />
      </div>

      <RenameMachine org={org} machine={m} onRenamed={reload} />

      <dl className="facts">
        <dt>Health</dt>
        <dd>
          <HealthBadge machine={m} />
        </dd>
        <dt>Scheduling</dt>
        <dd>
          {m.schedulingState}
          {/* NEVER the word "default". `v0.6.0-beta.1` and later builds
              disagree about what an unset mode means, so a fleet view that
              said "default" would say two different things depending on which
              machine somebody was looking at. */}
          {m.schedulingMode ? ` · ${m.schedulingMode}` : ' · using this machine’s built-in policy'}
        </dd>
        {m.role && (
          <>
            <dt>Role</dt>
            <dd>{m.role}</dd>
          </>
        )}
        {m.platform && (
          <>
            <dt>Platform</dt>
            <dd>
              {m.platform}
              {m.osVersion ? ` · ${m.osVersion}` : ''}
            </dd>
          </>
        )}
        {m.nodeauVersion && (
          <>
            <dt>Nodeau</dt>
            <dd>{m.nodeauVersion}</dd>
          </>
        )}
        <dt>Last report</dt>
        <dd>{relativeTime(m.lastReportedAt)}</dd>
      </dl>

      {(m.findings?.length ?? 0) > 0 && (
        <div className="notice notice-warn">
          <h3>What this machine reports</h3>
          <ul>
            {m.findings!.map((f) => (
              <li key={f.code + f.detail}>{f.detail}</li>
            ))}
          </ul>
        </div>
      )}

      <h2>Accelerators</h2>
      {(m.gpus?.length ?? 0) === 0 ? (
        <p className="muted">This machine has not reported an accelerator.</p>
      ) : (
        <ul className="gpu-list">
          {m.gpus!.map((g) => (
            <li key={g.uuid} className="gpu">
              <div className="gpu-head">
                <strong>{g.model ?? g.uuid}</strong>
                {g.schedulable ? (
                  <Badge tone="ok">available for work</Badge>
                ) : (
                  <Badge tone="neutral">not scheduled on</Badge>
                )}
              </div>
              <p className="muted small mono">{g.uuid}</p>
              <p className="muted small">
                {g.vramTotalMib ? `${g.vramTotalMib.toLocaleString()} MiB` : 'memory not reported'}
                {g.vramUsedMib !== undefined && g.vramTotalMib
                  ? ` · ${g.vramUsedMib.toLocaleString()} MiB in use`
                  : ''}
                {/* Absent means UNOBSERVED, not zero. An idle card at 0% and a
                    card whose driver did not answer are different facts. */}
                {g.temperatureC !== undefined ? ` · ${g.temperatureC} °C` : ''}
                {g.powerWatts !== undefined ? ` · ${g.powerWatts} W` : ''}
                {g.powerLimitWatts !== undefined ? ` of ${g.powerLimitWatts} W` : ''}
              </p>
              {/* The machine's own words for why a card is not being used. */}
              {g.note && <p className="muted small">{g.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Renaming changes a DISPLAY NAME and nothing else.
 *
 * Not the machine's identity, not its history, and not what it calls itself —
 * which is the property a hostname-keyed design could not have offered, and the
 * reason a machine's identity is its Kubernetes Node UID.
 */
function RenameMachine({
  org,
  machine,
  onRenamed,
}: {
  org: Organization;
  machine: FleetMachineView;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(machine.name === machine.reportedName ? '' : machine.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await api.renameFleetMachine(org.id, machine.id, name.trim());
        onRenamed();
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [org.id, machine.id, name, onRenamed],
  );

  return (
    <form className="rename" onSubmit={submit}>
      <label htmlFor="display-name" className="muted small">
        What to call this machine here
      </label>
      <div className="rename-row">
        <input
          id="display-name"
          type="text"
          value={name}
          placeholder={machine.reportedName}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="muted small">
        Display only. The machine keeps its own name, its history and everything already
        running on it.
      </p>
      {error !== null && <ErrorNotice error={error as ApiError} />}
    </form>
  );
}
