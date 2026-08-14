import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, NetworkError, signInURL, type Me, type Organization } from './lib/api';
import { hrefFor, useRoute, type Route } from './lib/router';
import { ErrorNotice, Spinner } from './components/ui';
import { InstallationDetailPage, InstallationsPage } from './pages/Installations';
import { ActivatePage } from './pages/Activate';
import { PlanPage } from './pages/Plan';
import { DashboardPage } from './pages/Dashboard';
import { SettingsPage } from './pages/Settings';
import { SignInPage } from './pages/SignIn';

/**
 * The application shell.
 *
 * # One session query, at the root
 *
 * `/v1/me` is fetched once and shared. Every page needs the organisation, and
 * a per-page fetch would mean each one rendering its own loading state for the
 * same answer — plus N requests where one will do.
 *
 * # Being signed out is a state, not an error
 *
 * A 401 from `/v1/me` is the ordinary condition of somebody who has not signed
 * in. It renders the sign-in page rather than an error, because an error screen
 * for "you are not signed in yet" is the sort of thing that makes a product
 * feel broken on first contact.
 */

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; me: Me };

export function App() {
  const [route, navigate] = useRoute();
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  // No synchronous setState here: the initial state is already `loading`, so
  // writing it again at the top of the effect only causes a cascading render.
  // Retrying is an event handler, where setState belongs. Same reasoning as
  // lib/useResource, which the pages use — this one is hand-written because the
  // session has a fourth state (`anonymous`) that a generic resource does not.
  useEffect(() => {
    const controller = new AbortController();
    let live = true;

    api
      .me(controller.signal)
      .then((me) => {
        if (live) setSession({ status: 'ready', me });
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
          // Not an error: this is the ordinary state of somebody who has not
          // signed in yet.
          setSession({ status: 'anonymous' });
          return;
        }
        setSession({ status: 'error', error });
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setSession({ status: 'loading' });
    setReloadToken((n) => n + 1);
  }, []);

  if (session.status === 'loading') {
    return (
      <Shell>
        <Spinner label="Loading your account…" />
      </Shell>
    );
  }

  if (session.status === 'error') {
    // A network failure at the root is worth its own framing: nothing about the
    // customer's own installations is affected by this site being unreachable.
    return (
      <Shell>
        <ErrorNotice error={session.error} onRetry={reload} />
        {session.error instanceof NetworkError && (
          <p className="muted">
            Nodeau runs on your machines, not here. Inference, batch jobs and the local
            dashboard are unaffected.
          </p>
        )}
      </Shell>
    );
  }

  if (session.status === 'anonymous') {
    return (
      <Shell>
        <SignInPage route={route} />
      </Shell>
    );
  }

  const { me } = session;
  // The personal organisation first; Business multi-org selection is Phase 13,
  // and picking the first membership is correct until then.
  const org: Organization | undefined =
    me.organizations.find((o) => o.kind === 'personal') ?? me.organizations[0];

  if (!org) {
    return (
      <Shell me={me} navigate={navigate}>
        <ErrorNotice
          error={
            new ApiError(500, {
              code: 'INTERNAL_ERROR',
              message:
                'Your account has no workspace. That should not be possible — every account ' +
                'gets a personal one at signup. Please get in touch.',
            })
          }
        />
      </Shell>
    );
  }

  return (
    <Shell me={me} org={org} navigate={navigate} route={route}>
      <Page route={route} me={me} org={org} navigate={navigate} />
    </Shell>
  );
}

function Page({
  route,
  me,
  org,
  navigate,
}: {
  route: Route;
  me: Me;
  org: Organization;
  navigate: (to: string) => void;
}) {
  switch (route.name) {
    case 'dashboard':
      return <DashboardPage me={me} org={org} navigate={navigate} />;
    case 'installations':
      return <InstallationsPage org={org} navigate={navigate} />;
    case 'installation':
      return <InstallationDetailPage org={org} id={route.id} navigate={navigate} />;
    case 'activate':
      return (
        <ActivatePage
          organizations={me.organizations}
          initialCode={route.code}
          navigate={navigate}
        />
      );
    case 'plan':
      return <PlanPage org={org} />;
    case 'settings':
      return <SettingsPage me={me} org={org} />;
    case 'signin':
      // Already signed in: the sign-in route is where the API sends a browser
      // after a failed login, so arriving here with a session means it
      // succeeded on a retry. Go where they were trying to get to.
      return <DashboardPage me={me} org={org} navigate={navigate} />;
    default:
      return (
        <section className="narrow">
          <h1>Page not found</h1>
          <p className="muted">
            There is nothing at <code>{route.name === 'notfound' ? route.path : ''}</code>.
          </p>
          <p>
            <a className="btn btn-primary btn-sm" href={hrefFor.dashboard()}>
              Go to your account
            </a>
          </p>
        </section>
      );
  }
}

function Shell({
  children,
  me,
  org,
  navigate,
  route,
}: {
  children: React.ReactNode;
  me?: Me;
  org?: Organization;
  navigate?: (to: string) => void;
  route?: Route;
}) {
  const go = (to: string) => (e: React.MouseEvent) => {
    if (!navigate) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(to);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="wrap">
          <a className="brand" href="https://nodeau.ai/">
            <svg className="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="#b8ff5a" strokeWidth="1.6" />
              <rect x="8" y="8" width="8" height="8" rx="2" fill="#b8ff5a" />
            </svg>
            Nodeau
          </a>

          {me && navigate && (
            <nav className="app-nav" aria-label="Account">
              <a
                href={hrefFor.dashboard()}
                onClick={go(hrefFor.dashboard())}
                aria-current={route?.name === 'dashboard' ? 'page' : undefined}
              >
                Overview
              </a>
              <a
                href={hrefFor.installations()}
                onClick={go(hrefFor.installations())}
                aria-current={
                  route?.name === 'installations' || route?.name === 'installation'
                    ? 'page'
                    : undefined
                }
              >
                Installations
              </a>
              <a
                href={hrefFor.plan()}
                onClick={go(hrefFor.plan())}
                aria-current={route?.name === 'plan' ? 'page' : undefined}
              >
                Plan
              </a>
              <a
                href={hrefFor.settings()}
                onClick={go(hrefFor.settings())}
                aria-current={route?.name === 'settings' ? 'page' : undefined}
              >
                Settings
              </a>
            </nav>
          )}

          {me && (
            <div className="app-user">
              <span className="muted small">{me.user.email}</span>
              {org && <span className="muted small"> · {org.name}</span>}
            </div>
          )}
        </div>
      </header>

      <main className="wrap app-main">{children}</main>

      <footer className="app-footer">
        <div className="wrap">
          <span className="muted small">
            Nodeau runs on your own machines. This site manages your account and your
            installations — it never sees your prompts, your documents or your results.
          </span>
        </div>
      </footer>
    </div>
  );
}

export { signInURL };
