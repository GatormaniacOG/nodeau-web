import type { ReactNode } from 'react';
import { ApiError, NetworkError } from '../lib/api';

/**
 * The small set of shared pieces.
 *
 * Deliberately not a component library. Every element here exists because at
 * least two pages need it, and the styling lives in one stylesheet built on the
 * marketing site's design tokens — so the app looks like Nodeau without copying
 * the marketing site's CSS or redesigning it.
 */

export function Spinner({ label }: { label: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Empty is the "nothing here yet" state, and it always says what to do next.
 *
 * An empty list with no explanation is the single most common way a working
 * product looks broken.
 */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/**
 * ErrorNotice renders a backend error, honouring its typed code.
 *
 * # It never invents an explanation
 *
 * The backend's taxonomy already says what happened and the message is written
 * for a person. What this adds is the ACTION, which the frontend is the only
 * layer that can offer — a sign-in link, a retry — plus the request id, so a
 * support conversation starts with something searchable.
 */
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof NetworkError) {
    return (
      <div className="notice notice-error" role="alert">
        <h3>Could not reach Nodeau Cloud</h3>
        <p>
          Your installations are unaffected. Nodeau runs locally: inference, batch jobs and
          the local dashboard do not use this service and keep working whether or not it is
          reachable.
        </p>
        {onRetry && (
          <button className="btn btn-ghost btn-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (error instanceof ApiError) {
    return (
      <div className="notice notice-error" role="alert">
        <h3>{headingFor(error.code)}</h3>
        <p>{error.message}</p>
        {error.code === 'AUTH_REQUIRED' && (
          <p>
            <a className="btn btn-primary btn-sm" href="/signin">
              Sign in
            </a>
          </p>
        )}
        {onRetry && error.code !== 'AUTH_REQUIRED' && (
          <button className="btn btn-ghost btn-sm" onClick={onRetry}>
            Try again
          </button>
        )}
        {error.requestId && <p className="muted mono small">Request {error.requestId}</p>}
      </div>
    );
  }

  return (
    <div className="notice notice-error" role="alert">
      <h3>Something went wrong</h3>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function headingFor(code: string): string {
  switch (code) {
    case 'AUTH_REQUIRED':
      return 'You are not signed in';
    case 'NOT_FOUND':
      return 'Not found';
    case 'FORBIDDEN':
      return 'Not allowed';
    case 'IDENTITY_UNAVAILABLE':
      return 'Signing in is unavailable';
    case 'ACTIVATION_NOT_FOUND':
      return 'That code is not valid';
    case 'ACTIVATION_EXPIRED':
      return 'That code has expired';
    case 'CONFLICT':
      return 'That conflicts with something that already exists';
    default:
      return 'Something went wrong';
  }
}

/** Badge is a small status chip. `tone` follows the marketing site's three
 *  accents: green ships, amber needs attention, slate is neutral. */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'ok' | 'warn' | 'neutral';
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** relativeTime renders a timestamp the way a person reads one. */
export function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

/** formatDate is for absolute dates that are read rather than compared. */
export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
