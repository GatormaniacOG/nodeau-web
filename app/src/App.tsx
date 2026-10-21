import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  FEATURE_TEAMS,
  includes,
  NetworkError,
  signInURL,
  type Me,
  type Organization,
} from './lib/api';
import { hrefFor, useRoute, type Route } from './lib/router';
import { ErrorNotice, Spinner } from './components/ui';
import { InstallationDetailPage, InstallationsPage } from './pages/Installations';
import { ActivatePage } from './pages/Activate';
import { PlanPage } from './pages/Plan';
import { BillingPage } from './pages/Billing';
import { DashboardPage } from './pages/Dashboard';
import { SettingsPage } from './pages/Settings';
import { OrganizationPage } from './pages/Organization';
import { SignInPage } from './pages/SignIn';
import { InvitePage } from './pages/Invite';
import { FleetMachinePage, FleetPage } from './pages/Fleet';
import { FleetWorkloadsPage } from './pages/FleetWorkloads';
import { FleetRunPage } from './pages/FleetRun';
import { GovernancePage } from './pages/Governance';
import { FleetUpgradePage } from './pages/FleetUpgrade';
import { UsagePage } from './pages/Usage';

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
    // An invitation's holder may read it before they have an account.
    return (
      <Shell>
        {route.name === 'invite' ? <InvitePage signedIn={false} /> : <SignInPage route={route} />}
      </Shell>
    );
  }

  const { me } = session;
  const org = chooseOrganization(me);

  // An invitation is accepted by a PERSON, whatever organisations they are in
  // yet — including none.
  if (route.name === 'invite') {
    return (
      <Shell me={me} org={org} navigate={navigate} route={route} onSwitch={reload}>
        <InvitePage
          signedIn
          email={me.user.email}
          navigate={navigate}
          onJoined={(joined) => {
            rememberOrganization(joined.id);
            reload();
          }}
        />
      </Shell>
    );
  }

  if (!org) {
    return (
      <Shell me={me} navigate={navigate}>
        <ErrorNotice
          error={
            new ApiError(500, {
              code: 'INTERNAL_ERROR',
              message:
                'Your account has no workspace. That should not be possible, because every account ' +
                'gets a personal one at signup. Please get in touch.',
            })
          }
        />
      </Shell>
    );
  }

  return (
    <Shell me={me} org={org} navigate={navigate} route={route} onSwitch={reload}>
      <Page route={route} me={me} org={org} navigate={navigate} reload={reload} />
    </Shell>
  );
}

/**
 * chooseOrganization is which organisation the console is looking at.
 *
 * Phase 21: a person may belong to several. The choice is remembered in THIS
 * browser only, as a convenience — it is never authority: every request names
 * the organisation in its path and the server judges the person's membership
 * there, so a stale or edited choice can show nothing it would not show anyway.
 * A remembered organisation the person is no longer in is simply not found, and
 * the personal one is shown instead.
 */
const SELECTED_ORG = 'nodeau.organization';

function chooseOrganization(me: Me): Organization | undefined {
  let remembered: string | null = null;
  try {
    remembered = window.localStorage.getItem(SELECTED_ORG);
  } catch {
    remembered = null;
  }
  return (
    me.organizations.find((o) => o.id === remembered) ??
    me.organizations.find((o) => o.kind === 'personal') ??
    me.organizations[0]
  );
}

function rememberOrganization(id: string) {
  try {
    window.localStorage.setItem(SELECTED_ORG, id);
  } catch {
    /* a convenience only */
  }
}

