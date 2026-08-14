import { api, type Installation, type Me, type Organization, type Plan } from '../lib/api';
import { Badge, ErrorNotice, Spinner, relativeTime } from '../components/ui';
import { hrefFor } from '../lib/router';
import { useResource } from '../lib/useResource';

/**
 * The overview.
 *
 * # It answers three questions and stops
 *
 * What plan am I on, what machines are linked, and how do I add one. Anything
 * more would be inventing a fleet view: Nodeau Cloud has no connection to a
 * customer's machines (ADR-P7-005 §10), so a dashboard that looked live would
 * be showing the last thing each installation reported and implying it was now.
 */
export function DashboardPage({
  me,
  org,
  navigate,
}: {
  me: Me;
  org: Organization;
  navigate: (to: string) => void;
}) {
  const [state, reload] = useResource<{ plan: Plan; installations: Installation[] }>(
    (signal) =>
      Promise.all([api.plan(org.id, signal), api.installations(org.id, signal)]).then(
        ([plan, list]) => ({ plan, installations: list.installations ?? [] }),
      ),
    [org.id],
  );

  if (state.status === 'loading') return <Spinner label="Loading your account…" />;
  if (state.status === 'error') return <ErrorNotice error={state.error} onRetry={reload} />;

  const { plan, installations } = state.data;
  const active = installations.filter((i) => i.active);

  return (
    <section>
      <header className="page-head">
        <h1>{firstName(me) ? `Hello, ${firstName(me)}` : 'Your account'}</h1>
        <p className="muted">{org.name}</p>
      </header>

      <div className="tiles">
        <a
          className="tile"
          href={hrefFor.plan()}
          onClick={(e) => {
            e.preventDefault();
            navigate(hrefFor.plan());
          }}
        >
          <span className="tile-label">Plan</span>
          <strong className="tile-value">{plan.displayName}</strong>
          <span className="muted small">{plan.summary}</span>
        </a>

        <a
          className="tile"
          href={hrefFor.installations()}
          onClick={(e) => {
            e.preventDefault();
            navigate(hrefFor.installations());
          }}
        >
          <span className="tile-label">Installations</span>
          <strong className="tile-value">{active.length}</strong>
          <span className="muted small">
            {active.length === 1 ? 'machine linked' : 'machines linked'}
          </span>
        </a>

        <a
          className="tile"
          href={hrefFor.activate()}
          onClick={(e) => {
            e.preventDefault();
            navigate(hrefFor.activate());
          }}
        >
          <span className="tile-label">Add a machine</span>
          <strong className="tile-value">Connect</strong>
          <span className="muted small">with a code from `nodeau login`</span>
        </a>
      </div>

      {active.length === 0 ? (
        <div className="panel">
          <h2>Connect your first machine</h2>
          <p className="muted">
            Nodeau works without an account, so there may already be machines running that
            are not listed here. Linking one lets it receive a signed entitlement.
          </p>
          <ol className="steps">
            <li>
              Run <code>nodeau login</code> on the machine.
            </li>
            <li>It shows a short code.</li>
            <li>
              Enter it on the{' '}
              <a
                href={hrefFor.activate()}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(hrefFor.activate());
                }}
              >
                connect page
              </a>
              .
            </li>
          </ol>
        </div>
      ) : (
        <>
          <h2 className="section-head">Recent installations</h2>
          <ul className="card-list">
            {active.slice(0, 5).map((i) => (
              <li key={i.id}>
                <a
                  className="card card-link"
                  href={hrefFor.installation(i.id)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    navigate(hrefFor.installation(i.id));
                  }}
                >
                  <div className="card-main">
                    <h3>{i.name}</h3>
                    <p className="muted small">
                      {i.gpuCount === 1 ? '1 GPU' : `${i.gpuCount} GPUs`} · last seen{' '}
                      {relativeTime(i.lastSeenAt)}
                    </p>
                  </div>
                  <div className="card-aside">
                    {i.activated ? (
                      <Badge tone="ok">Active</Badge>
                    ) : (
                      <Badge tone="warn">Awaiting activation</Badge>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function firstName(me: Me): string {
  const name = me.user.displayName?.trim();
  if (!name) return '';
  return name.split(/\s+/)[0] ?? '';
}
