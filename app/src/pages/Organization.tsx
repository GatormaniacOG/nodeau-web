import { useState } from 'react';
import {
  api,
  ApiError,
  FEATURE_SERVICE_ACCOUNTS,
  FEATURE_SINGLE_SIGN_ON,
  FEATURE_TEAMS,
  includes,
  may,
  type ApiKey,
  type Capability,
  type CreatedInvitation,
  type IdentityStatus,
  type Invitation,
  type Me,
  type Member,
  type MemberList,
  type Organization,
  type RoleDescription,
  type ServiceAccount,
  type Team,
} from '../lib/api';
import { useResource } from '../lib/useResource';
import { Badge, Empty, ErrorNotice, formatDate, relativeTime, Spinner } from '../components/ui';
import { hrefFor, type OrganizationSection } from '../lib/router';

/**
 * The organisation — Phase 17B, made Phase 21's Teams & Identity.
 *
 * # This page hides nothing that matters
 *
 * UI HIDING IS NOT AUTHORIZATION. Every control here is also gated on the
 * server, and the console is refused exactly as a script would be. What the
 * page does with the server's answers — the capabilities `/v1/me` lists for
 * this person in this organisation, the features its plan includes, the roles
 * this person may grant — is stop OFFERING what nobody here can do, which is
 * courtesy and not security.
 *
 * # One person's plan stays one person's
 *
 * Home and Home Pro are one person's Nodeau. They see their own membership and
 * a plain sentence about Business, never a team ceremony, a broken control or a
 * 404 (owner decision Q6: `/organization` stays, and leaves the navigation where
 * it does not apply).
 */

/** The console names `member` OPERATOR: its permission set is exactly an
 *  operator's (D2). The API and the database keep the stored name. */
export function roleLabel(role: string): string {
  switch (role) {
    case 'viewer':
      return 'Viewer';
    case 'member':
      return 'Operator';
    case 'admin':
      return 'Admin';
    case 'owner':
      return 'Owner';
    default:
      return role;
  }
}

const SECTIONS: { id: OrganizationSection; label: string }[] = [
  { id: 'members', label: 'People' },
  { id: 'teams', label: 'Teams' },
  { id: 'service-accounts', label: 'Service accounts' },
  { id: 'sign-in', label: 'Single sign-on' },
  { id: 'settings', label: 'Settings' },
];

export function OrganizationPage({
  me,
  org,
  section,
  navigate,
  onChanged,
}: {
  me: Me;
  org: Organization;
  section: OrganizationSection;
  navigate: (to: string) => void;
  onChanged: () => void;
}) {
  const teams = includes(org, FEATURE_TEAMS);

  return (
    <section>
      <header className="page-head">
        <h1>{org.name}</h1>
        <p className="muted">
          {teams
            ? 'Who is in this organisation, what each person may do, and how they sign in.'
            : 'Your own Nodeau. Everything here belongs to you.'}
        </p>
      </header>

      {!teams && <OnePersonOrganization me={me} org={org} navigate={navigate} onChanged={onChanged} />}

      {teams && (
        <>
          <nav className="tabs" aria-label="Organisation sections">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={hrefFor.organization(id)}
                className={section === id ? 'tab tab-current' : 'tab'}
                aria-current={section === id ? 'page' : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  navigate(hrefFor.organization(id));
                }}
              >
                {label}
              </a>
            ))}
          </nav>
          {section === 'members' && <Members me={me} org={org} />}
          {section === 'teams' && <Teams org={org} />}
          {section === 'service-accounts' && <Credentials org={org} />}
          {section === 'sign-in' && <SingleSignOn org={org} />}
          {section === 'settings' && <Settings org={org} navigate={navigate} onChanged={onChanged} />}
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Home and Home Pro: one person, said plainly                                 */
/* -------------------------------------------------------------------------- */

