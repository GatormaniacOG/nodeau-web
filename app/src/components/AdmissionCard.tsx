import type {
  AdmissionCandidate,
  AdmissionExplanation,
  AdmissionPreview,
  AdmissionProvenance,
  AdmissionTerm,
} from '../lib/api';
import { Badge } from './ui';

/**
 * The admission card — Phase 20I.
 *
 * # It renders, and computes nothing
 *
 * Every figure here was computed on the customer's machine by admission itself
 * (pkg/admissionview) and arrives as the fleet's answer to a preview. The card
 * formats MiB as GiB to one decimal and adds nothing: no sum, no reserve, no
 * headroom, no fit. A second implementation of "how much room is there" in a
 * browser would drift from the one that decides, and the first symptom would
 * be a card that said a model fits on a machine that then refused it.
 *
 * # Never colour alone
 *
 * Fits / held back / will not fit is said in words and with a symbol, so the
 * card reads the same in greyscale, to a screen reader and at 360 px.
 */

export function gib(mib: number): string {
  const v = mib / 1024;
  return `${v.toFixed(1)} GiB`;
}

function provenanceBadge(p: AdmissionProvenance): { tone: 'ok' | 'warn' | 'neutral'; label: string } {
  switch (p) {
    case 'measured':
      return { tone: 'ok', label: 'Measured' };
    case 'calibrated':
      return { tone: 'ok', label: 'Calibrated' };
    case 'estimated':
      return { tone: 'warn', label: 'Estimated' };
    case 'default':
      return { tone: 'neutral', label: 'Default reserve' };
    case 'override':
      return { tone: 'warn', label: 'This run only' };
    case 'policy-reserve':
      return { tone: 'neutral', label: 'Nodeau policy' };
    case 'observed-current':
      return { tone: 'neutral', label: 'Observed now' };
  }
  return { tone: 'neutral', label: p };
}

function memoryWord(e: AdmissionExplanation): string {
  return e.machine.memoryKind === 'unified-memory' ? 'unified memory' : 'GPU memory';
}

function confidenceWords(c: string): string {
  switch (c) {
    case 'high':
      return 'Measured on this machine';
    case 'medium':
      return 'Measured on the same kind of hardware';
    case 'conservative-estimate':
      return 'Estimated, with extra margin';
    default:
      return 'Not predicted';
  }
}

/** The verdict, in words and a symbol. */
export function Verdict({ e }: { e: AdmissionExplanation }) {
  switch (e.constraint) {
    case 'none':
      return (
        <p className="verdict verdict-ok" role="status">
          <span aria-hidden="true">✓ </span>Fits
        </p>
      );
    case 'soft':
      return (
        <p className="verdict verdict-soft" role="status">
          <span aria-hidden="true">◐ </span>Held back by Nodeau's safety reserve, not by the hardware
        </p>
      );
    default:
      return (
        <p className="verdict verdict-hard" role="status">
          <span aria-hidden="true">✕ </span>
          {e.retryable ? 'Not right now' : 'Will not fit as asked'}
        </p>
      );
  }
}

