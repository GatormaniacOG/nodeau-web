import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type AdmissionCandidate,
  type AdmissionPreview,
  type Operation,
  type Organization,
} from '../lib/api';
import { hrefFor } from '../lib/router';
import { ErrorNotice } from '../components/ui';
import { ModelSelect } from '../components/ModelSelect';
import { AdmissionCard, gib } from '../components/AdmissionCard';
import { OperationProgress } from './FleetWorkloads';

/**
 * Run a workload — Phase 14D, and since Phase 20I preview first.
 *
 * # It asks for a MODEL, and never for a machine
 *
 * There is no machine picker and no card picker on this form, and that is the
 * product rather than an omission. Placement is `internal/placement`'s, on the
 * customer's own hardware, with admission arithmetic, entitlement, device
 * exclusivity and the fleet's scheduling policy all applying exactly as they
 * would to a typed `nodeau run`. A browser that chose a device would be a
 * second scheduler beside the one that works.
 *
 * # Preview, then run (Phase 20I)
 *
 * "Preview" asks the fleet's own controller where the model would run and what
 * it would cost, without running it, and shows admission's answer for every
 * machine. "Run" then asks the fleet to start it; the machine admits it AGAIN,
 * because between the two something else may have started. The one place a
 * machine is named is a one-run override, and only for a machine whose answer
 * said the obstacle is Nodeau's own safety reserve rather than the hardware:
 * the person sees the recalculated arithmetic, confirms, and the run carries
 * the override scoped to that machine and the preview it came from.
 *
 * # It does not wait
 *
 * Submitting returns an operation id immediately. Starting a model can mean
 * downloading several gigabytes, and a form that blocked on that would be a
 * form people force-refresh.
 */

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'asking'; op: Operation }
  | { kind: 'shown'; op: Operation; preview: AdmissionPreview }
  | { kind: 'unavailable'; why: string };

const POLL_MS = 1000;
const POLL_LIMIT = 60;

