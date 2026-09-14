import { useMemo, useState } from 'react';
import {
  api,
  type AuditPage,
  type Organization,
  type UsageRate,
  type UsageSummary,
} from '../lib/api';
import { useResource } from '../lib/useResource';
import { Empty, ErrorNotice, relativeTime, Spinner } from '../components/ui';

/**
 * Usage and audit — Phase 17D.
 *
 * # WHAT THIS PAGE IS NOT
 *
 * It is not a bill, an invoice, a meter or a price list. Nodeau is priced for
 * infrastructure rather than for tokens — the pricing page says so three ways —
 * and a screen that looked like billing would contradict that whatever its
 * labels said. What it answers is "what is my hardware doing for me", which an
 * organisation with several machines cannot get from any one of them.
 *
 * # ACCELERATOR-SECONDS ARE A FACT ABOUT A RESERVATION
 *
 * Not about a card. Nodeau cannot attribute GPU utilisation per process —
 * issue #17 refuses that measurement by design — so this says "this workload
 * held these cards for this long" and never "this card was N% busy". The
 * wording on the page is chosen so a reader cannot come away with the second.
 *
 * # ABSENT IS NOT ZERO, AND THE PAGE SAYS WHICH
 *
 * A cost appears only where the organisation entered its own rate. A zero would
 * render as "this cost you nothing", which is a claim Nodeau is in no position
 * to make. `rateConfigured` is what lets the page distinguish "nobody has
 * entered a rate" from "there was no usage" — two facts that would otherwise
 * look identical, and that a person acts on differently.
 *
 * # A REFUSAL IS THE EVENT AN INVESTIGATION STARTS FROM
 *
 * The audit list shows refusals alongside what succeeded, and can filter to
 * them. A trail holding only what happened cannot answer "did somebody try".
 * An event with NO result is from before the column existed and is shown as
 * such rather than as success.
 */
export function UsagePage({ org }: { org: Organization }) {
  const [days, setDays] = useState(30);
  const window = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const [usage, reloadUsage] = useResource<UsageSummary>(
    (signal) => api.usage(org.id, window, signal),
    [org.id, window.from, window.to],
  );

  return (
    <div className="stack">
      <header className="page-head">
        <h1>Usage</h1>
        <p className="muted">
          How long your workloads held your accelerators. These are figures about
          what was <em>reserved</em>, taken by your own machines — not readings
          from any card, and not a bill.
        </p>
      </header>

      <div className="row" role="group" aria-label="Window">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            type="button"
            className={d === days ? 'chip chip-on' : 'chip'}
            aria-pressed={d === days}
            onClick={() => setDays(d)}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {usage.status === 'loading' && <Spinner label="Reading usage" />}
      {usage.status === 'error' && <ErrorNotice error={usage.error} onRetry={reloadUsage} />}
      {usage.status === 'ready' && <UsageBody org={org} data={usage.data} />}

      <AuditSection org={org} />
    </div>
  );
}

/** hours renders accelerator-seconds the way a person reads them.
 *
 *  Seconds are the honest unit and an unreadable one at fleet scale: a
 *  fortnight of one card is 1,209,600 of them. Hours are shown and the unit is
 *  named, so nothing is being rounded away silently. */
function hours(seconds: number): string {
  const h = seconds / 3600;
  if (h < 1) return `${Math.round(seconds)} accelerator-seconds`;
  return `${h.toLocaleString(undefined, { maximumFractionDigits: 1 })} accelerator-hours`;
}

