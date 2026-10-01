import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type FleetLogArtifact,
  type FleetView,
  type FleetWorkloadView,
  type Operation,
  type OperationState,
  type Organization,
} from '../lib/api';
import { hrefFor } from '../lib/router';
import { Empty, ErrorNotice, relativeTime, Spinner } from '../components/ui';
import { StatusPill, type StatusTone } from '../components/viz';
import { useResource } from '../lib/useResource';

/**
 * What is running, and the everyday verbs — Phase 14D.
 *
 * # Nothing here renders a terminal success before something observed it
 *
 * `applied` means the MACHINE says its local operation finished. `observed`
 * means the fleet's own state matches what was asked for, which only the server
 * can decide because only it holds both. Clicking Stop must never render
 * "Stopped" — it renders "stopping", until the fleet says otherwise.
 *
 * `operationTone` is the data that mapping lives in, and
 * `TestNoRemoteOperationRendersAsCompleteBeforeItIsObserved` asserts it.
 */

/**
 * Whether an operation state may be shown as finished, and how it reads.
 *
 * DONE is reserved for `observed`. Everything before it is IN FLIGHT however
 * confident it sounds, and `failed`/`expired` are finished-but-not-done.
 */
export const operationTone: Record<
  OperationState,
  { done: boolean; failed: boolean; label: string }
> = {
  requested: { done: false, failed: false, label: 'asked' },
  delivered: { done: false, failed: false, label: 'sent to the machine' },
  applying: { done: false, failed: false, label: 'in progress' },
  // NOT done. The machine says its part finished; the fleet has not confirmed
  // the state a person asked for is the state it is in.
  applied: { done: false, failed: false, label: 'applying' },
  observed: { done: true, failed: false, label: 'done' },
  failed: { done: false, failed: true, label: 'failed' },
  expired: { done: false, failed: true, label: 'expired' },
};

/**
 * How a workload's state reads, as a tone.
 *
 * The machine's own vocabulary, mapped once. This used to be a ternary — ok for
 * "serving" or "running", warn for everything else — which painted "starting"
 * and "stopping" the same colour as a refusal, so an ordinary cold start looked
 * like a fault for the forty seconds it took.
 *
 * `default: 'warn'` is deliberate and the safe direction: a state this build
 * has not seen is worth a person's eye, not a quiet green. The machine may be
 * running a newer Nodeau than the console.
 */
export function stateTone(state: string): StatusTone {
  switch (state) {
    case 'serving':
    case 'running':
    case 'finished':
      return 'ok';
    case 'starting':
    case 'submitted':
    case 'stopping':
      return 'neutral';
    case 'failed':
      return 'danger';
    default:
      // "degraded", "refused — too big", "waiting for a GPU", and anything a
      // newer machine invents.
      return 'warn';
  }
}

/**
 * Where a workload's Playground opens, if its installation has one (Phase 19).
 *
 * The Playground runs on the customer's own machine, on the control-plane
 * machine where `nodeau` runs, and talks to the models from there. This console
 * cannot relay a prompt to it and does not try: it says where to open it.
 *
 * Offered only when a machine of that installation DECLARES
 * `local.playground` — a fleet on an older build is not offered a command it
 * does not have. The answer is the control-plane machine's name, or null.
 */
export const PLAYGROUND_CAPABILITY = 'local.playground';
export function playgroundHosts(fleet: FleetView | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const inst of fleet?.installations ?? []) {
    const declares = inst.machines.filter((m) => m.capabilities?.includes(PLAYGROUND_CAPABILITY));
    if (declares.length === 0) continue;
    const host = declares.find((m) => m.role === 'control-plane') ?? declares[0]!;
    for (const m of inst.machines) out.set(m.id, host.name);
  }
  return out;
}