function TermRows({ terms, sign }: { terms?: AdmissionTerm[]; sign?: string }) {
  return (
    <>
      {(terms ?? []).map((t) => {
        const b = provenanceBadge(t.provenance);
        return (
          <tr key={t.key} className={t.informational ? 'term-info' : undefined}>
            <th scope="row">
              {t.informational ? '' : (sign ?? '')}
              {t.label}
              {t.note && <span className="term-note">{t.note}</span>}
            </th>
            <td className="num">{gib(t.mib)}</td>
            <td>
              <Badge tone={b.tone}>{b.label}</Badge>
              {t.informational && <span className="visually-hidden"> (for context, not subtracted)</span>}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** The arithmetic, term by term, behind a disclosure. */
export function Arithmetic({ e }: { e: AdmissionExplanation }) {
  const m = e.memory;
  if (!m) return null;
  const reserveBadge =
    m.reserve.source === 'calibrated' ? provenanceBadge('calibrated') : provenanceBadge('default');
  return (
    <details className="arithmetic">
      <summary>Show the arithmetic</summary>
      <table className="table admission-terms">
        <caption className="visually-hidden">How Nodeau worked out the fit on {e.machine.name}</caption>
        <tbody>
          <TermRows terms={m.capacity} />
          <TermRows terms={m.inUse} sign="− " />
          <tr>
            <th scope="row">
              − Reserve Nodeau keeps for the system
              <span className="term-note">
                {gib(m.reserve.hardFloorMiB)} of it is a floor that is never given away
                {m.reserve.softMiB > 0 && `; ${gib(m.reserve.softMiB)} is Nodeau's own margin`}
              </span>
            </th>
            <td className="num">{gib(m.reserve.totalMiB)}</td>
            <td>
              <Badge tone={reserveBadge.tone}>{reserveBadge.label}</Badge>
            </td>
          </tr>
          <tr className="term-total">
            <th scope="row">Available to Nodeau now</th>
            <td className="num">{gib(m.availableMiB)}</td>
            <td />
          </tr>
          <TermRows terms={m.demand} />
          <tr className="term-total">
            <th scope="row">Expected cost</th>
            <td className="num">{gib(m.requiredMiB)}</td>
            <td />
          </tr>
          {(m.waivedMiB ?? 0) > 0 && (
            <tr>
              <th scope="row">Accepted for this run only</th>
              <td className="num">{gib(m.waivedMiB!)}</td>
              <td>
                <Badge tone="warn">This run only</Badge>
              </td>
            </tr>
          )}
          <tr className="term-total">
            <th scope="row">{m.headroomMiB < 0 ? 'Short by' : 'Remaining headroom'}</th>
            <td className="num">{gib(Math.abs(m.headroomMiB))}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </details>
  );
}

/** One machine's answer: where, what it costs, what is kept back, what is left. */
export function ExplanationBody({ e, why }: { e: AdmissionExplanation; why?: string }) {
  const m = e.memory;
  return (
    <>
      <Verdict e={e} />
      {why ? <p className="muted">{why}</p> : e.message && <p className="muted">{e.message}</p>}
      {m && (
        <dl className="facts admission-facts">
          <dt>Expected cost</dt>
          <dd>
            {gib(m.requiredMiB)} <span className="muted small">{confidenceWords(e.confidence)}</span>
          </dd>
          <dt>Available to Nodeau now</dt>
          <dd>
            {gib(m.availableMiB)} of {memoryWord(e)}
          </dd>
          <dt>Reserve for the system</dt>
          <dd>
            {gib(m.reserve.totalMiB)}{' '}
            {m.reserve.source === 'calibrated' ? (
              <Badge tone="ok">Calibrated</Badge>
            ) : (
              <Badge tone="neutral">Default reserve</Badge>
            )}
            {m.reserve.source === 'calibrated' && m.reserve.calibration?.measuredAt && (
              <span className="muted small"> measured {m.reserve.calibration.measuredAt.slice(0, 10)}</span>
            )}
          </dd>
          <dt>{m.headroomMiB < 0 ? 'Short by' : 'Left over'}</dt>
          <dd>{gib(Math.abs(m.headroomMiB))}</dd>
        </dl>
      )}
      {m?.reserve.note && <p className="notice notice-warn small">{m.reserve.note}</p>}
      <Arithmetic e={e} />
      {(e.notes ?? []).map((n) => (
        <p key={n} className="muted small">
          {n}
        </p>
      ))}
    </>
  );
}

/** The other machines, each with its own short reason. */
function OtherMachines({ candidates }: { candidates: AdmissionCandidate[] }) {
  if (candidates.length === 0) return null;
  return (
    <details className="other-machines">
      <summary>Other machines ({candidates.length})</summary>
      <ul>
        {candidates.map((c) => (
          <li key={c.machine + (c.explanation.machine.acceleratorId ?? '')}>
            <strong>{c.machine}</strong>
            {c.explanation.machine.accelerator && (
              <span className="muted"> · {c.explanation.machine.accelerator}</span>
            )}
            <span className="other-verdict">
              {c.eligible
                ? ' — would also fit'
                : c.explanation.constraint === 'soft'
                  ? ' — held back by the safety reserve'
                  : ' — not eligible'}
            </span>
            {c.summary && <span className="muted small"> ({c.summary})</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * AdmissionCard shows a whole preview: the machine Nodeau would choose (or the
 * representative refusal), and every other machine's reason.
 */
export function AdmissionCard({
  preview,
  onOverride,
}: {
  preview: AdmissionPreview;
  /** Offered only for a candidate whose constraint is SOFT. */
  onOverride?: (c: AdmissionCandidate) => void;
}) {
  const candidates = preview.candidates ?? [];
  const selected = candidates.find((c) => c.selected);
  const shown = selected ?? candidates[0];
  const others = candidates.filter((c) => c !== shown);
  const soft = candidates.filter((c) => c.explanation.constraint === 'soft' && c.explanation.override?.available);

  if (!shown) {
    return (
      <section className="panel admission-card" aria-label="Where this would run">
        <p>{preview.message ?? 'No machine in this fleet answered.'}</p>
      </section>
    );
  }
  const e = shown.explanation;
  return (
    <section className="panel admission-card" aria-labelledby="admission-where">
      <p id="admission-where" className="admission-where">
        <span className="admission-where-label">{selected ? 'Will run on' : 'Closest candidate'}</span>{' '}
        <strong>{shown.machine}</strong>
        {e.machine.accelerator && <span> · {e.machine.accelerator}</span>}
        {e.machine.memoryKind && <span className="muted"> · {memoryWord(e)}</span>}
      </p>
      <ExplanationBody e={e} why={selected ? preview.why : undefined} />

      {!selected &&
        soft.map((c) => {
          const o = c.explanation.override!;
          return (
            <div key={c.machine} className="notice notice-warn override-offer">
              <p>
                <strong>{c.machine}</strong> has the memory if Nodeau keeps less in reserve for this one run: its
                reserve would go from {gib(o.reserveMiB)} to {gib(o.reserveWithOverrideMiB)} (the{' '}
                {gib(o.hardFloorMiB)} floor stays), leaving {gib(o.headroomWithOverrideMiB)}.
              </p>
              {onOverride && (
                <button type="button" className="btn btn-sm" onClick={() => onOverride(c)}>
                  Run on {c.machine} with a reduced safety reserve…
                </button>
              )}
            </div>
          );
        })}

      {!selected && soft.length === 0 && (
        <p className="notice small">
          No machine in this fleet can run it as asked, and Nodeau's safety reserve is not what stops it, so
          there is nothing to override: the hardware does not have enough safely usable memory, or the reason
          below is not about memory. A smaller context, fewer parallel requests or a smaller model may fit.
        </p>
      )}

      <OtherMachines candidates={others} />
      <p className="muted small">
        Answered {preview.decidedAt.slice(11, 16)} UTC. This is a preview, not a reservation: Nodeau checks
        again when it starts the model.
      </p>
    </section>
  );
}