function UsageBody({ org, data }: { org: Organization; data: UsageSummary }) {
  const lines = data.lines ?? [];
  return (
    <>
      <section className="panel" data-testid="usage-total">
        <h2>{hours(data.acceleratorSeconds)}</h2>
        <p className="muted">
          across {lines.length} workload{lines.length === 1 ? '' : 's'}, from{' '}
          {new Date(data.from).toLocaleDateString()} to{' '}
          {new Date(data.to).toLocaleDateString()}
        </p>
        {/* THE THREE STATES, AND THEY ARE NOT TWO.
            A cost, no rate, or a rate with nothing to apply it to. Rendering
            the middle one as a zero would say "this cost you nothing". */}
        {data.estimatedCost !== undefined ? (
          <p data-testid="usage-cost">
            <strong>
              {data.estimatedCost.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{' '}
              {data.currency}
            </strong>{' '}
            <span className="muted">
              at the rate your organisation entered. This is your figure applied to
              Nodeau's measurement — Nodeau does not know what your power or
              hardware costs.
            </span>
          </p>
        ) : (
          <p className="muted" data-testid="usage-no-cost">
            {data.rateConfigured
              ? 'Your rate is set; there is no usage in this window to apply it to.'
              : 'No cost is shown because nobody has entered a rate. Nodeau does not know what your electricity or your hardware costs, and will not guess.'}
          </p>
        )}
      </section>

      <RateForm org={org} />

      {lines.length === 0 ? (
        <Empty title="Nothing ran in this window">
          No workload held an accelerator between those dates.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table className="table" data-testid="usage-lines">
            <thead>
              <tr>
                <th scope="col">Workload</th>
                <th scope="col">Machine</th>
                <th scope="col">Model</th>
                <th scope="col">Held for</th>
                <th scope="col">Periods</th>
                {data.estimatedCost !== undefined && <th scope="col">At your rate</th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.kind}/${l.name}/${l.nodeName ?? ''}/${l.modelId ?? ''}`}>
                  <td>
                    {l.name}
                    <span className="muted"> {l.kind}</span>
                  </td>
                  <td>{l.nodeName || <span className="muted">—</span>}</td>
                  <td>
                    {l.modelId || <span className="muted">—</span>}
                    {/* A CUSTOM MODEL'S IDENTITY IS ITS BYTES. Shown short so
                        two quantisations under one alias are distinguishable,
                        which an alias alone cannot do. */}
                    {l.modelSha256 && (
                      <span className="muted"> · {l.modelSha256.slice(0, 12)}…</span>
                    )}
                  </td>
                  <td>{hours(l.acceleratorSeconds)}</td>
                  <td>{l.intervals}</td>
                  {data.estimatedCost !== undefined && (
                    <td>
                      {l.estimatedCost !== undefined
                        ? `${l.estimatedCost.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${data.currency}`
                        : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RateForm({ org }: { org: Organization }) {
  const [rate, reload] = useResource<UsageRate>((signal) => api.usageRate(org.id, signal), [org.id]);
  const [amount, setAmount] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  if (rate.status === 'loading') return <Spinner label="Reading your rate" />;
  if (rate.status === 'error') return <ErrorNotice error={rate.error} onRetry={reload} />;

  // RE-SEEDED DURING RENDER rather than in an effect, so the form shows the
  // server's answer on the first paint rather than a frame of empty inputs that
  // then fills in — the same rule the governance form follows.
  const value = amount ?? (rate.data.perAcceleratorHour?.toString() ?? '');
  const cur = currency ?? (rate.data.currency ?? '');

  async function save(clear: boolean) {
    setSaving(true);
    setNote('');
    try {
      await api.setUsageRate(org.id, {
        perAcceleratorHour: clear ? null : Number(value),
        currency: clear ? undefined : cur,
      });
      setAmount(null);
      setCurrency(null);
      setNote(clear ? 'Rate cleared. No cost will be shown.' : 'Rate saved.');
      reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" data-testid="usage-rate">
      <h3>Your own rate</h3>
      <p className="muted">
        What an accelerator-hour is worth to you. Nodeau multiplies your number
        by what it measured and shows nothing at all until you enter one — it has
        no idea what your power, your hardware or your time costs.
      </p>
      <div className="row">
        <label>
          Per accelerator-hour
          <input
            type="number"
            step="0.0001"
            min="0"
            value={value}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Currency
          <input
            type="text"
            maxLength={3}
            placeholder="USD"
            value={cur}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
        <button type="button" disabled={saving || !value || !cur} onClick={() => save(false)}>
          Save
        </button>
        <button
          type="button"
          className="ghost"
          disabled={saving || rate.data.perAcceleratorHour === null}
          onClick={() => save(true)}
        >
          Clear
        </button>
      </div>
      {note && <p role="status">{note}</p>}
    </section>
  );
}

function AuditSection({ org }: { org: Organization }) {
  const [onlyRefusals, setOnlyRefusals] = useState(false);
  const [page, reload] = useResource<AuditPage>(
    (signal) =>
      api.auditEvents(org.id, { result: onlyRefusals ? 'refused' : undefined, limit: 50 }, signal),
    [org.id, onlyRefusals],
  );

  return (
    <section className="panel" data-testid="audit">
      <h2>What changed</h2>
      {page.status === 'ready' && (
        <p className="muted">
          Who changed what, and whether it happened. Kept for{' '}
          {page.data.retentionDays} days.
        </p>
      )}
      <label className="row">
        <input
          type="checkbox"
          checked={onlyRefusals}
          onChange={(e) => setOnlyRefusals(e.target.checked)}
        />
        Only things that were refused
      </label>

      {page.status === 'loading' && <Spinner label="Reading the audit trail" />}
      {page.status === 'error' && <ErrorNotice error={page.error} onRetry={reload} />}
      {page.status === 'ready' &&
        (page.data.events.length === 0 ? (
          <Empty
            title={onlyRefusals ? 'Nothing was refused' : 'Nothing recorded yet'}
          >
            {onlyRefusals
              ? 'No change was refused in what is kept.'
              : 'Changes to this organisation and its fleets will appear here.'}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="table" data-testid="audit-events">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">What</th>
                  <th scope="col">Result</th>
                  <th scope="col">Subject</th>
                </tr>
              </thead>
              <tbody>
                {page.data.events.map((e, i) => (
                  <tr key={`${e.occurredAt}-${e.type}-${i}`}>
                    <td title={e.occurredAt}>{relativeTime(e.occurredAt)}</td>
                    <td>{e.type}</td>
                    <td>
                      {/* THREE STATES, NOT TWO. An event with no result predates
                          the column, and rendering that as success would invent
                          a fact about every record before 2026-09-13. */}
                      {e.result === 'refused' ? (
                        <strong data-testid="audit-refused">refused</strong>
                      ) : e.result === 'applied' ? (
                        'applied'
                      ) : (
                        <span className="muted" title="This event predates the result column">
                          not recorded
                        </span>
                      )}
                    </td>
                    <td className="mono">
                      {e.target ? (
                        <span title={e.target}>{e.target.slice(0, 12)}…</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
