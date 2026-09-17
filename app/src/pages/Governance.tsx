import { useMemo, useState } from 'react';
import {
  api,
  ApiError,
  type FleetGovernance,
  type GovernanceSettings,
  type Organization,
} from '../lib/api';
import { useResource } from '../lib/useResource';
import { Empty, ErrorNotice, Identifier, relativeTime, Spinner } from '../components/ui';
import { ModelSelect } from '../components/ModelSelect';

/**
 * Resource governance — Phase 17C.
 *
 * # This page renders a policy; it does not own one
 *
 * There is exactly one policy model and it lives on the server. Nothing here
 * re-derives what a quota means, whether a card is in a pool, or who may change
 * any of it — `inPool`, `inGroup`, `applied` and `mayManage` all arrive
 * answered. A second model near a browser is a model that disagrees the day the
 * first one changes, and the one with pictures is the one people believe.
 *
 * # null and [] are opposite intentions and this file keeps them apart
 *
 * `null` is NO POLICY — every model, every card, every machine. `[]` is a
 * policy permitting NOTHING. A checkbox list makes the second easy to reach by
 * accident, so the page asks the question explicitly: "any" or "only these",
 * with "only these" and nothing ticked shown for what it is.
 *
 * # Saved is not applied, and the page says so
 *
 * Writing a policy returns an operation to follow. The fleet has to hear about
 * it and report back what it is enforcing, and only then does the server call
 * it applied. A green tick on save would be a claim rendered as a fact — which
 * is the one thing a governance page must not do, because the whole point of a
 * quota is that somebody is relying on it.
 *
 * # A quota decides what may START
 *
 * Lowering one stops nothing that is already running. That is said on the page
 * rather than left to be discovered, because the opposite assumption — "I will
 * lower this and things will stop" — is the one that makes somebody lower a
 * quota expecting capacity back.
 */
export function GovernancePage({ org }: { org: Organization }) {
  const [resource, reload] = useResource<FleetGovernance>(
    (signal) => api.fleetGovernance(org.id, signal),
    [org.id],
  );

  if (resource.status === 'loading') return <Spinner label="Reading this fleet's policy" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  return <GovernanceForm org={org} current={resource.data} onSaved={reload} />;
}

type ListMode = 'any' | 'only';

interface Draft {
  maxWorkloads: string;
  maxGpus: string;
  maxBatchWorkers: string;
  modelsMode: ListMode;
  models: string;
  devicesMode: ListMode;
  devices: Set<string>;
  nodesMode: ListMode;
  nodes: Set<string>;
}

function draftFrom(g: GovernanceSettings): Draft {
  return {
    maxWorkloads: g.maxWorkloads ? String(g.maxWorkloads) : '',
    maxGpus: g.maxGpus ? String(g.maxGpus) : '',
    maxBatchWorkers: g.maxBatchWorkers ? String(g.maxBatchWorkers) : '',
    modelsMode: g.allowedModels === null ? 'any' : 'only',
    models: (g.allowedModels ?? []).join('\n'),
    devicesMode: g.allowedDevices === null ? 'any' : 'only',
    devices: new Set(g.allowedDevices ?? []),
    nodesMode: g.allowedNodes === null ? 'any' : 'only',
    nodes: new Set(g.allowedNodes ?? []),
  };
}

/** settingsFrom builds the wire value.
 *
 *  An empty string is an ABSENT quota rather than zero, and `only` with nothing
 *  chosen is `[]` rather than null. Both directions are the null/[] rule, and
 *  both are the reason this is one function rather than three inline
 *  expressions that could each get it wrong differently. */
function settingsFrom(d: Draft): GovernanceSettings {
  const quota = (raw: string): number | undefined => {
    const trimmed = raw.trim();
    if (trimmed === '') return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : Number.NaN;
  };
  return {
    maxWorkloads: quota(d.maxWorkloads),
    maxGpus: quota(d.maxGpus),
    maxBatchWorkers: quota(d.maxBatchWorkers),
    allowedModels:
      d.modelsMode === 'any'
        ? null
        : d.models
            .split(/[\n,]/)
            .map((v) => v.trim())
            .filter((v) => v !== ''),
    allowedDevices: d.devicesMode === 'any' ? null : [...d.devices],
    allowedNodes: d.nodesMode === 'any' ? null : [...d.nodes],
  };
}