function Page({
  route,
  me,
  org,
  navigate,
  reload,
}: {
  route: Route;
  me: Me;
  org: Organization;
  navigate: (to: string) => void;
  reload: () => void;
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
    case 'organization':
      return (
        <OrganizationPage me={me} org={org} section={route.section} navigate={navigate} onChanged={reload} />
      );
    case 'invite':
      return (
        <InvitePage
          signedIn
          email={me.user.email}
          navigate={navigate}
          onJoined={(joined) => {
            rememberOrganization(joined.id);
            reload();
          }}
        />
      );
    case 'billing':
      return <BillingPage org={org} complete={route.complete} navigate={navigate} />;
    case 'fleet':
      return <FleetPage org={org} navigate={navigate} />;
    case 'fleetMachine':
      return <FleetMachinePage org={org} id={route.id} navigate={navigate} />;
    case 'fleetWorkloads':
      return <FleetWorkloadsPage org={org} navigate={navigate} />;
    case 'fleetRun':
      return <FleetRunPage org={org} navigate={navigate} />;
    case 'fleetGovernance':
      return <GovernancePage org={org} />;
    case 'fleetUpgrade':
      return <FleetUpgradePage org={org} />;
    case 'usage':
      return <UsagePage org={org} />;
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
  onSwitch,
}: {
  children: React.ReactNode;
  me?: Me;
  org?: Organization;
  navigate?: (to: string) => void;
  route?: Route;
  onSwitch?: () => void;
}) {
  const go = (to: string) => (e: React.MouseEvent) => {
    if (!navigate) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(to);
  };

  // On a phone the destinations scroll sideways, and the current one can sit
  // off-screen — which reads as "none of these is where I am". Bring it into
  // view whenever the page changes.
  const nav = useRef<HTMLElement>(null);
  const current = route?.name;
  useEffect(() => {
    const here = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    here?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
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
            <nav className="app-nav" aria-label="Account" ref={nav}>
              <a
                href={hrefFor.dashboard()}
                onClick={go(hrefFor.dashboard())}
                aria-current={route?.name === 'dashboard' ? 'page' : undefined}
              >
                Overview
              </a>
              {/* Fleet BESIDE Installations, not instead of it (OD-4). An
                  organisation may own several installations, which are separate
                  fleets that cannot schedule against each other — merging them
                  into one list would imply capacity that does not exist. */}
              <a
                href={hrefFor.fleet()}
                onClick={go(hrefFor.fleet())}
                aria-current={
                  route?.name === 'fleet' || route?.name === 'fleetMachine' || route?.name === 'fleetUpgrade'
                    ? 'page'
                    : undefined
                }
              >
                Fleet
              </a>
              <a
                href={hrefFor.fleetWorkloads()}
                onClick={go(hrefFor.fleetWorkloads())}
                aria-current={
                  route?.name === 'fleetWorkloads' || route?.name === 'fleetRun'
                    ? 'page'
                    : undefined
                }
              >
                Workloads
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
              {/* Governance — Phase 17C. Shown to everybody, because READING a
                  policy is `fleet.view`: somebody refused by a quota has to be
                  able to see the number that refused them. Whether the page
                  offers to CHANGE it comes from the server's own answer. */}
              <a
                href={hrefFor.fleetGovernance()}
                onClick={go(hrefFor.fleetGovernance())}
                aria-current={route?.name === 'fleetGovernance' ? 'page' : undefined}
              >
                Governance
              </a>
              {/* Usage and audit — Phase 17D. Shown to everybody for the same
                  reason governance is: reading is `fleet.view`, and somebody
                  who can see the fleet can see what it did and what changed.
                  It is not a billing surface and is deliberately not near one. */}
              <a
                href={hrefFor.usage()}
                onClick={go(hrefFor.usage())}
                aria-current={route?.name === 'usage' ? 'page' : undefined}
              >
                Usage
              </a>
              {/* Organisation — Phase 17B, Phase 21. Shown where there IS an
                  organisation to manage: a team organisation, or a plan that
                  includes several people. Home and Home Pro are one person's
                  Nodeau and are not handed a team ceremony (owner decision Q6);
                  the route still answers them, with a plain sentence about
                  Business, so an old bookmark never meets a 404. What the
                  page OFFERS depends on what the server says the caller may
                  do; what it ALLOWS is decided there, not here. */}
              {org && (org.kind === 'team' || includes(org, FEATURE_TEAMS)) && (
                <a
                  href={hrefFor.organization()}
                  onClick={go(hrefFor.organization())}
                  aria-current={route?.name === 'organization' ? 'page' : undefined}
                >
                  Organisation
                </a>
              )}
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
            <div className="app-user" title={org ? `${me.user.email} · ${org.name}` : me.user.email}>
              {org && me.organizations.length > 1 ? (
                <select
                  className="org-switcher"
                  aria-label="Organisation"
                  value={org.id}
                  onChange={(e) => {
                    rememberOrganization(e.currentTarget.value);
                    onSwitch?.();
                  }}
                >
                  {me.organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                org && <span className="org-name">{org.name}</span>
              )}
              {org && <span aria-hidden="true"> · </span>}
              <span>{me.user.email}</span>
            </div>
          )}
        </div>
      </header>

      <main className="wrap app-main" id="main" tabIndex={-1}>
        {children}
      </main>

      <footer className="app-footer">
        <div className="wrap">
          <span className="muted small">
            Nodeau runs on your own machines. This site manages your account and your installations. It never sees your
            prompts, your documents or your results.
          </span>
        </div>
      </footer>
    </div>
  );
}

export { signInURL };