function OnePersonOrganization({
  me,
  org,
  navigate,
  onChanged,
}: {
  me: Me;
  org: Organization;
  navigate: (to: string) => void;
  onChanged: () => void;
}) {
  return (
    <>
      <div className="panel" data-testid="plan-boundary">
        <h2>Just you</h2>
        <p>
          <strong>{me.user.displayName || me.user.email}</strong> · {roleLabel(org.role)}
        </p>
        <p className="muted">
          Adding other people, roles, service accounts for scripts and single sign-on with your
          company&rsquo;s identity provider are part of Nodeau Business, which we set up with each
          organisation. If that&rsquo;s you,{' '}
          <a href="https://nodeau.ai/contact/" target="_blank" rel="noreferrer">
            get in touch
          </a>
          . Nothing about your machines changes either way.
        </p>
      </div>
      <CreateOrganization navigate={navigate} onChanged={onChanged} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* People: members and invitations                                             */
/* -------------------------------------------------------------------------- */

function Members({ me, org }: { me: Me; org: Organization }) {
  const [resource, reload] = useResource<MemberList>(
    (signal) => api.members(org.id, signal),
    [org.id],
  );
  const canManage = may(org, 'members.manage');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [invitesVersion, setInvitesVersion] = useState(0);

  if (resource.status === 'loading') return <Spinner label="Loading people…" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  const { members, roles, seats } = resource.data;
  const activeOwners = members.filter((m) => m.active && m.role === 'owner').length;

  const act = async (userId: string, work: () => Promise<unknown>) => {
    setBusy(userId);
    setError(null);
    try {
      await work();
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error != null && <ErrorNotice error={error} />}
      {seats && (
        <p className="muted" data-testid="seats">
          {seats.used} {seats.used === 1 ? 'person' : 'people'}
          {seats.pending > 0 && ` · ${seats.pending} invitation${seats.pending === 1 ? '' : 's'} waiting`}
          {seats.limit >= 0 && ` · up to ${seats.limit} on this plan`}
        </p>
      )}

      {canManage && (
        <InviteForm org={org} roles={roles} onInvited={() => setInvitesVersion((n) => n + 1)} />
      )}
      {canManage && <Invitations key={invitesVersion} org={org} />}

      <h2 className="section-title">People</h2>
      <table className="table table-stack" data-testid="members">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Role</th>
            <th scope="col">May</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              roles={roles}
              isSelf={m.userId === me.user.id}
              canManage={canManage}
              lastOwner={m.active && m.role === 'owner' && activeOwners <= 1}
              busy={busy === m.userId}
              onChange={(role) => act(m.userId, () => api.setMemberRole(org.id, m.userId, role))}
              onRemove={() => act(m.userId, () => api.deactivateMember(org.id, m.userId))}
              onRestore={() => act(m.userId, () => api.reactivateMember(org.id, m.userId))}
            />
          ))}
        </tbody>
      </table>
      <p className="muted">
        A role is a set of permissions, not a rank. A team can add to what somebody may do; it never
        takes anything away. Removing somebody ends their access straight away and keeps everything
        they did, attributed to them.
      </p>
    </>
  );
}

function MemberRow({
  member,
  roles,
  isSelf,
  canManage,
  lastOwner,
  busy,
  onChange,
  onRemove,
  onRestore,
}: {
  member: Member;
  roles: RoleDescription[];
  isSelf: boolean;
  canManage: boolean;
  lastOwner: boolean;
  busy: boolean;
  onChange: (role: string) => void;
  onRemove: () => void;
  onRestore: () => void;
}) {
  // The server says which roles this person may grant, and they may act on
  // somebody only if they could grant that somebody's CURRENT role too.
  const grantable = roles.filter((r) => r.grantable);
  const outranked = !grantable.some((r) => r.role === member.role);
  const editable = canManage && !member.fromDirectory && member.active && !outranked;
  const lastOwnerNote = 'The only owner. Make somebody else an owner first.';

  return (
    <tr>
      <td>
        <strong className="person-name">{member.displayName || member.email}</strong>
        {member.displayName && <span className="person-email">{member.email}</span>}
        {isSelf && <span className="muted small"> (you)</span>}
        {member.fromDirectory && (
          <>
            {' '}
            <Badge tone="neutral">from your directory</Badge>
          </>
        )}
        {!member.active && (
          <>
            {' '}
            <Badge tone="warn">no access</Badge>
          </>
        )}
      </td>
      <td data-label="Role">
        {editable && !lastOwner ? (
          <select
            aria-label={`Role for ${member.email}`}
            value={member.role}
            disabled={busy}
            onChange={(e) => onChange(e.currentTarget.value)}
          >
            {grantable.map((r) => (
              <option key={r.role} value={r.role}>
                {roleLabel(r.role)}
              </option>
            ))}
          </select>
        ) : (
          <span title={lastOwner ? lastOwnerNote : undefined}>{roleLabel(member.role)}</span>
        )}
        {lastOwner && canManage && <div className="muted small">{lastOwnerNote}</div>}
        {member.teamRoles && member.teamRoles.length > 0 && (
          <div className="muted">+ {member.teamRoles.map(roleLabel).join(', ')} by team</div>
        )}
      </td>
      <td data-label="May">
        {member.capabilities.length === 0 ? (
          <span className="muted">nothing</span>
        ) : (
          <CapabilityList capabilities={member.capabilities} />
        )}
      </td>
      <td className="actions-cell">
        {editable && !isSelf && !lastOwner && (
          <button type="button" className="link-danger" disabled={busy} onClick={onRemove}>
            Remove access
          </button>
        )}
        {canManage && !member.active && !member.fromDirectory && !outranked && (
          <button type="button" className="link" disabled={busy} onClick={onRestore}>
            Restore access
          </button>
        )}
      </td>
    </tr>
  );
}