export function FleetWorkloadsPage({
  org,
  navigate,
}: {
  org: Organization;
  navigate: (to: string) => void;
}) {
  const [workloads, reload] = useResource(
    (signal) => api.fleetWorkloads(org.id, signal),
    [org.id],
  );
  const [pending, setPending] = useState<Operation | null>(null);
  // A SOFT second request: it only decides whether to offer the Playground, so
  // if it fails the page loses that offer and nothing else.
  const [fleetView] = useResource((signal) => api.fleet(org.id, signal), [org.id]);
  const hosts = playgroundHosts(fleetView.status === 'ready' ? fleetView.data : null);

  // Follow an operation until it stops moving. Polling rather than pushing,
  // because the answer arrives on the machine's own cadence and a socket here
  // would be a second transport for a fact that is already eventually
  // consistent by design.
  useEffect(() => {
    if (!pending || operationTone[pending.state].done || operationTone[pending.state].failed) {
      return;
    }
    const timer = setTimeout(() => {
      api
        .fleetOperation(org.id, pending.id)
        .then((op) => {
          setPending(op);
          if (operationTone[op.state].done) reload();
        })
        .catch(() => {
          /* A poll that fails is not news: the next one will try again. */
        });
    }, 3000);
    return () => clearTimeout(timer);
  }, [pending, org.id, reload]);

  if (workloads.status === 'loading') return <Spinner label="Reading what is running…" />;
  if (workloads.status === 'error') {
    return <ErrorNotice error={workloads.error} onRetry={reload} />;
  }

  const rows = workloads.data.workloads;

  return (
    <section>
      <div className="page-head">
        <h1>Workloads</h1>
        <a
          className="btn btn-primary btn-sm"
          href={hrefFor.fleetRun()}
          onClick={(e) => {
            e.preventDefault();
            navigate(hrefFor.fleetRun());
          }}
        >
          Run a workload
        </a>
      </div>

      {pending && <OperationProgress op={pending} onDismiss={() => setPending(null)} />}

      {rows.length === 0 ? (
        <Empty title="Nothing is running">
          <p className="muted">
            Your machines are connected and no model is loaded. Starting one takes a model name, and Nodeau chooses which machine and
            which card.
          </p>
        </Empty>
      ) : (
        <ul className="workload-list">
          {rows.map((w) => (
            <WorkloadRow
              key={w.name}
              org={org}
              workload={w}
              playgroundHost={w.machineId ? hosts.get(w.machineId) ?? null : null}
              onOperation={setPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkloadRow({
  org,
  workload,
  playgroundHost,
  onOperation,
}: {
  org: Organization;
  workload: FleetWorkloadView;
  playgroundHost: string | null;
  onOperation: (op: Operation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [playground, setPlayground] = useState(false);
  const offerPlayground =
    playgroundHost !== null && workload.state === 'serving' && (workload.type ?? 'service') === 'service';
  const [error, setError] = useState<unknown>(null);
  const [logs, setLogs] = useState<FleetLogArtifact | null>(null);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        onOperation(await api.requestFleetOperation(org.id, body));
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [org.id, onOperation],
  );

  const fetchLogs = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const op = await api.requestFleetOperation(org.id, {
        kind: 'logs.tail',
        workloadName: workload.name,
        lines: 200,
      });
      // Poll the operation, then read the artefact it produced. A log tail is a
      // snapshot, not a stream: the bound is a size rather than a rate, and
      // there is no follow.
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const state = await api.fleetOperation(org.id, op.id);
        if (operationTone[state.state].failed) {
          setError(new Error(state.resultDetail ?? 'Those logs could not be read.'));
          return;
        }
        if (operationTone[state.state].done) {
          setLogs(await api.fleetLogs(org.id, op.id));
          return;
        }
      }
      setError(new Error('That machine has not answered yet. Try again in a moment.'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }, [org.id, workload.name]);

  return (
    <li className="workload">
      <div className="workload-head">
        <div className="workload-title">
          <strong>{workload.name}</strong>
          <span className="muted small">
            {workload.model ?? 'model not reported'}
            {workload.task ? ` · ${workload.task}` : ''}
          </span>
        </div>
        <StatusPill tone={stateTone(workload.state)}>{workload.state}</StatusPill>
      </div>

      {/* WHERE IT IS, as a set of named facts rather than a run-on sentence.
          A machine name, a count of cards and a scheduling mode answer three
          different questions, and separating them is what lets a long model id
          or a renamed machine grow without pushing the rest off a phone. */}
      <dl className="placement-facts">
        <div>
          <dt>Machine</dt>
          <dd>{workload.machineName ?? 'not placed yet'}</dd>
        </div>
        {(workload.deviceUuids?.length ?? 0) > 0 && (
          <div>
            <dt>Accelerators</dt>
            <dd>
              {workload.deviceUuids!.length}
              {workload.deviceUuids!.length === 1 ? ' card' : ' cards'}
            </dd>
          </div>
        )}
        {workload.schedulingMode && (
          <div>
            <dt>Scheduling</dt>
            <dd>{workload.schedulingMode}</dd>
          </div>
        )}
        {workload.lastReportedAt && (
          <div>
            <dt>Reported</dt>
            <dd>{relativeTime(workload.lastReportedAt)}</dd>
          </div>
        )}
      </dl>

      {/* THE NOTE IS SHOWN WHENEVER THERE IS ONE, including for a workload that
          is serving. It used to be hidden unless the state was not "serving",
          which threw away the one case that matters most: a machine taken out
          of service keeps its workload running and Nodeau will not re-place it
          there — the model works, and its owner still needs to know (#154). */}
      {workload.reasonDetail && <p className="workload-note">{workload.reasonDetail}</p>}

      {/* The scheduler's own explanation, verbatim and ALWAYS VISIBLE.
          There is no cloud-side explanation generator, so this cannot disagree
          with the decision that was actually taken.

          It was briefly put behind a disclosure to shorten the row, and the
          browser test caught it. "Every decision is explainable" is the claim
          that makes this more than a Kubernetes dashboard, and an explanation
          one click away is one nobody reads. The row was hard to scan because
          the explanation was styled as trailing muted text, not because it was
          present — so it is LABELLED and set as its own block instead. */}
      {workload.placementSummary && (
        <div className="placement-why">
          <span className="placement-why-label">Why here</span>
          <p className="placement">{workload.placementSummary}</p>
        </div>
      )}

      <div className="workload-actions">
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() =>
            // The COPY this row shows, not just its name (#132). If the fleet
            // has replaced it since this page loaded, the server refuses with
            // a sentence saying so, rather than stopping a copy nobody saw.
            act({
              kind: 'workload.stop',
              workloadName: workload.name,
              workloadIncarnation: workload.incarnation,
            })
          }
        >
          Stop
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={fetchLogs}>
          {busy ? 'Working…' : 'Logs'}
        </button>
        {offerPlayground && (
          <button
            className="btn btn-ghost btn-sm"
            aria-expanded={playground}
            onClick={() => setPlayground((v) => !v)}
          >
            Open in Playground
          </button>
        )}
      </div>

      {offerPlayground && playground && (
        <PlaygroundEntry name={workload.name} host={playgroundHost!} />
      )}

      {error !== null && <ErrorNotice error={error as ApiError} />}
      {logs && <LogView artifact={logs} onClose={() => setLogs(null)} />}
    </li>
  );
}

/**
 * Where to open this workload's Playground. A command and a link, never a
 * request: the Playground talks to the model on the customer's machine, and
 * nothing typed into it reaches this console or Nodeau Cloud.
 *
 * The link only opens on the machine itself (it is that machine's own
 * loopback address), and signs nothing in: a browser is signed in by the
 * address `nodeau playground` prints, for as long as that Playground runs. The
 * command always works, so it comes first.
 */
function PlaygroundEntry({ name, host }: { name: string; host: string }) {
  const command = `nodeau playground ${name}`;
  const [copied, setCopied] = useState('');
  const link = `http://127.0.0.1:7371/playground?workload=${encodeURIComponent(name)}`;
  return (
    <div className="playground-entry" role="region" aria-label={`Playground for ${name}`}>
      <p>
        The Playground runs on your own machine, so what you type there stays there. On{' '}
        <strong>{host}</strong>, run:
      </p>
      <div className="command-line">
        <code>{command}</code>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            navigator.clipboard
              .writeText(command)
              .then(() => setCopied('Copied'))
              .catch(() => setCopied('Select it and copy'))
          }
        >
          {copied || 'Copy'}
        </button>
      </div>
      <p className="muted small">
        Sitting at {host}?{' '}
        <a href={link} target="_blank" rel="noopener noreferrer">
          Open the Playground on this computer
        </a>
        .
      </p>
    </div>
  );
}

/**
 * A log snapshot, with the honest warning it arrived carrying.
 *
 * The warning travels WITH the artefact from the API, so this cannot render one
 * without the other — redaction catches credentials, not content, and a
 * customer whose runtime logs request bodies needs to know that here rather
 * than from a support reply.
 */
function LogView({ artifact, onClose }: { artifact: FleetLogArtifact; onClose: () => void }) {
  return (
    <div className="logs">
      <div className="logs-head">
        <strong>
          {artifact.lines} line{artifact.lines === 1 ? '' : 's'}
          {artifact.truncated ? ' (the end of a longer log)' : ''}
        </strong>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      {artifact.warning && <p className="muted small">{artifact.warning}</p>}
      <pre className="log-body">{artifact.text}</pre>
      <p className="muted small">Kept until {new Date(artifact.expiresAt).toLocaleString()}.</p>
    </div>
  );
}

/**
 * OperationProgress shows what a request is doing, and never says it is done
 * before the fleet says so.
 */
export function OperationProgress({
  op,
  onDismiss,
}: {
  op: Operation;
  onDismiss: () => void;
}) {
  const tone = operationTone[op.state];
  return (
    <div className={`notice ${tone.failed ? 'notice-error' : tone.done ? 'notice-ok' : 'notice-info'}`}>
      <h3>
        {op.summary ?? op.kind}: {tone.label}
      </h3>
      {op.resultDetail && <p>{op.resultDetail}</p>}
      {!tone.done && !tone.failed && (
        <p className="muted small">
          Waiting for the machine to report back. This page updates on its own.
        </p>
      )}
      <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
