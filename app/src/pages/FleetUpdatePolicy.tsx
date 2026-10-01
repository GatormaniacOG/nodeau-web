import { useState } from 'react';
import {
  api,
  type FleetChannelPolicy,
  type FleetMaintenanceWindow,
  type Organization,
} from '../lib/api';
import { useResource } from '../lib/useResource';
import { Badge, ErrorNotice, formatDate, Spinner } from '../components/ui';

/**
 * When Nodeau may update a fleet, and which release it follows — the settings a
 * rollout already obeys (Phase 18B, #159), finally settable from the account.
 *
 * # THE SERVER DOES THE ARITHMETIC
 *
 * Whether the window is open now and when it next opens come from the server,
 * computed by the same function the machines decide with. The page formats
 * times; it never works out a time-zone boundary of its own, because a second
 * copy of that arithmetic is exactly what disagrees twice a year (#173).
 *
 * # LOADING IS NOT "NONE"
 *
 * Until the server has answered, the page says it is reading — never "no
 * window is set". A window nobody could read and a window nobody set are
 * different facts, and only the second means a rollout may start at once.
 *
 * # THE SERVER SAYS WHO MAY CHANGE IT
 *
 * `mayManage` comes from the server. A person who may not change a setting
 * sees it and is offered nothing; the server refuses them anyway if they reach
 * past the page.
 */
export function FleetUpdatePolicy({ org }: { org: Organization }) {
  return (
    <div className="policy-grid" aria-label="When and what Nodeau updates">
      <MaintenanceWindowPanel org={org} />
      <ChannelPolicyPanel org={org} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// the maintenance window
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LENGTHS = [30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function zones(current: string): string[] {
  let list: string[];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    list = [];
  }
  const out = new Set(list);
  out.add('UTC');
  if (current) out.add(current);
  return [...out].sort();
}

export function clock(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function lengthLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? '1 hour' : `${h} hours`;
  }
  if (minutes < 60) return `${minutes} minutes`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day';
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 1) return `${DAY_NAMES[sorted[0] ?? 0] ?? 'Sunday'}s`;
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '0,6') return 'Saturdays and Sundays';
  return sorted.map((d) => DAY_SHORT[d] ?? String(d)).join(', ');
}

/** windowLabel is the window as one line, read off its own clock. */
export function windowLabel(w: Pick<FleetMaintenanceWindow, 'startMinute' | 'durationMinutes' | 'daysOfWeek' | 'timezone'>): string {
  const end = w.startMinute + w.durationMinutes;
  const nextDay = end >= 1440 ? ' the next day' : '';
  return `${daysLabel(w.daysOfWeek)}, ${clock(w.startMinute)} to ${clock(end)}${nextDay} (${w.timezone})`;
}

/** when renders an instant in a zone, and in the reader's own zone when that
 *  is different — the window is the organisation's clock, and the person
 *  reading may be somewhere else. */
export function when(iso: string, zone: string): string {
  const t = new Date(iso);
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(t);
  try {
    const there = fmt(zone);
    const here = browserZone();
    return here && here !== zone ? `${there} (${fmt(here)} your time)` : there;
  } catch {
    return t.toISOString();
  }
}