function InviteForm({
  org,
  roles,
  onInvited,
}: {
  org: Organization;
  roles: RoleDescription[];
  onInvited: () => void;
}) {
  const grantable = roles.filter((r) => r.grantable);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  if (grantable.length === 0) return null;

  return (
    <div className="panel" data-testid="invite">
      <h2>Invite somebody</h2>
      {error != null && <ErrorNotice error={error} />}
      {created && (
        // THE ONLY PLACE AN INVITATION LINK IS SHOWN. It is not stored beyond
        // this render, not written to the address bar, and the server keeps
        // only a fingerprint of the token inside it.
        <div className="notice notice-strong" role="status" data-testid="invite-link">
          <p>{created.notice}</p>
          <code className="secret">{created.link}</code>
          <p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(created.link).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>{' '}
            <button
              type="button"
              className="link"
              onClick={() => {
                setCreated(null);
                setCopied(false);
              }}
            >
              Done
            </button>
          </p>
        </div>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          api
            .createInvitation(org.id, email.trim(), role)
            .then((c) => {
              setCreated(c);
              setCopied(false);
              setEmail('');
              onInvited();
            })
            .catch((err: unknown) => setError(err))
            .finally(() => setBusy(false));
        }}
      >
        <div className="inline-field">
          <label htmlFor="invite-email">Email address</label>
          <input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            aria-describedby="invite-help"
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
        </div>
        <div className="inline-field">
          <label htmlFor="invite-role">as</label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
            {grantable.map((r) => (
              <option key={r.role} value={r.role}>
                {roleLabel(r.role)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || email.trim() === ''}>
          Create invitation
        </button>
      </form>
      <p id="invite-help" className="muted small">
        You get a link to send yourself. It works once, for that address only, for seven days. The
        person signs in with that address and is in.
      </p>
    </div>
  );
}

function Invitations({ org }: { org: Organization }) {
  const [resource, reload] = useResource<{ invitations: Invitation[] }>(
    (signal) => api.invitations(org.id, signal),
    [org.id],
  );
  const [error, setError] = useState<unknown>(null);
  if (resource.status === 'loading') return <Spinner label="Loading invitations…" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;
  const { invitations } = resource.data;
  if (invitations.length === 0) return null;
  return (
    <>
      <h2 className="section-title">Invitations</h2>
      {error != null && <ErrorNotice error={error} />}
      <table className="table table-stack" data-testid="invitations">
        <thead>
          <tr>
            <th scope="col">Sent to</th>
            <th scope="col">Role</th>
            <th scope="col">State</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((i) => (
            <tr key={i.id}>
              <td>
                {i.email}
                {i.invitedBy && <div className="muted small">by {i.invitedBy}</div>}
              </td>
              <td data-label="Role">{roleLabel(i.role)}</td>
              <td data-label="State">
                <InvitationState invitation={i} />
              </td>
              <td className="actions-cell">
                {i.state === 'pending' && (
                  <button
                    type="button"
                    className="link-danger"
                    onClick={() => {
                      setError(null);
                      api
                        .revokeInvitation(org.id, i.id)
                        .then(reload)
                        .catch((e: unknown) => setError(e));
                    }}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function InvitationState({ invitation: i }: { invitation: Invitation }) {
  switch (i.state) {
    case 'pending':
      return (
        <span>
          <Badge tone="neutral">waiting</Badge>{' '}
          <span className="muted small">until {formatDate(i.expiresAt)}</span>
        </span>
      );
    case 'accepted':
      return (
        <span>
          <Badge tone="ok">accepted</Badge>{' '}
          <span className="muted small">{relativeTime(i.acceptedAt)}</span>
        </span>
      );
    case 'revoked':
      return <Badge tone="warn">cancelled</Badge>;
    default:
      return <Badge tone="warn">expired</Badge>;
  }
}

/* -------------------------------------------------------------------------- */
/* Teams                                                                       */
/* -------------------------------------------------------------------------- */

function Teams({ org }: { org: Organization }) {
  const [resource, reload] = useResource<{ teams: Team[] }>(
    (signal) => api.teams(org.id, signal),
    [org.id],
  );
  const [memberRoles, reloadRoles] = useResource<MemberList>(
    (signal) => api.members(org.id, signal),
    [org.id],
  );
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (resource.status === 'loading' || memberRoles.status === 'loading') {
    return <Spinner label="Loading teams…" />;
  }
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;
  if (memberRoles.status === 'error') {
    return <ErrorNotice error={memberRoles.error} onRetry={reloadRoles} />;
  }

  const canManage = may(org, 'members.manage');
  const grantable = memberRoles.data.roles.filter((r) => r.grantable);
  const { teams } = resource.data;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createTeam(org.id, name, role);
      setName('');
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error != null && <ErrorNotice error={error} />}

      {teams.length === 0 ? (
        <Empty title="No teams yet">
          A team is a group of people who share a role. Everybody in it gets what the team allows, on
          top of whatever their own role already gives them.
        </Empty>
      ) : (
        <table className="table table-stack">
          <thead>
            <tr>
              <th scope="col">Team</th>
              <th scope="col">Confers</th>
              <th scope="col" className="num">
                People
              </th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const mine = grantable.some((r) => r.role === t.role);
              return (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    {t.fromDirectory && (
                      <>
                        {' '}
                        <Badge tone="neutral">from your directory</Badge>
                      </>
                    )}
                    <div className="muted small">created {formatDate(t.createdAt)}</div>
                  </td>
                  <td data-label="Confers">
                    {canManage && mine ? (
                      <select
                        aria-label={`Role ${t.name} confers`}
                        value={t.role}
                        onChange={(e) => {
                          setError(null);
                          api
                            .setTeamRole(org.id, t.id, e.currentTarget.value)
                            .then(reload)
                            .catch((err: unknown) => setError(err));
                        }}
                      >
                        {grantable.map((r) => (
                          <option key={r.role} value={r.role}>
                            {roleLabel(r.role)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>{roleLabel(t.role)}</div>
                    )}
                    <CapabilityList capabilities={t.capabilities} />
                  </td>
                  <td data-label="People" className="num">
                    {t.memberCount}
                  </td>
                  <td className="actions-cell">
                    {t.fromDirectory ? (
                      <span className="muted">managed by your identity provider</span>
                    ) : (
                      canManage &&
                      mine && (
                        <button
                          type="button"
                          className="link-danger"
                          onClick={() => {
                            setError(null);
                            api
                              .deleteTeam(org.id, t.id)
                              .then(reload)
                              .catch((e: unknown) => setError(e));
                          }}
                        >
                          Delete
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canManage && grantable.length > 0 && (
        <form className="inline-form" onSubmit={create}>
          <div className="inline-field">
            <label htmlFor="team-name">New team</label>
            <input
              id="team-name"
              value={name}
              required
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div className="inline-field">
            <label htmlFor="team-role">confers</label>
            <select id="team-role" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
              {grantable.map((r) => (
                <option key={r.role} value={r.role}>
                  {roleLabel(r.role)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy || name.trim() === ''}>
            Create
          </button>
        </form>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Service accounts and keys                                                   */
/* -------------------------------------------------------------------------- */

function Credentials({ org }: { org: Organization }) {
  const included = includes(org, FEATURE_SERVICE_ACCOUNTS);
  const [resource, reload] = useResource<{ accounts: ServiceAccount[]; roles: RoleDescription[] }>(
    (signal) => api.serviceAccounts(org.id, signal),
    [org.id],
  );
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState<unknown>(null);

  if (resource.status === 'loading') return <Spinner label="Loading service accounts…" />;
  if (resource.status === 'error') {
    if (resource.error instanceof ApiError && resource.error.code === 'FORBIDDEN') {
      return <Empty title="Not yours to manage">{resource.error.message}</Empty>;
    }
    return <ErrorNotice error={resource.error} onRetry={reload} />;
  }

  const { accounts, roles } = resource.data;
  const grantable = roles.filter((r) => r.grantable);

  return (
    <>
      {error != null && <ErrorNotice error={error} />}

      {accounts.length === 0 ? (
        <Empty title="No service accounts yet">
          A service account is an identity for a script or a pipeline. It is not a person: it has no
          sign-in, so it carries a role of its own and each of its keys can only narrow that role.
          Every key expires.
        </Empty>
      ) : (
        accounts.map((a) => {
          const mine = grantable.some((r) => r.role === a.role);
          return (
            <article key={a.id} className="panel">
              <header>
                <div className="account-head">
                  <h2>{a.name}</h2>
                  {!a.enabled && <Badge tone="warn">disabled</Badge>}
                </div>
                <p className="muted">
                  {a.description || 'No description.'} · {roleLabel(a.role)}
                </p>
                <CapabilityList capabilities={a.capabilities} />
              </header>
              <p className="account-meta">
                <span>
                  {a.keyCount} live {a.keyCount === 1 ? 'key' : 'keys'}
                </span>
                {mine && (
                  <button type="button" className="link" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    {open === a.id ? 'Hide keys' : 'Manage keys'}
                  </button>
                )}
                {a.enabled && mine && (
                  <button
                    type="button"
                    className="link-danger"
                    onClick={() => {
                      setError(null);
                      api
                        .disableServiceAccount(org.id, a.id)
                        .then(reload)
                        .catch((e: unknown) => setError(e));
                    }}
                  >
                    Disable
                  </button>
                )}
              </p>
              {open === a.id && <Keys org={org} account={a} canMint={included} />}
            </article>
          );
        })
      )}

      {!included && <PlanNote what="Service accounts for your organisation's scripts and pipelines" />}

      {included && grantable.length > 0 && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            api
              .createServiceAccount(org.id, name, '', role)
              .then(() => {
                setName('');
                reload();
              })
              .catch((err: unknown) => setError(err));
          }}
        >
          <div className="inline-field">
            <label htmlFor="sa-name">New service account</label>
            <input id="sa-name" value={name} required onChange={(e) => setName(e.currentTarget.value)} />
          </div>
          <div className="inline-field">
            <label htmlFor="sa-role">role</label>
            <select id="sa-role" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
              {grantable.map((r) => (
                <option key={r.role} value={r.role}>
                  {roleLabel(r.role)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={name.trim() === ''}>
            Create
          </button>
        </form>
      )}
    </>
  );
}

/** expiry is a key's expiry, `days` from the moment a handler asks. */
function expiry(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

const LIFETIMES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
  { days: 365, label: 'a year' },
];

function Keys({ org, account, canMint }: { org: Organization; account: ServiceAccount; canMint: boolean }) {
  const [resource, reload] = useResource<{ keys: ApiKey[]; grantable: Capability[] }>(
    (signal) => api.apiKeys(org.id, account.id, signal),
    [org.id, account.id],
  );
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Capability[]>([]);
  const [days, setDays] = useState(90);
  const [minted, setMinted] = useState<{ token: string; notice: string; replaces?: ApiKey } | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (resource.status === 'loading') return <Spinner label="Loading keys…" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  const { keys, grantable } = resource.data;
  const revoke = (k: ApiKey) => {
    setError(null);
    api
      .revokeApiKey(org.id, account.id, k.id)
      .then(() => {
        setMinted((m) => (m?.replaces?.id === k.id ? { ...m, replaces: undefined } : m));
        reload();
      })
      .catch((e: unknown) => setError(e));
  };

  return (
    <div className="nested">
      {error != null && <ErrorNotice error={error} />}

      {minted && (
        // THE ONLY PLACE A KEY'S SECRET IS EVER SHOWN.
        <div className="notice notice-strong" role="status">
          <p>{minted.notice}</p>
          <code className="secret">{minted.token}</code>
          {minted.replaces && (
            <p>
              Both keys work until you revoke the old one.{' '}
              <button type="button" className="link-danger" onClick={() => revoke(minted.replaces!)}>
                Revoke {minted.replaces.name} now
              </button>
            </p>
          )}
          <p>
            <button type="button" className="link" onClick={() => setMinted(null)}>
              I have copied it
            </button>
          </p>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="muted">No keys yet.</p>
      ) : (
        <table className="table table-stack">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">May</th>
              <th scope="col">Expires</th>
              <th scope="col">Last used</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>
                  <strong>{k.name}</strong> {!k.live && <Badge tone="warn">not usable</Badge>}
                  <div className="muted small">
                    <span className="mono">{k.prefix}…</span> · created {formatDate(k.createdAt)}
                  </div>
                </td>
                <td data-label="May">
                  <CapabilityList capabilities={k.scope} />
                </td>
                <td data-label="Expires" className="muted">
                  {k.expiresAt ? formatDate(k.expiresAt) : 'never'}
                </td>
                <td data-label="Last used" className="muted">
                  {k.lastUsedAt ? relativeTime(k.lastUsedAt) : 'never'}
                </td>
                <td className="actions-cell">
                  {k.live && canMint && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setError(null);
                        api
                          .createApiKey(org.id, account.id, `${k.name} (rotated ${new Date().toISOString().slice(0, 10)})`, k.scope, expiry(90))
                          .then((created) => {
                            setMinted({ token: created.token, notice: created.notice, replaces: k });
                            reload();
                          })
                          .catch((e: unknown) => setError(e));
                      }}
                    >
                      Rotate
                    </button>
                  )}{' '}
                  {k.live && (
                    <button type="button" className="link-danger" onClick={() => revoke(k)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canMint && (
        <form
          className="stacked-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            api
              .createApiKey(org.id, account.id, name, scope, expiry(days))
              .then((created) => {
                setMinted({ token: created.token, notice: created.notice });
                setName('');
                setScope([]);
                reload();
              })
              .catch((err: unknown) => setError(err));
          }}
        >
          <label htmlFor={`key-name-${account.id}`}>New key</label>
          <input
            id={`key-name-${account.id}`}
            value={name}
            required
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <label htmlFor={`key-life-${account.id}`}>Expires after</label>
          <select
            id={`key-life-${account.id}`}
            value={days}
            onChange={(e) => setDays(Number(e.currentTarget.value))}
          >
            {LIFETIMES.map((l) => (
              <option key={l.days} value={l.days}>
                {l.label}
              </option>
            ))}
          </select>
          <fieldset>
            <legend>What it may do — a key can only narrow this account&rsquo;s own role, never widen it</legend>
            <div className="check-grid">
              {grantable.map((c) => (
                <label key={c} className="check">
                  <input
                    type="checkbox"
                    checked={scope.includes(c)}
                    onChange={(e) => {
                      // READ THE EVENT BEFORE THE UPDATER RUNS: React nulls
                      // currentTarget once the handler returns.
                      const checked = e.currentTarget.checked;
                      setScope((sel) => (checked ? [...sel, c] : sel.filter((x) => x !== c)));
                    }}
                  />
                  <span className="mono small">{c}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn btn-primary btn-sm" disabled={name.trim() === '' || scope.length === 0}>
            Create key
          </button>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Single sign-on                                                              */
/* -------------------------------------------------------------------------- */

function SingleSignOn({ org }: { org: Organization }) {
  const included = includes(org, FEATURE_SINGLE_SIGN_ON);
  const canManage = may(org, 'organization.manage');
  const [resource, reload] = useResource<IdentityStatus>(
    (signal) => api.identityStatus(org.id, signal),
    [org.id],
  );
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState('');
  const [link, setLink] = useState<{ url: string; notice: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<IdentityStatus | null>(null);

  if (resource.status === 'loading') return <Spinner label="Loading single sign-on…" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  const status = state ?? resource.data;
  const setup = status.setup;
  const run = (work: () => Promise<IdentityStatus | void>) => {
    setBusy(true);
    setError(null);
    work()
      .then((next) => {
        if (next) setState(next);
        else reload();
      })
      .catch((e: unknown) => setError(e))
      .finally(() => setBusy(false));
  };

  if (!included && !setup?.configured) {
    return <PlanNote what="Single sign-on with your company's identity provider" />;
  }

  return (
    <>
      {error != null && <ErrorNotice error={error} />}
      {status.notice && <p className="muted">{status.notice}</p>}
      {setup && !setup.providerReachable && (
        <div className="notice" role="status">
          <p>Nodeau could not reach the identity provider just now, so this shows the last state it recorded.</p>
        </div>
      )}

      <dl className="detail" data-testid="sso-states">
        <dt>Set up</dt>
        <dd>{setup?.configured ? <Badge tone="ok">yes</Badge> : <Badge tone="neutral">not yet</Badge>}</dd>
        <dt>Connection</dt>
        <dd>
          {setup?.connectionActive ? (
            <Badge tone="ok">active</Badge>
          ) : (
            <Badge tone="neutral">not active</Badge>
          )}
        </dd>
        <dt>Tested</dt>
        <dd>
          {setup?.lastSignInAt ? (
            <span>
              <Badge tone="ok">works</Badge>{' '}
              <span className="muted small">last sign-in {relativeTime(setup.lastSignInAt)}</span>
            </span>
          ) : (
            <Badge tone="neutral">nobody has signed in through it yet</Badge>
          )}
        </dd>
        <dt>Required</dt>
        <dd>{setup?.required ? <Badge tone="ok">required</Badge> : <Badge tone="neutral">optional</Badge>}</dd>
      </dl>

      {canManage && !setup?.configured && (
        <p>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => api.enableSSO(org.id))}>
            Set up single sign-on
          </button>
        </p>
      )}

      {setup?.configured && (
        <>
          <h2 className="section-title">Email domains</h2>
          <p className="muted">
            People whose address is in a verified domain can sign in through your connection.
            Verification is a DNS record you add; Nodeau never marks a domain verified itself.
          </p>
          {setup.domains.length > 0 && (
            <table className="table table-stack" data-testid="sso-domains">
              <thead>
                <tr>
                  <th scope="col">Domain</th>
                  <th scope="col">State</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {setup.domains.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.domain}</strong>
                      {!d.verified && d.verificationToken && (
                        <div className="muted small">
                          Add a TXT record named{' '}
                          <code>{(d.verificationPrefix ?? '_workos-challenge') + '.' + d.domain}</code> with the value{' '}
                          <code className="mono">{d.verificationToken}</code>
                        </div>
                      )}
                    </td>
                    <td data-label="State">
                      {d.verified ? <Badge tone="ok">verified</Badge> : <Badge tone="warn">{d.state || 'waiting'}</Badge>}
                    </td>
                    <td className="actions-cell">
                      {canManage && !d.verified && (
                        <button type="button" className="link" disabled={busy} onClick={() => run(() => api.verifyDomain(org.id, d.id))}>
                          Check now
                        </button>
                      )}{' '}
                      {canManage && (
                        <button type="button" className="link-danger" disabled={busy} onClick={() => run(() => api.removeDomain(org.id, d.id))}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canManage && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => api.addDomain(org.id, domain.trim()).finally(() => setDomain('')));
              }}
            >
              <div className="inline-field">
                <label htmlFor="sso-domain">Add a domain</label>
                <input id="sso-domain" value={domain} required onChange={(e) => setDomain(e.currentTarget.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy || domain.trim() === ''}>
                Add
              </button>
            </form>
          )}

          <h2 className="section-title">Your identity provider</h2>
          <p className="muted">
            Your IT administrator connects your identity provider (Okta, Microsoft Entra, Google
            Workspace and others, by SAML or OIDC) in a setup portal. Send them a link from here.
          </p>
          {link && (
            <div className="notice notice-strong" role="status">
              <p>{link.notice}</p>
              <code className="secret">{link.url}</code>
              <p>
                <button type="button" className="link" onClick={() => setLink(null)}>
                  Done
                </button>
              </p>
            </div>
          )}
          {canManage && (
            <p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  api
                    .setupLink(org.id, 'sso')
                    .then(setLink)
                    .catch((e: unknown) => setError(e));
                }}
              >
                Create a setup link
              </button>
            </p>
          )}

          <h2 className="section-title">Require single sign-on</h2>
          {setup.required ? (
            <p>
              Everybody whose address is in a verified domain signs in through your connection. A
              session that did not is asked to sign in again that way. Owners can always sign in
              their own way to fix a broken connection, and each time it is recorded here.
            </p>
          ) : (
            <p className="muted">
              When required, people in your verified domains must sign in through your connection;
              anybody signed in another way is asked to sign in again. Owners keep their own sign-in
              as a way back if the connection breaks.
            </p>
          )}
          {setup.recentRecoveryAccess > 0 && (
            <p className="notice" role="status" data-testid="sso-recovery">
              Owners used their own sign-in {setup.recentRecoveryAccess}{' '}
              {setup.recentRecoveryAccess === 1 ? 'time' : 'times'} in the last 30 days while single
              sign-on was required.
            </p>
          )}
          {!setup.required && setup.requireBlockers && setup.requireBlockers.length > 0 && (
            <ul className="muted" data-testid="sso-blockers">
              {setup.requireBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {canManage && !setup.required && (
            <>
              {!confirming ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !setup.canRequire}
                  onClick={() => setConfirming(true)}
                >
                  Require single sign-on
                </button>
              ) : (
                <div className="notice" role="alertdialog" aria-labelledby="sso-confirm-title">
                  <p id="sso-confirm-title">
                    <strong>Require single sign-on now?</strong> People signed in another way will be
                    asked to sign in again through your connection.
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    autoFocus
                    disabled={busy}
                    onClick={() => {
                      setConfirming(false);
                      run(() => api.setSSORequired(org.id, true));
                    }}
                  >
                    Require it
                  </button>{' '}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                    Not now
                  </button>
                </div>
              )}
            </>
          )}
          {canManage && setup.required && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.setSSORequired(org.id, false))}>
              Stop requiring it
            </button>
          )}
        </>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

function Settings({
  org,
  navigate,
  onChanged,
}: {
  org: Organization;
  navigate: (to: string) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(org.name);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  return (
    <>
      {error != null && <ErrorNotice error={error} />}
      {may(org, 'organization.manage') ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            api
              .renameOrganization(org.id, name.trim())
              .then(() => {
                setSaved(true);
                onChanged();
              })
              .catch((err: unknown) => setError(err));
          }}
        >
          <div className="inline-field">
            <label htmlFor="org-name">Organisation name</label>
            <input
              id="org-name"
              value={name}
              required
              maxLength={120}
              onChange={(e) => {
                setName(e.currentTarget.value);
                setSaved(false);
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={name.trim() === '' || name.trim() === org.name}>
            Save
          </button>
          {saved && (
            <span className="muted small" role="status">
              Saved
            </span>
          )}
        </form>
      ) : (
        <p>
          <strong>{org.name}</strong>
        </p>
      )}
      <p className="muted small">
        Renaming changes what the organisation is called. Its identity, its machines and its history
        stay exactly as they are.
      </p>
      <CreateOrganization navigate={navigate} onChanged={onChanged} />
    </>
  );
}

function CreateOrganization({ navigate, onChanged }: { navigate: (to: string) => void; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <p>
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Create a new organisation
        </button>
      </p>
    );
  }
  return (
    <div className="panel quiet">
      <h2>A new organisation</h2>
      <p className="muted">
        You&rsquo;ll be its owner. It starts on the free plan; people, roles and single sign-on arrive
        with Nodeau Business.
      </p>
      {error != null && <ErrorNotice error={error} />}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          api
            .createOrganization(name.trim())
            .then((org) => {
              try {
                window.localStorage.setItem('nodeau.organization', org.id);
              } catch {
                /* a convenience only */
              }
              onChanged();
              navigate(hrefFor.organization('settings'));
            })
            .catch((err: unknown) => setError(err));
        }}
      >
        <div className="inline-field">
          <label htmlFor="new-org-name">Name</label>
          <input id="new-org-name" value={name} required maxLength={120} onChange={(e) => setName(e.currentTarget.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={name.trim() === ''}>
          Create
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                      */
/* -------------------------------------------------------------------------- */

function PlanNote({ what }: { what: string }) {
  return (
    <div className="panel quiet" data-testid="plan-boundary">
      <p>
        {what} are part of Nodeau Business, which we set up with each organisation.{' '}
        <a href="https://nodeau.ai/contact/" target="_blank" rel="noreferrer">
          Get in touch
        </a>{' '}
        if you&rsquo;d like it. Everything else here keeps working exactly as it does now.
      </p>
    </div>
  );
}

/** CapabilityList shows permission names as the identifiers they are. */
function CapabilityList({ capabilities }: { capabilities: readonly string[] }) {
  return (
    <ul className="cap-list" aria-label="Permissions">
      {capabilities.map((c) => (
        <li key={c} className="cap">
          {c}
        </li>
      ))}
    </ul>
  );
}
