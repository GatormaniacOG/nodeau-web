import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, type CatalogModel, type ModelCatalog } from '../lib/api';
import { useResource } from '../lib/useResource';
import { ErrorNotice, Spinner } from './ui';

/**
 * Choosing a model, from what Nodeau actually knows.
 *
 * # Why this exists
 *
 * Phase 17C settled the rule for accelerators: "a console must not ask somebody
 * to type a GPU UUID", so the server sends the real inventory and the browser
 * offers it. The run form still asked for a MODEL as free text, with a
 * DEPRECATED catalogue id as its placeholder — so the one field where a typo is
 * accepted here and refused later by a machine was the field with no inventory
 * behind it. This is that rule reaching the last place it had not.
 *
 * # The display value and the submitted value are never the same string
 *
 * A person reads "Qwen3.5-4B Q4_K_M"; the API receives `qwen3.5-4b-q4km`. The
 * selected value in this component is always an id, never a label, and typing
 * only ever filters — it never becomes the value.
 *
 * # WHAT IT DOES NOT DO
 *
 * It does not decide anything. It does not filter on whether a model will fit:
 * admission is arithmetic done on the machine, against the card actually
 * present, and a browser that hid a model because it guessed at a poor fit
 * would be a second admission engine beside the one that works. It does not
 * re-derive the organisation's model policy either — the server answers
 * `permitted`, and a model that is not permitted is SHOWN, marked, with the
 * reason, because somebody refused by a policy has to be able to see the list
 * that refused them.
 *
 * And it is not a security boundary. Every id submitted is validated, governed
 * and admitted again on the machine that would run it. This removes the typing,
 * not a check.
 *
 * # Why a manual entry survives, deliberately
 *
 * Nodeau Cloud cannot enumerate a machine's imported models: the fleet report
 * carries machines, accelerators and workloads and nothing about a model store.
 * A GGUF somebody imported and has never run is therefore a model this list
 * cannot contain. Removing the ability to name one would take away a capability
 * that exists today — so the escape hatch stays, INSIDE the list, as a
 * deliberate choice somebody makes rather than a text box sitting next to the
 * dropdown as a convenience.
 */

export interface ModelSelectProps {
  /** The element id, so the caller's own label can point at it. */
  id: string;
  orgId: string;
  /** The canonical model id currently chosen. Empty is "nothing yet". */
  value: string;
  onChange: (id: string) => void;
  /** Offer only models that can be STARTED for this task. Empty means chat,
   *  which is what an unset task means everywhere else in the product. */
  task?: string;
  required?: boolean;
  /** What the control announces itself as, for assistive technology. The
   *  visible label belongs to the caller; this is the accessible name of the
   *  combobox itself when the two would otherwise differ. */
  ariaLabel?: string;
}

export function ModelSelect({
  id,
  orgId,
  value,
  onChange,
  task,
  required,
  ariaLabel,
}: ModelSelectProps) {
  const [catalog, reload] = useResource<ModelCatalog>(
    (signal) => api.models(orgId, task ? { task } : undefined, signal),
    [orgId, task],
  );

  if (catalog.status === 'loading') {
    // NOT AN EMPTY DROPDOWN. A selector with nothing in it is
    // indistinguishable from "this account has no models", which is the wrong
    // thing to tell somebody for the second it takes to answer.
    return (
      <div className="combo-shell">
        <input
          id={id}
          className="input"
          type="text"
          value=""
          readOnly
          disabled
          aria-busy="true"
          aria-label={ariaLabel}
          placeholder="Loading models..."
          onChange={() => undefined}
        />
        <Spinner label="Loading models" />
      </div>
    );
  }

  if (catalog.status === 'error') {
    // NEVER a fallback list. A hard-coded set shown when the catalogue could
    // not be read is a list that is wrong precisely when nobody can check it.
    return (
      <div className="combo-shell">
        <input
          id={id}
          className="input"
          type="text"
          value=""
          readOnly
          disabled
          aria-label={ariaLabel}
          placeholder="Models could not be loaded"
          onChange={() => undefined}
        />
        <ErrorNotice error={catalog.error} onRetry={reload} />
      </div>
    );
  }

  return (
    <ModelCombo
      id={id}
      models={catalog.data.models}
      value={value}
      onChange={onChange}
      task={task}
      required={required}
      ariaLabel={ariaLabel}
      policyApplied={catalog.data.policyApplied}
    />
  );
}

/** Group is how the list is divided, in the order it is read. */
interface Group {
  key: string;
  label: string;
  note?: string;
  models: CatalogModel[];
}

function groupsFor(models: CatalogModel[]): Group[] {
  const featured = models.filter((m) => m.source === 'catalog' && m.featured);
  const superseded = models.filter((m) => m.source === 'catalog' && !m.featured);
  const fleet = models.filter((m) => m.source === 'fleet');

  const groups: Group[] = [];
  if (featured.length > 0) {
    groups.push({ key: 'featured', label: 'Nodeau models', models: featured });
  }
  if (fleet.length > 0) {
    groups.push({
      key: 'fleet',
      label: 'Models your fleet is running',
      // NOT "your custom models". Nodeau Cloud cannot tell a customer's own
      // GGUF from a curated model belonging to a release newer than this
      // service, and naming it "custom" would assert a trust class nobody
      // established.
      note: 'Ids your machines reported. Nodeau Cloud does not know what these can do; your machine decides.',
      models: fleet,
    });
  }
  if (superseded.length > 0) {
    groups.push({
      key: 'superseded',
      label: 'Superseded',
      note: 'Still supported, and not recommended for something new.',
      models: superseded,
    });
  }
  return groups;
}