function GovernanceForm({
  org,
  current,
  onSaved,
}: {
  org: Organization;
  current: FleetGovernance;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(current.desired));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  // RE-SEEDED DURING RENDER, not in an effect.
  //
  // The server's answer is the form's starting point, so a reload after saving
  // has to replace the draft — otherwise the fields keep showing what was typed
  // rather than what was stored, and the two silently disagree. React's rule is
  // that adjusting state when an input changes belongs in the render body:
  // setting it in an effect renders the stale draft first and then replaces it,
  // which is the cascading render `react-hooks/set-state-in-effect` exists to
  // stop, and the lint rule refuses it.
  const [seed, setSeed] = useState(current);
  if (seed !== current) {
    setSeed(current);
    setDraft(draftFrom(current.desired));
  }

  const fieldErrors = error instanceof ApiError ? (error.fields ?? {}) : {};

  const devices = current.devices ?? [];
  const nodes = current.nodes ?? [];
  const readOnly = !current.mayManage;

  const dirty = useMemo(
    () => JSON.stringify(settingsFrom(draft)) !== JSON.stringify(settingsFrom(draftFrom(current.desired))),
    [draft, current.desired],
  );

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.setFleetGovernance(org.id, settingsFrom(draft));
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="page-head">
        <h1>Governance</h1>
        <p className="muted">
          Your organisation&rsquo;s own limits on what this fleet may run, inside what your plan
          already allows. A workload refused by one of these would have fitted.
        </p>
      </header>

      <StatusBanner current={current} />

      {current.machines === 0 && (
        <Empty title="No machine has reported yet">
          A policy set now is stored and reaches your machines when they next check in.
        </Empty>
      )}

      <form onSubmit={save} className="stack" aria-label="Fleet governance">
        <fieldset disabled={readOnly || saving} className="stack">
          <section className="panel gov-section" aria-labelledby="gov-quotas">
            <header className="gov-section-head">
              <h2 id="gov-quotas">Quotas</h2>
              <p className="muted small">
                Leave one empty for no limit. <strong>Lowering a quota stops nothing that is
                already running</strong> — a quota decides what may start, so use Workloads to stop
                something when you want capacity back.
              </p>
            </header>
            <div className="quota-grid">
              <QuotaField
                id="maxWorkloads"
                label="Workloads at once"
                value={draft.maxWorkloads}
                problem={fieldErrors.maxWorkloads}
                onChange={(v) => setDraft({ ...draft, maxWorkloads: v })}
              />
              <QuotaField
                id="maxGpus"
                label="Graphics cards in use at once"
                value={draft.maxGpus}
                problem={fieldErrors.maxGpus}
                onChange={(v) => setDraft({ ...draft, maxGpus: v })}
              />
              <QuotaField
                id="maxBatchWorkers"
                label="Batch workers at once"
                value={draft.maxBatchWorkers}
                problem={fieldErrors.maxBatchWorkers}
                onChange={(v) => setDraft({ ...draft, maxBatchWorkers: v })}
              />
            </div>
            <p className="muted small gov-note">
              Workloads and graphics cards are separate numbers because one workload may hold
              several cards. A batch worker that has to wait is behaving correctly and its job
              still finishes.
            </p>
          </section>

          <section className="panel gov-section" aria-labelledby="gov-models">
            <header className="gov-section-head">
              <h2 id="gov-models">Models</h2>
              <p className="muted small">
                A model is named here by the id a workload runs under — a catalog id, or the
                name a model was imported as on your machines.
              </p>
            </header>
            <ModeChoice
              name="models"
              mode={draft.modelsMode}
              anyLabel="Any model your plan allows"
              onlyLabel="Only these models"
              onChange={(modelsMode) => setDraft({ ...draft, modelsMode })}
            />
            {draft.modelsMode === 'only' && (
              <div className="gov-models">
                <label className="field">
                  <span>One per line, by the id a workload names</span>
                  <textarea
                    rows={4}
                    value={draft.models}
                    aria-label="Permitted models"
                    onChange={(e) => setDraft({ ...draft, models: e.target.value })}
                  />
                </label>
                {/* THE LIST STAYS THE AUTHORITATIVE FIELD and the picker only
                    appends to it. A policy legitimately names ids this
                    catalogue does not contain — a model nobody has run yet —
                    so replacing the list with a set of checkboxes would remove
                    something an administrator can do today. What the picker
                    removes is the typo in the ordinary case. */}
                <ModelAdder
                  orgId={org.id}
                  onAdd={(id) => {
                    const lines = draft.models.split('\n').map((l) => l.trim());
                    if (lines.includes(id)) return;
                    const kept = lines.filter((l) => l !== '');
                    setDraft({ ...draft, models: [...kept, id].join('\n') });
                  }}
                />
                {fieldErrors.allowedModels && (
                  <p className="field-error">{fieldErrors.allowedModels}</p>
                )}
                {draft.models.trim() === '' && (
                  <p className="notice notice-warn">
                    This list is empty, so <strong>no model would be permitted</strong>. That is a
                    real choice and it is not the same as &ldquo;any model&rdquo;.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="panel gov-section" aria-labelledby="gov-devices">
            <header className="gov-section-head">
              <h2 id="gov-devices">Graphics cards</h2>
              <p className="muted small">
                Cards are named by their own identifier rather than by a number, so adding or
                removing one never silently changes which card a policy means. A card left out
                is healthy and simply not one this fleet&rsquo;s workloads may use.
              </p>
            </header>
            <ModeChoice
              name="devices"
              mode={draft.devicesMode}
              anyLabel="Any card in this fleet"
              onlyLabel="Only these cards"
              onChange={(devicesMode) => setDraft({ ...draft, devicesMode })}
            />
            {draft.devicesMode === 'only' && (
              <>
                {devices.length === 0 ? (
                  <p className="muted small">This fleet has not reported any cards yet.</p>
                ) : (
                  <ul className="choice-list">
                    {devices.map((d) => (
                      <li key={d.uuid}>
                        <label>
                          <input
                            type="checkbox"
                            checked={draft.devices.has(d.uuid)}
                            onChange={(e) => {
                              const next = new Set(draft.devices);
                              if (e.target.checked) next.add(d.uuid);
                              else next.delete(d.uuid);
                              setDraft({ ...draft, devices: next });
                            }}
                          />
                          <span className="choice-text">
                            <strong className="choice-title">{d.model ?? 'Graphics card'}</strong>{' '}
                            <span className="choice-sub">
                              on {d.machineName ?? 'an unnamed machine'}
                            </span>{' '}
                            <Identifier className="choice-id" value={d.uuid} />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.devices.size === 0 && devices.length > 0 && (
                  <p className="notice notice-warn gov-list-warning">
                    Nothing is ticked, so <strong>no card would be permitted</strong>.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="panel gov-section" aria-labelledby="gov-nodes">
            <header className="gov-section-head">
              <h2 id="gov-nodes">Machines</h2>
              <p className="muted small">
                Which of this fleet&rsquo;s machines its workloads may use. Leaving a machine out
                says nothing about its health; it is simply not one this policy chooses.
              </p>
            </header>
            <ModeChoice
              name="nodes"
              mode={draft.nodesMode}
              anyLabel="Any machine in this fleet"
              onlyLabel="Only these machines"
              onChange={(nodesMode) => setDraft({ ...draft, nodesMode })}
            />
            {draft.nodesMode === 'only' && (
              <>
                {nodes.length === 0 ? (
                  <p className="muted small">This fleet has not reported any machines yet.</p>
                ) : (
                  <ul className="choice-list">
                    {nodes.map((n) => (
                      <li key={n.name}>
                        <label>
                          <input
                            type="checkbox"
                            checked={draft.nodes.has(n.name)}
                            onChange={(e) => {
                              const next = new Set(draft.nodes);
                              if (e.target.checked) next.add(n.name);
                              else next.delete(n.name);
                              setDraft({ ...draft, nodes: next });
                            }}
                          />
                          <span className="choice-text">
                            <strong className="choice-title">{n.name}</strong>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.nodes.size === 0 && nodes.length > 0 && (
                  <p className="notice notice-warn gov-list-warning">
                    Nothing is ticked, so <strong>no machine would be permitted</strong>.
                  </p>
                )}
              </>
            )}
          </section>
        </fieldset>

        {readOnly && (
          <p className="notice">
            You can see this fleet&rsquo;s policy and not change it. Ask an administrator in{' '}
            {org.name} if one of these numbers is in your way.
          </p>
        )}

        {error !== null && <ErrorNotice error={error} />}

        {!readOnly && (
          <div className="save-bar">
            <button type="submit" className="btn btn-primary" disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save policy'}
            </button>
            {saved && (
              <span className="muted small">
                Stored. Your machines apply it when they next check in — this page says
                &ldquo;in force&rdquo; once they report it back.
              </span>
            )}
          </div>
        )}
      </form>
    </section>
  );
}

/** StatusBanner says what is actually in force, which is not what was saved. */
function StatusBanner({ current }: { current: FleetGovernance }) {
  const configured =
    current.desired.maxWorkloads !== undefined ||
    current.desired.maxGpus !== undefined ||
    current.desired.maxBatchWorkers !== undefined ||
    current.desired.allowedModels !== null ||
    current.desired.allowedDevices !== null ||
    current.desired.allowedNodes !== null;

  if (!configured && !current.observed) {
    return (
      <p className="notice" data-testid="governance-status">
        Nothing is limited beyond what your plan already allows. A fleet with no policy is a
        working fleet.
      </p>
    );
  }
  if (current.applied) {
    return (
      <p className="notice notice-ok" data-testid="governance-status">
        <strong>In force.</strong> Your machines report they are enforcing exactly this
        {current.observedAt ? `, as of ${relativeTime(current.observedAt)}` : ''}.
        {current.setByEmail ? ` Set by ${current.setByEmail}.` : ''}
        {!current.consistent &&
          ' Not every machine carries the same policy yet; the strictest value is in use while that settles.'}
      </p>
    );
  }
  return (
    <p className="notice notice-warn" data-testid="governance-status">
      <strong>Saved, not yet in force.</strong>{' '}
      {current.observed
        ? 'Your machines are still enforcing the previous policy. They apply this one when they next check in.'
        : 'No machine has reported what it is enforcing yet.'}
      {current.setByEmail ? ` Set by ${current.setByEmail}.` : ''}
    </p>
  );
}

function QuotaField({
  id,
  label,
  value,
  problem,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  problem?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        id={id}
        name={id}
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="No limit"
        value={value}
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {problem && <span className="field-error">{problem}</span>}
    </label>
  );
}

/**
 * ModelAdder appends a catalogue id to the permitted list.
 *
 * # It ADDS; it does not own the list
 *
 * The textarea remains the value that is saved. This exists because the
 * ordinary case — permitting models Nodeau ships — should not be typed from
 * memory, and because a mistyped entry in a model policy fails in the worst
 * possible way: silently, later, as a refusal for a model somebody believes
 * they permitted.
 *
 * Its own value is cleared after each add, so the control reads as an action
 * rather than as a second place the policy lives.
 */
function ModelAdder({ orgId, onAdd }: { orgId: string; onAdd: (id: string) => void }) {
  const [picked, setPicked] = useState('');
  return (
    <div className="model-adder">
      <label htmlFor="governance-add-model" className="muted small">
        Add one from your catalogue
      </label>
      <ModelSelect
        id="governance-add-model"
        orgId={orgId}
        value={picked}
        ariaLabel="Add a model to the policy"
        onChange={(id) => {
          setPicked('');
          if (id !== '') onAdd(id);
        }}
      />
    </div>
  );
}

function ModeChoice({
  name,
  mode,
  anyLabel,
  onlyLabel,
  onChange,
}: {
  name: string;
  mode: ListMode;
  anyLabel: string;
  onlyLabel: string;
  onChange: (m: ListMode) => void;
}) {
  return (
    <div className="choice-row" role="radiogroup" aria-label={name}>
      <label>
        <input
          type="radio"
          name={name}
          checked={mode === 'any'}
          onChange={() => onChange('any')}
        />
        {anyLabel}
      </label>
      <label>
        <input
          type="radio"
          name={name}
          checked={mode === 'only'}
          onChange={() => onChange('only')}
        />
        {onlyLabel}
      </label>
    </div>
  );
}
