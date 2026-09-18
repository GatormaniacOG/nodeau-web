import type { ReactNode } from 'react';

/**
 * The visual vocabulary: capacity bars, readings and status pills.
 *
 * # Every number drawn here was reported by a machine
 *
 * This file draws values; it never derives one. The fleet API carries what each
 * machine said about itself, and a chart is a second place for a product to be
 * wrong — a bar whose segments are computed from a ratio somebody liked the
 * look of says something the scheduler never said. So each component takes the
 * figures it renders and renders exactly those.
 *
 * # ABSENT IS NOT ZERO, and the drawing has to say which
 *
 * Every live figure in `FleetGPUView` is optional, and absent means UNOBSERVED
 * — an idle card at 0 % and a card whose driver did not answer are different
 * facts (issue #104). A bar drawn at zero width states the first about both.
 * `CapacityBar` therefore has an explicit unreported state, and `Reading`
 * renders "not reported" rather than a dash that could be read as nothing.
 *
 * # Why the segment list is data and not three props
 *
 * Today a card's memory divides into what is in use and what is free, because
 * that is what a machine reports: one used figure covering every process on the
 * card, Nodeau's and anybody else's. The split a capacity bar WANTS — what
 * Nodeau reserved, what something else took, the safety margin, the spare — is
 * real on the machine and is not in `GPUObservation`. When it is reported it
 * becomes another entry in this array and no layout changes. A component with
 * `used`/`margin`/`free` props would have had to be rewritten, and in the
 * meantime would have invited somebody to pass a number nobody measured.
 */

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

/** The tones a segment may take. Colour is a SIGNAL here, never decoration:
 *  accent marks what Nodeau itself is responsible for, neutral marks what it
 *  merely observes, and free is the absence of both. */
export type CapacityTone = 'accent' | 'neutral' | 'warn' | 'danger' | 'free';

export interface CapacitySegment {
  key: string;
  /** What this segment is, in the product's words. Read aloud by the legend. */
  label: string;
  /** The measured quantity, in the bar's own unit. */
  value: number;
  tone: CapacityTone;
  /** One short line of explanation, shown under the legend entry. */
  hint?: string;
}

export interface CapacityBarProps {
  /** The whole the segments are part of. Undefined means the machine did not
   *  report a capacity, which is a different picture from a capacity of zero. */
  total?: number;
  segments: CapacitySegment[];
  /** Rendered after every figure — "MiB", "W". */
  unit: string;
  /** Replaces the whole component when the reading is unavailable, so a
   *  caller never has to decide how to draw a bar it has no numbers for. */
  unreportedLabel?: string;
  /** A short line above the bar. */
  caption?: ReactNode;
  /** Adds the remainder as a "free" segment. Off for a bar whose segments are
   *  already the whole. */
  showRemainder?: boolean;
  /** The word for the remainder. */
  remainderLabel?: string;
  compact?: boolean;
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * CapacityBar draws a whole and the parts of it that are spoken for.
 *
 * It is the one bar in this application: a machine's memory, a card's memory,
 * and anything later measured against a ceiling all read the same way, which is
 * what makes the second one free to understand.
 */
export function CapacityBar({
  total,
  segments,
  unit,
  unreportedLabel = 'not reported',
  caption,
  showRemainder = true,
  remainderLabel = 'free',
  compact = false,
}: CapacityBarProps) {
  const usable = typeof total === 'number' && Number.isFinite(total) && total > 0;

  if (!usable) {
    return (
      <div className="capacity capacity-unreported">
        {caption && <div className="capacity-caption">{caption}</div>}
        <p className="capacity-empty">{unreportedLabel}</p>
      </div>
    );
  }

  const drawn = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const spoken = drawn.reduce((sum, s) => sum + s.value, 0);
  // Clamped at zero: a card reporting more in use than it has total is a
  // reading to show as full, not a negative remainder to draw backwards.
  const remainder = Math.max(0, total - spoken);

  const all: CapacitySegment[] =
    showRemainder && remainder > 0
      ? [...drawn, { key: '__free', label: remainderLabel, value: remainder, tone: 'free' }]
      : drawn;

  return (
    <div className={`capacity${compact ? ' capacity-compact' : ''}`}>
      {caption && <div className="capacity-caption">{caption}</div>}

      {/* The bar itself is decorative: every figure in it is in the legend
          below as text, so a screen reader is never asked to read a width. */}
      <div className="capacity-track" aria-hidden="true">
        {all.map((s) => (
          <span
            key={s.key}
            className={`capacity-seg capacity-${s.tone}`}
            style={{ width: `${Math.min(100, (s.value / total) * 100)}%` }}
          />
        ))}
      </div>

      <ul className="capacity-legend">
        {all.map((s) => (
          <li key={s.key} className="capacity-item">
            <span className={`capacity-dot capacity-${s.tone}`} aria-hidden="true" />
            <span className="capacity-label">{s.label}</span>
            <span className="capacity-value">
              {formatNumber(s.value)} {unit}
            </span>
            {s.hint && <span className="capacity-hint">{s.hint}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/**
 * Reading is one live figure, with the unobserved case built in.
 *
 * The whole point is the `undefined` branch. Every caller that wrote
 * `{g.temperatureC ?? 0} °C` would have been confidently wrong about a card
 * whose driver did not answer, and every caller that wrote
 * `{g.temperatureC && ...}` would silently drop an honest zero.
 */
export function Reading({
  label,
  value,
  unit,
  of,
  unreported = 'not reported',
}: {
  label: string;
  value?: number;
  unit?: string;
  /** A ceiling this value is measured against — "62 W of 180 W". */
  of?: number;
  unreported?: string;
}) {
  const known = typeof value === 'number' && Number.isFinite(value);
  return (
    <div className={`reading${known ? '' : ' reading-unknown'}`}>
      <span className="reading-label">{label}</span>
      <span className="reading-value">
        {known ? (
          <>
            {formatNumber(value)}
            {unit ? <span className="reading-unit">{unit}</span> : null}
            {typeof of === 'number' && Number.isFinite(of) ? (
              <span className="reading-of">
                {' of '}
                {formatNumber(of)}
                {unit ?? ''}
              </span>
            ) : null}
          </>
        ) : (
          unreported
        )}
      </span>
    </div>
  );
}

/** A row of readings that wraps rather than overflowing a phone. */
export function ReadingRow({ children }: { children: ReactNode }) {
  return <div className="reading-row">{children}</div>;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';

/**
 * StatusPill is a state, stated.
 *
 * Distinct from Badge, which is a small label of any kind. A pill answers "what
 * is this thing doing", carries an optional dot, and is sized so that a row of
 * them lines up. `title` is for the sentence behind the word — never for
 * anything a reader needs, because a tooltip is not reachable on a phone.
 */
export function StatusPill({
  tone = 'neutral',
  dot = true,
  title,
  children,
}: {
  tone?: StatusTone;
  dot?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={`pill pill-${tone}`} title={title}>
      {dot && <span className="pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