/** secondaryLine is the one short line under a model's name.
 *
 *  Deliberately short. A dropdown row is a choice, not a catalogue card, and
 *  the full detail belongs on a page that has room for it. */
function secondaryLine(m: CatalogModel): string {
  const parts: string[] = [];
  if (m.parameters) parts.push(m.parameters);
  if (m.quantization) parts.push(m.quantization);
  if (m.tasks?.length) parts.push(m.tasks.join(' / '));
  // THE RUNG IS GUIDANCE AND SAYS SO. "Needs" would read as a requirement this
  // component is in no position to state: whether a model fits is decided on
  // the machine, against the card actually present.
  if (m.recommendedVramGib) parts.push(`${m.recommendedVramGib} GB class`);
  if (m.source === 'fleet' && m.runningAs?.length) {
    parts.push(`running as ${m.runningAs.join(', ')}`);
  }
  return parts.join(' - ');
}

function labelFor(m: CatalogModel): string {
  return m.displayName || m.id;
}

function matches(m: CatalogModel, query: string): boolean {
  if (query === '') return true;
  const q = query.toLowerCase();
  return (
    m.id.toLowerCase().includes(q) ||
    (m.displayName ?? '').toLowerCase().includes(q) ||
    (m.family ?? '').toLowerCase().includes(q) ||
    (m.role ?? '').toLowerCase().includes(q) ||
    (m.quantization ?? '').toLowerCase().includes(q)
  );
}

interface Row {
  model?: CatalogModel;
  manual?: boolean;
}