export function FleetRunPage({
  org,
  navigate,
}: {
  org: Organization;
  navigate: (to: string) => void;
}) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [task, setTask] = useState('');
  const [gpuCount, setGPUCount] = useState('1');
  const [mode, setMode] = useState('');
  const [contextSize, setContextSize] = useState('4096');
  const [parallel, setParallel] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [started, setStarted] = useState<Operation | null>(null);
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' });
  const [confirming, setConfirming] = useState<AdmissionCandidate | null>(null);
  const cancelled = useRef(false);
  const confirmHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => {
    cancelled.current = true;
  }, []);

  // The confirmation is where the decision is made, so focus moves to it: a
  // keyboard or screen-reader user lands on the question, not past it.
  useEffect(() => {
    if (confirming) confirmHeading.current?.focus();
  }, [confirming]);

  // Any change to what is being asked makes the answer about something else,
  // so every input that shapes the question clears it as it changes.
  const reshaping =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreview({ kind: 'idle' });
      setConfirming(null);
    };
  const changeModel = reshaping(setModel);
  const changeTask = reshaping(setTask);
  const changeGPUCount = reshaping(setGPUCount);
  const changeMode = reshaping(setMode);
  const changeContext = reshaping(setContextSize);
  const changeParallel = reshaping(setParallel);

  const configuration = useCallback(
    () => ({
      model: model.trim(),
      ...(task ? { task } : {}),
      ...(gpuCount ? { gpuCount: Number(gpuCount) } : {}),
      ...(mode ? { schedulingMode: mode } : {}),
      ...(contextSize ? { contextSize: Number(contextSize) } : {}),
      ...(parallel ? { parallel: Number(parallel) } : {}),
    }),
    [model, task, gpuCount, mode, contextSize, parallel],
  );

  const askPreview = useCallback(async () => {
    setError(null);
    setConfirming(null);
    let op: Operation;
    try {
      op = await api.requestFleetOperation(org.id, {
        kind: 'admission.preview',
        ...(name.trim() ? { workloadName: name.trim() } : {}),
        ...configuration(),
      });
    } catch (err) {
      // A fleet whose machines predate previews refuses with 409; the plain
      // run still works, and the machine still checks the fit.
      if (err instanceof ApiError && err.status === 409) {
        setPreview({
          kind: 'unavailable',
          why:
            "This fleet's machines run a Nodeau without previews. You can still run it: the machine checks " +
            'whether it fits as it starts it. Updating the fleet adds the preview.',
        });
        return;
      }
      setError(err);
      return;
    }
    setPreview({ kind: 'asking', op });
    for (let i = 0; i < POLL_LIMIT && !cancelled.current; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      let current: Operation;
      try {
        current = await api.fleetOperation(org.id, op.id);
      } catch (err) {
        setError(err);
        setPreview({ kind: 'idle' });
        return;
      }
      if (current.state === 'failed' || current.state === 'expired') {
        setPreview({
          kind: 'unavailable',
          why: current.resultDetail ?? 'The fleet could not answer the preview. You can still run it.',
        });
        return;
      }
      if (current.state === 'observed') {
        try {
          const answer = await api.fleetPreview(org.id, op.id);
          setPreview({ kind: 'shown', op: current, preview: answer.preview });
        } catch (err) {
          setError(err);
          setPreview({ kind: 'idle' });
        }
        return;
      }
    }
    if (!cancelled.current) {
      setPreview({
        kind: 'unavailable',
        why: 'The fleet did not answer in time. It may be offline; you can still ask it to run the model.',
      });
    }
  }, [org.id, name, configuration]);

  const run = useCallback(
    async (override?: AdmissionCandidate) => {
      setBusy(true);
      setError(null);
      try {
        const body: Record<string, unknown> = {
          kind: 'workload.run',
          workloadName: name.trim(),
          ...configuration(),
        };
        if (override && preview.kind === 'shown') {
          const needs = override.explanation.override?.needs ?? [];
          body.overrideMachine = override.machine;
          body.previewId = preview.op.id;
          if (needs.includes('soft-reserve')) body.spendSafetyReserve = true;
          if (needs.includes('estimate-risk')) body.acceptEstimateRisk = true;
        }
        setStarted(await api.requestFleetOperation(org.id, body));
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [org.id, name, configuration, preview],
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await run();
    },
    [run],
  );

  if (started) {
    return (
      <section className="narrow">
        <h1>Starting {name}</h1>
        <OperationProgress op={started} onDismiss={() => navigate(hrefFor.fleetWorkloads())} />
        <p className="muted">
          Nodeau is checking the fit again on the machine and starting the model, downloading it first if
          this fleet does not have it yet. That can take a few minutes the first time.
        </p>
        <p>
          <a
            className="btn btn-ghost btn-sm"
            href={hrefFor.fleetWorkloads()}
            onClick={(e) => {
              e.preventDefault();
              navigate(hrefFor.fleetWorkloads());
            }}
          >
            See what is running
          </a>
        </p>
      </section>
    );
  }

  const canAsk = model.trim() !== '' && !busy && preview.kind !== 'asking';
  const shown = preview.kind === 'shown' ? preview.preview : null;
  const wouldRun = !!shown?.candidates?.some((c) => c.selected);

  return (
    <section className="narrow">
      <a
        className="back"
        href={hrefFor.fleetWorkloads()}
        onClick={(e) => {
          e.preventDefault();
          navigate(hrefFor.fleetWorkloads());
        }}
      >
        ← Workloads
      </a>
      <h1>Run a workload</h1>
      <p className="muted">
        Nodeau picks the machine and the accelerator. Preview it to see where it would run, what it would
        cost and why. Nodeau refuses rather than start something that does not fit.
      </p>

      <form className="form" onSubmit={submit}>
        <label htmlFor="run-name">Name</label>
        {/* THE HYPHEN IN `pattern` IS ESCAPED, and that is not decoration.
            Chromium compiles this attribute with the `v` flag, which rejects
            `[a-z0-9-]` as an invalid character class — and a REJECTED PATTERN
            IS DROPPED, so the field validated nothing at all while looking
            constrained. `\-` is accepted by both `u` and `v`. */}
        <input
          id="run-name"
          type="text"
          value={name}
          required
          maxLength={63}
          pattern="[a-z0-9]([a-z0-9\-]*[a-z0-9])?"
          placeholder="my-assistant"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="muted small">Lowercase letters, numbers and hyphens. This is what you will stop it by.</p>

        {/* THE TASK IS ABOVE THE MODEL: it narrows what the selector offers. */}
        <label htmlFor="run-task">Task</label>
        <select id="run-task" value={task} onChange={(e) => changeTask(e.target.value)}>
          <option value="">chat</option>
          <option value="embed">embed</option>
          <option value="rerank">rerank</option>
        </select>

        <label htmlFor="run-model">Model</label>
        <ModelSelect id="run-model" orgId={org.id} value={model} onChange={changeModel} task={task} required />
        <p className="muted small">
          Chosen from what Nodeau knows: its own catalogue, and any model your machines have reported running.
        </p>

        <label htmlFor="run-context">Context size</label>
        <input
          id="run-context"
          type="number"
          inputMode="numeric"
          min={256}
          max={1048576}
          step={256}
          value={contextSize}
          onChange={(e) => changeContext(e.target.value)}
        />
        <label htmlFor="run-parallel">Parallel requests</label>
        <input
          id="run-parallel"
          type="number"
          inputMode="numeric"
          min={1}
          max={64}
          value={parallel}
          onChange={(e) => changeParallel(e.target.value)}
        />
        <p className="muted small">
          Both change how much memory the model needs. The preview shows by how much.
        </p>

        <label htmlFor="run-gpus">Accelerators</label>
        <select id="run-gpus" value={gpuCount} onChange={(e) => changeGPUCount(e.target.value)}>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
        <p className="muted small">
          More than one is for a model that fits on no single card. It adds capacity rather than speed, because
          the layers run in sequence.
        </p>

        <label htmlFor="run-mode">Scheduling</label>
        <select id="run-mode" value={mode} onChange={(e) => changeMode(e.target.value)}>
          {/* NEVER the word "default": the empty option says whose choice it is. */}
          <option value="">use this fleet's own policy</option>
          <option value="efficiency">efficiency</option>
          <option value="balanced">balanced</option>
          <option value="performance">performance</option>
        </select>

        {error !== null && <ErrorNotice error={error as ApiError} />}

        <div aria-live="polite">
          {preview.kind === 'asking' && (
            <p className="state">
              <span className="spinner" aria-hidden="true" />
              Asking the fleet where it would run…
            </p>
          )}
          {preview.kind === 'unavailable' && <p className="notice notice-info">{preview.why}</p>}
          {shown && <AdmissionCard preview={shown} onOverride={(c) => setConfirming(c)} />}
        </div>

        {confirming && confirming.explanation.override && (
          <div className="panel override-confirm" role="group" aria-labelledby="override-title">
            <h3 id="override-title" tabIndex={-1} ref={confirmHeading}>
              Run on {confirming.machine} with a reduced safety reserve?
            </h3>
            <dl className="facts">
              <dt>Machine</dt>
              <dd>
                {confirming.machine}
                {confirming.explanation.machine.accelerator && ` · ${confirming.explanation.machine.accelerator}`}
              </dd>
              <dt>Reserve now</dt>
              <dd>{gib(confirming.explanation.override.reserveMiB)}</dd>
              <dt>Reserve for this run</dt>
              <dd>
                {gib(confirming.explanation.override.reserveWithOverrideMiB)} (the{' '}
                {gib(confirming.explanation.override.hardFloorMiB)} floor stays)
              </dd>
              {(confirming.explanation.override.estimateMarginMiB ?? 0) > 0 && (
                <>
                  <dt>Estimate allowance waived</dt>
                  <dd>{gib(confirming.explanation.override.estimateMarginMiB!)}</dd>
                </>
              )}
              <dt>Expected headroom</dt>
              <dd>{gib(confirming.explanation.override.headroomWithOverrideMiB)}</dd>
            </dl>
            <ul className="small">
              {(confirming.explanation.override.consequences ?? []).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || name.trim() === ''}
                onClick={() => void run(confirming)}
              >
                {busy ? 'Asking…' : 'Run with the reduced reserve'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                Keep the reserve
              </button>
            </div>
            {name.trim() === '' && <p className="muted small">Give it a name first.</p>}
          </div>
        )}

        {shown && !wouldRun && (
          <p className="muted small">
            Run as asked sends it anyway: the machine checks the fit again when it starts, and if it still does
            not fit, Nodeau refuses it and says why.
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn" disabled={!canAsk} onClick={() => void askPreview()}>
            {preview.kind === 'asking' ? 'Asking…' : shown ? 'Preview again' : 'Preview'}
          </button>
          {/* After a refusal the plain run is not an override: the machine
              checks again and refuses again unless something changed. "Run
              anyway" belongs to the override alone, offered only where the
              obstacle is Nodeau's own reserve. */}
          <button className={shown && !wouldRun ? 'btn' : 'btn btn-primary'} type="submit" disabled={busy}>
            {busy ? 'Asking…' : shown && !wouldRun ? 'Run as asked' : 'Run'}
          </button>
          <a
            className="btn btn-ghost"
            href={hrefFor.fleetWorkloads()}
            onClick={(e) => {
              e.preventDefault();
              navigate(hrefFor.fleetWorkloads());
            }}
          >
            Cancel
          </a>
        </div>
      </form>
    </section>
  );
}
