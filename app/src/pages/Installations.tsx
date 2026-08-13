import { useState } from 'react';
import { api, ApiError, type Installation, type Organization } from '../lib/api';
import { Badge, Empty, ErrorNotice, Spinner, formatDate, relativeTime } from '../components/ui';
import { hrefFor } from '../lib/router';
import { useResource } from '../lib/useResource';

/**
 * The installation list and its detail view.
 *
 * # What is deliberately NOT here
 *
 * No live GPU chart, no "start a model" button, no remote console. Phase 7C
 * brief §37: the hosted UI must not contain controls for things it cannot do.
 * There is no outbound channel from a customer's installation to Nodeau Cloud
 * yet (ADR-P7-005 §10), so anything resembling remote control would be a button
 * that lies — and a fake live dashboard is explicitly forbidden by §5.4.
 *
 * What IS shown is exactly what the installation reported when it last
 * refreshed its entitlement, presented as the historical fact it is: a
 * "last seen" time rather than an online indicator.
 */

export function InstallationsPage({
  org,
  navigate,
}: {
  org: Organization;
  navigate: (to: string) => void;
}) {
  const [state, reload] = useResource(
    (signal) => api.installations(org.id, signal).then((r) => r.installations ?? []),
    [org.id],
  );

  if (state.status === 'loading') return <Spinner label="Loading installations…" />;
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={reload} />;
  const items = state.data;

  return (
    <section>
      <header className="page-head">
        <h1>Installations</h1>
        <p className="muted">
          Machines running Nodeau that are linked to {org.name}.
        </p>
      </header>

      {items.length === 0 ? (
        <Empty title="No installations yet">
          <p>
            Run <code>nodeau login</code> on a machine that has Nodeau installed. It will show
            you a short code to approve here.
          </p>
          <p>
            <a className="btn btn-primary btn-sm" href={hrefFor.activate()}>
              I have a code
            </a>
          </p>
        </Empty>
      ) : (
        <ul className="card-list">
          {items.map((i) => (
            <li key={i.id}>
              <a
                className="card card-link"
                href={hrefFor.installation(i.id)}
                onClick={(e) => {
                  // Left-click navigates in-app; modified clicks keep their
                  // native behaviour so "open in new tab" still works.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigate(hrefFor.installation(i.id));
                }}
              >
                <div className="card-main">
                  <h3>{i.name}</h3>
                  <p className="muted small">
                    {i.nodeauVersion ? `Nodeau ${i.nodeauVersion}` : 'Version not reported'} ·{' '}
                    {i.nodeCount === 1 ? '1 machine' : `${i.nodeCount} machines`} ·{' '}
                    {i.gpuCount === 1 ? '1 GPU' : `${i.gpuCount} GPUs`}
                  </p>
                </div>
                <div className="card-aside">
                  <InstallationBadge installation={i} />
                  <span className="muted small">last seen {relativeTime(i.lastSeenAt)}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * InstallationBadge distinguishes three states that look alike and are not.
 *
 * "Approved in a browser but the CLI never collected its credential" is a real
 * state — it produces an installation that exists and can do nothing — and
 * showing it as active would be a lie the operator only discovers when a
 * refresh never arrives.
 */
function InstallationBadge({ installation }: { installation: Installation }) {
  if (!installation.active) return <Badge tone="neutral">Removed</Badge>;
  if (!installation.activated) return <Badge tone="warn">Awaiting activation</Badge>;
  return <Badge tone="ok">Active</Badge>;
}

export function InstallationDetailPage({
  org,
  id,
  navigate,
}: {
  org: Organization;
  id: string;
  navigate: (to: string) => void;
}) {
  const [state, reload] = useResource(
    (signal) => api.installation(org.id, id, signal),
    [org.id, id],
  );
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);

  if (state.status === 'loading') return <Spinner label="Loading installation…" />;
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={reload} />;

  const i = state.data;

  const remove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      await api.deactivateInstallation(org.id, i.id);
      navigate(hrefFor.installations());
    } catch (error) {
      setRemoveError(error);
      setRemoving(false);
    }
  };

  return (
    <section>
      <header className="page-head">
        <a className="back" href={hrefFor.installations()}
           onClick={(e) => { e.preventDefault(); navigate(hrefFor.installations()); }}>
          ← Installations
        </a>
        <h1>{i.name}</h1>
        <p><InstallationBadge installation={i} /></p>
      </header>

      <dl className="detail">
        <dt>Installation ID</dt>
        <dd className="mono">{i.id}</dd>

        <dt>Nodeau version</dt>
        <dd>{i.nodeauVersion || 'not reported'}</dd>

        <dt>Machines</dt>
        <dd>{i.nodeCount}</dd>

        <dt>GPUs</dt>
        <dd>{i.gpuCount}</dd>

        <dt>Activated</dt>
        <dd>{formatDate(i.createdAt)}</dd>

        <dt>Last seen</dt>
        <dd>{relativeTime(i.lastSeenAt)}</dd>

        <dt>Entitlement</dt>
        <dd>
          {i.entitlementPlanId
            ? `${i.entitlementPlanId}, current until ${formatDate(i.entitlementNotAfter)}`
            : 'none issued yet'}
        </dd>
      </dl>

      <p className="muted small">
        These are the values this installation reported the last time it refreshed its
        entitlement. Nodeau Cloud does not connect to your machines, so this is a record of
        what was reported rather than a live view.
      </p>

      {i.active && (
        <div className="danger-zone">
          <h2>Remove this installation</h2>
          <p className="muted">
            Its credential stops working immediately and it will no longer receive
            entitlements. <strong>Nothing running on the machine stops</strong> — it falls
            back to the free Home plan and keeps serving.
          </p>
          {removeError ? <ErrorNotice error={removeError} /> : null}
          {confirming ? (
            <div className="btn-row">
              <button className="btn btn-danger btn-sm" onClick={remove} disabled={removing}>
                {removing ? 'Removing…' : `Yes, remove ${i.name}`}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
                disabled={removing}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
              Remove installation
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** notFound tells the two 404 shapes apart, which have different remedies. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NOT_FOUND';
}