function ModelCombo({
  id,
  models,
  value,
  onChange,
  task,
  required,
  ariaLabel,
  policyApplied,
}: {
  id: string;
  models: CatalogModel[];
  value: string;
  onChange: (id: string) => void;
  task?: string;
  required?: boolean;
  ariaLabel?: string;
  policyApplied: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);

  // Opening and filtering both reset the highlight, and they do it HERE
  // rather than in an effect. `react-hooks/set-state-in-effect` is right about
  // why: an effect that sets state after a render renders again, and the
  // highlight is state this component owns rather than something it is
  // synchronising with the outside world.
  const openList = useCallback(() => {
    setOpen(true);
    setActive(0);
  }, []);
  const closeList = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const selected = useMemo(() => models.find((m) => m.id === value), [models, value]);
  const groups = useMemo(() => groupsFor(models), [models]);

  // The flat list the keyboard walks, in the order it is rendered. The manual
  // entry is the last row, so somebody arrowing through options reaches the
  // catalogue first and the escape hatch last.
  const visible = useMemo(() => {
    const rows: Row[] = [];
    for (const group of groups) {
      for (const m of group.models) {
        if (matches(m, query)) rows.push({ model: m });
      }
    }
    rows.push({ manual: true });
    return rows;
  }, [groups, query]);

  // A click anywhere else closes the list. Without this the popup survives a
  // click on the page behind it, which reads as a stuck control.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (shell.current && !shell.current.contains(e.target as Node)) closeList();
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open, closeList]);

  // `required` IS THE PLATFORM'S OWN VALIDITY, ATTACHED TO THE VALUE RATHER
  // THAN TO THE TEXT.
  //
  // The visible box holds a SEARCH STRING while the list is open, so marking it
  // `required` would let a form pass because somebody typed — the exact mistake
  // this control exists to remove. The first draft used a hidden `required`
  // input instead, and a real browser showed why that is worse: Chromium blocks
  // the submit and anchors "Please fill out this field" to a clipped element
  // nobody can see, with no way to say what to do about it.
  //
  // `setCustomValidity` keeps the browser doing the blocking — no submit
  // handler to get wrong, no second source of truth about whether the form is
  // complete — while pointing the message at the control somebody is looking at
  // and saying what it wants. An effect is the right place: this synchronises
  // React state with a DOM API, which is what effects are for.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.setCustomValidity(required && value === '' ? 'Choose a model from the list.' : '');
  }, [required, value, manual]);

  const choose = useCallback(
    (row: Row) => {
      if (row.manual) {
        setManual(true);
        closeList();
        onChange('');
        return;
      }
      const m = row.model;
      if (!m) return;
      // A MODEL THE POLICY EXCLUDES IS NOT SELECTABLE, and it is still shown.
      // Hiding it would leave somebody unable to see the list that refused
      // them; letting them choose it would send a request the machine refuses.
      if (!m.permitted) return;
      onChange(m.id);
      closeList();
    },
    [onChange, closeList],
  );

  if (manual) {
    return (
      <div className="combo-shell">
        <input
          id={id}
          className="input"
          type="text"
          value={value}
          required={required}
          placeholder="model id"
          aria-label={ariaLabel ?? 'Model id'}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="muted small">
          For a model you imported on a machine and have not run yet. Nodeau Cloud cannot
          list a machine&rsquo;s imported models; it sees them once they run. Your machine
          checks this id before anything starts.
        </p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setManual(false);
            onChange('');
          }}
        >
          Choose from the list instead
        </button>
      </div>
    );
  }

  const activeRow = visible[active];
  const activeId = activeRow
    ? activeRow.manual
      ? `${listId}-manual`
      : `${listId}-${activeRow.model?.id}`
    : undefined;

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          openList();
          return;
        }
        setActive((n) => Math.min(n + 1, visible.length - 1));
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) {
          openList();
          return;
        }
        setActive((n) => Math.max(n - 1, 0));
        return;
      case 'Enter':
        if (!open) return;
        // The form must not submit on the keystroke that picks a model.
        e.preventDefault();
        if (activeRow) choose(activeRow);
        return;
      case ' ':
        // Space types a space while filtering; it only opens a closed list.
        if (!open) {
          e.preventDefault();
          openList();
        }
        return;
      case 'Escape':
        if (open) {
          e.preventDefault();
          closeList();
        }
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
    }
  };

  // The text in the box: what is being typed while the list is open, and the
  // chosen model's NAME when it is closed. The value submitted is never this
  // string — it is the id behind it.
  const shown = open ? query : selected ? labelFor(selected) : value;

  return (
    <div className="combo-shell" ref={shell}>
      <div className="combo">
        <input
          ref={box}
          id={id}
          className="input combo-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? activeId : undefined}
          aria-label={ariaLabel}
          autoComplete="off"
          placeholder={value === '' ? 'Select a model' : undefined}
          value={shown}
          onChange={(e) => {
            setQuery(e.target.value);
            openList();
          }}
          onFocus={openList}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="combo-toggle"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => (open ? closeList() : openList())}
        >
          <span aria-hidden="true">&#9662;</span>
        </button>
      </div>

      {open && (
        <div className="combo-list" role="listbox" id={listId} aria-label="Models">
          {visible.length === 1 && query !== '' && (
            <p className="combo-none muted small">Nothing matches {query}.</p>
          )}
          {groups.map((group) => {
            const rows = group.models.filter((m) => matches(m, query));
            if (rows.length === 0) return null;
            return (
              <div className="combo-group" role="group" aria-label={group.label} key={group.key}>
                <p className="combo-group-label">{group.label}</p>
                {group.note && <p className="combo-group-note">{group.note}</p>}
                {rows.map((m) => {
                  const index = visible.findIndex((row) => row.model?.id === m.id);
                  return (
                    <div
                      key={m.id}
                      id={`${listId}-${m.id}`}
                      role="option"
                      className={
                        'combo-option' +
                        (index === active ? ' is-active' : '') +
                        (m.permitted ? '' : ' is-disabled')
                      }
                      aria-selected={m.id === value}
                      aria-disabled={m.permitted ? undefined : true}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(e) => {
                        // mousedown, not click: the input's blur would close
                        // the list before a click ever landed.
                        e.preventDefault();
                        choose({ model: m });
                      }}
                    >
                      <span className="combo-option-name">{labelFor(m)}</span>
                      <span className="combo-option-meta">{secondaryLine(m)}</span>
                      {/* The canonical id, quietly, because it is what is
                          submitted and somebody comparing with their terminal
                          needs to see it — and only when it differs from what
                          they are already reading. A model with no display
                          name IS its id, and printing it twice is noise in the
                          one group where the rows are least familiar. */}
                      {labelFor(m) !== m.id && <span className="combo-option-id">{m.id}</span>}
                      {!m.permitted && (
                        <span className="combo-option-refusal">
                          {m.notPermittedReason ??
                            'Your organisation does not permit this model.'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="combo-group" role="group" aria-label="Not listed">
            <div
              id={`${listId}-manual`}
              role="option"
              aria-selected={false}
              className={'combo-option combo-manual' + (activeRow?.manual ? ' is-active' : '')}
              onMouseEnter={() => setActive(visible.length - 1)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose({ manual: true });
              }}
            >
              <span className="combo-option-name">Use a model id that is not listed</span>
              <span className="combo-option-meta">
                For a model you imported and have not run yet.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* A SAVED VALUE IS NEVER SILENTLY RETARGETED. An id this list does not
          contain stays exactly as it is and says so — choosing a different
          model on somebody's behalf is the one thing a selector must not do. */}
      {value !== '' && !selected && (
        <p className="field-warning">
          <strong>{value}</strong> is not in this list
          {task ? ` for ${task}` : ''}. It will be sent exactly as it is, and your machine
          will check it.
        </p>
      )}

      {models.length === 0 && (
        <p className="muted small">
          No models are available to this organisation. A machine that has run a model
          reports it here, and you can also name a model id yourself.
        </p>
      )}

      {policyApplied && (
        <p className="muted small">
          Your organisation has a model policy, so this list is what it permits.
        </p>
      )}
    </div>
  );
}
