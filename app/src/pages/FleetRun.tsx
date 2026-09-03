import { useCallback, useState } from 'react';
import { api, ApiError, type Operation, type Organization } from '../lib/api';
import { hrefFor } from '../lib/router';
import { ErrorNotice } from '../components/ui';
import { OperationProgress } from './FleetWorkloads';

/**
 * Run a workload — Phase 14D.
 *
 * # It asks for a MODEL, and never for a machine
 *
 * There is no machine picker and no card picker on this form, and that is the
 * product rather than an omission. Placement is `internal/placement`'s, on the
 * customer's own hardware, with admission arithmetic, entitlement, device
 * exclusivity and the fleet's scheduling policy all applying exactly as they
 * would to a typed `nodeau run`. A browser that chose a device would be a
 * second scheduler beside the one that works, and the first symptom would be a
 * workload placed where it does not fit.
 *
 * # It does not wait
 *
 * Submitting returns an operation id immediately. Starting a model can mean
 * downloading several gigabytes, and a form that blocked on that would be a
 * form people force-refresh.
 */
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [started, setStarted] = useState<Operation | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const op = await api.requestFleetOperation(org.id, {
          kind: 'workload.run',
          workloadName: name.trim(),
          model: model.trim(),
          ...(task ? { task } : {}),
          ...(gpuCount ? { gpuCount: Number(gpuCount) } : {}),
          ...(mode ? { schedulingMode: mode } : {}),
        });
        setStarted(op);
      } catch (err) {
        setError(err);
      } finally {
        setBusy(false);
      }
    },
    [org.id, name, model, task, gpuCount, mode],
  );

  if (started) {
    return (
      <section className="narrow">
        <h1>Starting {name}</h1>
        <OperationProgress op={started} onDismiss={() => navigate(hrefFor.fleetWorkloads())} />
        <p className="muted">
          Nodeau is choosing which machine and which accelerator to use, and downloading the
          model if this fleet does not have it yet. That can take a few minutes the first
          time.
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

  return (
    <section className="narrow">
      <h1>Run a workload</h1>
      <p className="muted">
        Nodeau picks the machine and the accelerator. It will refuse rather than start
        something that does not fit, and tell you why in the same words your terminal
        would.
      </p>

      <form className="form" onSubmit={submit}>
        <label htmlFor="run-name">Name</label>
        <input
          id="run-name"
          type="text"
          value={name}
          required
          maxLength={63}
          pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
          placeholder="my-assistant"
          onChange={(e) => setName(e.target.value)}
        />
        <p className="muted small">
          Lowercase letters, numbers and hyphens. This is what you will stop it by.
        </p>

        <label htmlFor="run-model">Model</label>
        <input
          id="run-model"
          type="text"
          value={model}
          required
          placeholder="qwen3-8b-q4km"
          onChange={(e) => setModel(e.target.value)}
        />
        <p className="muted small">
          A model id from Nodeau's catalogue. Your machine checks it before anything
          starts.
        </p>

        <label htmlFor="run-task">Task</label>
        <select id="run-task" value={task} onChange={(e) => setTask(e.target.value)}>
          <option value="">chat</option>
          <option value="embed">embed</option>
          <option value="rerank">rerank</option>
        </select>

        <label htmlFor="run-gpus">Accelerators</label>
        <select id="run-gpus" value={gpuCount} onChange={(e) => setGPUCount(e.target.value)}>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
        <p className="muted small">
          More than one is for a model that fits on no single card. It is not faster —
          the layers run in sequence.
        </p>

        <label htmlFor="run-mode">Scheduling</label>
        <select id="run-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {/* NEVER the word "default". An unset mode means different things on
              different builds, so the empty option says whose choice it is
              rather than naming one. */}
          <option value="">use this fleet's own policy</option>
          <option value="efficiency">efficiency</option>
          <option value="balanced">balanced</option>
          <option value="performance">performance</option>
        </select>

        {error !== null && <ErrorNotice error={error as ApiError} />}

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Asking…' : 'Run'}
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