function MaintenanceWindowPanel({ org }: { org: Organization }) {
  const [resource, reload] = useResource<FleetMaintenanceWindow>(
    (signal) => api.fleetMaintenanceWindow(org.id, signal),
    [org.id],
  );
  const [editing, setEditing] = useState(false);

  return (
    <section className="panel" aria-labelledby="policy-window">
      <h2 id="policy-window">Maintenance window</h2>
      {resource.status === 'loading' && <Spinner label="Reading this fleet's maintenance window" />}
      {resource.status === 'error' && <ErrorNotice error={resource.error} onRetry={reload} />}
      {resource.status === 'ready' &&
        (editing ? (
          <WindowForm
            org={org}
            current={resource.data}
            onDone={() => {
              setEditing(false);
              reload();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <WindowSummary current={resource.data} onEdit={() => setEditing(true)} />
        ))}
    </section>
  );
}

function WindowSummary({ current, onEdit }: { current: FleetMaintenanceWindow; onEdit: () => void }) {
  return (
    <div className="stack">
      {current.configured ? (
        <>
          <p className="policy-value">{windowLabel(current)}</p>
          {current.openNow ? (
            <p>
              <Badge tone="ok">Open now</Badge> Nodeau may update your machines right now.
            </p>
          ) : (
            <p>
              <Badge tone="neutral">Closed</Badge>{' '}
              {current.nextOpensAt ? (
                <>It next opens {when(current.nextOpensAt, current.timezone)}.</>
              ) : (
                <>Nodeau could not work out when it next opens.</>
              )}
            </p>
          )}
          <p className="muted small">
            A rollout you approve waits for this window, and Nodeau only updates your machines by itself
            inside it.
            {current.updatedAt && (
              <>
                {' '}
                Set {current.setByEmail ? `by ${current.setByEmail} ` : ''}on {formatDate(current.updatedAt)}.
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="policy-value">No window set</p>
          <p className="muted small">
            A rollout you approve starts right away. Set a window if you&rsquo;d rather Nodeau only
            update your machines at a time you choose.
          </p>
        </>
      )}
      {current.mayManage ? (
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
            {current.configured ? 'Change window' : 'Set a window'}
          </button>
        </div>
      ) : (
        <p className="notice">You can see this setting and not change it.</p>
      )}
    </div>
  );
}

interface WindowDraft {
  days: Set<number>;
  start: string;
  length: number;
  timezone: string;
}

function WindowForm({
  org,
  current,
  onDone,
  onCancel,
}: {
  org: Organization;
  current: FleetMaintenanceWindow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<WindowDraft>(() => ({
    days: new Set(current.configured ? current.daysOfWeek : [0]),
    start: current.configured ? clock(current.startMinute) : '03:00',
    length: current.configured ? current.durationMinutes : 60,
    timezone: current.configured && current.timezone ? current.timezone : browserZone(),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const lengths = LENGTHS.includes(draft.length) ? LENGTHS : [...LENGTHS, draft.length].sort((a, b) => a - b);
  const [hh = Number.NaN, mm = Number.NaN] = draft.start.split(':').map((v) => Number(v));
  const startMinute = Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : NaN;
  const days = [...draft.days].sort((a, b) => a - b);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.setFleetMaintenanceWindow(org.id, {
        startMinute,
        durationMinutes: draft.length,
        timezone: draft.timezone,
        daysOfWeek: days,
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setError(null);
    try {
      await api.setFleetMaintenanceWindow(org.id, { clear: true });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  function toggle(d: number) {
    setDraft((prev) => {
      const next = new Set(prev.days);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return { ...prev, days: next };
    });
  }

  return (
    <form onSubmit={save} className="stack" aria-label="Maintenance window">
      <fieldset disabled={saving} className="stack">
        <div className="field">
          <span id="window-days">Days it opens on</span>
          <div className="choice-row day-picker" role="group" aria-labelledby="window-days">
            {DAY_SHORT.map((label, d) => (
              <label key={label}>
                <input type="checkbox" checked={draft.days.has(d)} onChange={() => toggle(d)} />
                <span aria-hidden="true">{label}</span>
                <span className="visually-hidden">{DAY_NAMES[d]}</span>
              </label>
            ))}
          </div>
          <span className="muted small">
            {days.length === 0 ? 'None chosen means every day.' : daysLabel(days)}
          </span>
        </div>
        <div className="window-fields">
          <label className="field">
            <span>Opens at</span>
            <input
              type="time"
              required
              value={draft.start}
              onChange={(e) => setDraft((p) => ({ ...p, start: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>For</span>
            <select value={draft.length} onChange={(e) => setDraft((p) => ({ ...p, length: Number(e.target.value) }))}>
              {lengths.map((m) => (
                <option key={m} value={m}>
                  {lengthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Time zone</span>
            <select value={draft.timezone} onChange={(e) => setDraft((p) => ({ ...p, timezone: e.target.value }))}>
              {zones(draft.timezone).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
        </div>
        {Number.isFinite(startMinute) && (
          <p className="muted small" aria-live="polite">
            {windowLabel({ startMinute, durationMinutes: draft.length, daysOfWeek: days, timezone: draft.timezone })}
          </p>
        )}
      </fieldset>

      {error !== null && <ErrorNotice error={error} />}

      <div className="save-bar">
        <button type="submit" className="btn btn-primary" disabled={saving || !Number.isFinite(startMinute)}>
          {saving ? 'Saving…' : 'Save window'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        {current.configured &&
          (confirmClear ? (
            <span className="inline-confirm" role="group" aria-label="Remove the window?">
              <span className="small">Remove it? Rollouts would then start as soon as they&rsquo;re approved.</span>
              <button type="button" className="btn btn-danger btn-sm" onClick={clear} disabled={saving}>
                Remove
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)} disabled={saving}>
              Remove window
            </button>
          ))}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// the release channel
// ---------------------------------------------------------------------------

function ChannelPolicyPanel({ org }: { org: Organization }) {
  const [resource, reload] = useResource<FleetChannelPolicy>(
    (signal) => api.fleetChannelPolicy(org.id, signal),
    [org.id],
  );
  const [editing, setEditing] = useState(false);

  return (
    <section className="panel" aria-labelledby="policy-channel">
      <h2 id="policy-channel">Release channel</h2>
      {resource.status === 'loading' && <Spinner label="Reading this fleet's release channel" />}
      {resource.status === 'error' && <ErrorNotice error={resource.error} onRetry={reload} />}
      {resource.status === 'ready' &&
        (editing ? (
          <ChannelForm
            org={org}
            current={resource.data}
            onDone={() => {
              setEditing(false);
              reload();
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <ChannelSummary current={resource.data} onEdit={() => setEditing(true)} />
        ))}
    </section>
  );
}

function ChannelSummary({ current, onEdit }: { current: FleetChannelPolicy; onEdit: () => void }) {
  return (
    <div className="stack">
      <p className="policy-value">
        {current.channel}{' '}
        <span className="muted small">{current.configured ? '(your choice)' : '(the default)'}</span>
      </p>
      <p>
        {current.pinnedVersion ? (
          <>
            Held at <strong>{current.pinnedVersion}</strong>. A rollout to any other release is refused
            until you change this.
          </>
        ) : (
          <>Follows the newest {current.channel} release.</>
        )}
      </p>
      <p className="muted small">
        {current.runningVersion ? (
          <>
            Your machines run {current.runningVersion}
            {current.upToDate === true && ', which is the release it is held at'}
            {current.upToDate === false && ', which is not yet the release it is held at'}.
          </>
        ) : (
          <>No machine has reported which release it runs yet.</>
        )}{' '}
        A channel only ever moves forward
        {current.floorVersion ? <>: this fleet will not be offered anything older than {current.floorVersion}</> : null}.
      </p>
      {current.mayManage ? (
        <div className="row-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
            Change
          </button>
        </div>
      ) : (
        <p className="notice">You can see this setting and not change it.</p>
      )}
    </div>
  );
}

function ChannelForm({
  org,
  current,
  onDone,
  onCancel,
}: {
  org: Organization;
  current: FleetChannelPolicy;
  onDone: () => void;
  onCancel: () => void;
}) {
  const offered = current.availableChannels.length > 0 ? current.availableChannels : [current.channel];
  const [channel, setChannel] = useState<string>(
    offered.includes(current.channel) ? current.channel : (offered[0] ?? current.channel),
  );
  const [hold, setHold] = useState(Boolean(current.pinnedVersion));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // A hold is to a release this fleet really runs or was already held at —
  // never a version typed into a box.
  const holdAt = current.pinnedVersion ?? current.runningVersion;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.setFleetChannelPolicy(org.id, {
        channel,
        pinnedVersion: hold && holdAt ? holdAt : undefined,
      });
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="stack" aria-label="Release channel">
      <fieldset disabled={saving} className="stack">
        {offered.length > 1 ? (
          <label className="field">
            <span>Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {offered.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>
            Nodeau publishes one channel today: <strong>{offered[0]}</strong>.
          </p>
        )}
        <div className="choice-row" role="radiogroup" aria-label="Which release">
          <label>
            <input type="radio" name="hold" checked={!hold} onChange={() => setHold(false)} />
            Follow the newest {channel} release
          </label>
          <label>
            <input
              type="radio"
              name="hold"
              checked={hold}
              disabled={!holdAt}
              onChange={() => setHold(true)}
            />
            {holdAt ? <>Stay on {holdAt}</> : <>Stay on the release my machines run (none reported yet)</>}
          </label>
        </div>
      </fieldset>

      {error !== null && <ErrorNotice error={error} />}

      <div className="save-bar">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
