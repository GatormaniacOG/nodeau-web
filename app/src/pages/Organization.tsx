import { useState } from 'react';
import {
  api,
  ApiError,
  type ApiKey,
  type Capability,
  type IdentityStatus,
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

/**
 * Organisation administration — Phase 17B.
 *
 * # This page hides nothing that matters
 *
 * UI HIDING IS NOT AUTHORIZATION. Every control here is also gated on the
 * server, and the console is refused exactly as a script would be. What the
 * page does with the server's answer is stop OFFERING an action nobody can
 * perform — which is courtesy, not security, and is written down here so the
 * next person does not mistake one for the other.
 *
 * Concretely: `grantable` on a role comes from the server, because "you cannot
 * hand out a role above your own" is a rule a client must not be trusted to
 * apply. The dropdown omits what the caller may not grant; the API refuses it
 * anyway.
 *
 * # A control the next sync would undo is worse than no control
 *
 * A team or a membership an identity provider owns is shown as theirs and is
 * not editable here. Offering the button would let somebody click it, watch it
 * appear to work, and find the change gone within the hour with nothing to
 * explain it.
 */
export function OrganizationPage({ me, org }: { me: Me; org: Organization }) {
  const [tab, setTab] = useState<'members' | 'teams' | 'credentials' | 'identity'>('members');

  return (
    <section>
      <header className="page-head">
        <h1>Organisation</h1>
        <p className="muted">
          {org.name} — who is in it, what they may do, and where they come from.
        </p>
      </header>

      <nav className="tabs" aria-label="Organisation sections">
        {(
          [
            ['members', 'Members'],
            ['teams', 'Teams'],
            ['credentials', 'Service accounts'],
            ['identity', 'Single sign-on'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'tab tab-current' : 'tab'}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'members' && <Members me={me} org={org} />}
      {tab === 'teams' && <Teams org={org} />}
      {tab === 'credentials' && <Credentials org={org} />}
      {tab === 'identity' && <Identity org={org} />}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Members                                                                     */
/* -------------------------------------------------------------------------- */

function Members({ me, org }: { me: Me; org: Organization }) {
  const [resource, reload] = useResource<MemberList>(
    (signal) => api.members(org.id, signal),
    [org.id],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (resource.status === 'loading') return <Spinner label="Loading members…" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  const { members, roles } = resource.data;
  const canManage = members
    .find((m) => m.userId === me.user.id)
    ?.capabilities.includes('members.manage');

  const change = async (userId: string, role: string) => {
    setBusy(userId);
    setError(null);
    try {
      await api.setMemberRole(org.id, userId, role);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (userId: string) => {
    setBusy(userId);
    setError(null);
    try {
      await api.deactivateMember(org.id, userId);
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
      <table className="table table-stack">
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
              canManage={Boolean(canManage)}
              busy={busy === m.userId}
              onChange={change}
              onRemove={remove}
            />
          ))}
        </tbody>
      </table>
      <p className="muted">
        A role is a set of permissions rather than a rank. A team can add to what somebody
        may do; it never takes anything away.
      </p>
    </>
  );
}

function MemberRow({
  member,
  roles,
  isSelf,
  canManage,
  busy,
  onChange,
  onRemove,
}: {
  member: Member;
  roles: RoleDescription[];
  isSelf: boolean;
  canManage: boolean;
  busy: boolean;
  onChange: (userId: string, role: string) => void;
  onRemove: (userId: string) => void;
}) {
  // The server says which roles this caller may grant. Anything else is not
  // offered — and is refused by the API too, which is the half that matters.
  const grantable = roles.filter((r) => r.grantable);
  const editable = canManage && !member.fromDirectory && member.active;

  return (
    <tr>
      <td>
        {/* The email once, not twice. Rendering both a name and an address
            when the name IS the address prints it twice, which reads as a
            duplicated row. */}
        <strong className="person-name">{member.displayName || member.email}</strong>
        {member.displayName && <span className="person-email">{member.email}</span>}
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
        {editable ? (
          <select
            aria-label={`Role for ${member.email}`}
            value={member.role}
            disabled={busy}
            onChange={(e) => onChange(member.userId, e.currentTarget.value)}
          >
            {grantable.map((r) => (
              <option key={r.role} value={r.role}>
                {r.role}
              </option>
            ))}
            {/* The member's CURRENT role, even when the caller could not grant
                it. Omitting it would render the select with the wrong value
                selected, which reads as a silent demotion. */}
            {!grantable.some((r) => r.role === member.role) && (
              <option value={member.role} disabled>
                {member.role}
              </option>
            )}
          </select>
        ) : (
          member.role
        )}
        {member.teamRoles && member.teamRoles.length > 0 && (
          <div className="muted">+ {member.teamRoles.join(', ')} by team</div>
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
        {editable && !isSelf && (
          <button type="button" className="link-danger" disabled={busy} onClick={() => onRemove(member.userId)}>
            Remove access
          </button>
        )}
      </td>
    </tr>
  );
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
          A team is a group of people who share a role. Everybody in it gets what the team
          allows, on top of whatever their own role already gives them.
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
            {teams.map((t) => (
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
                  <div>{t.role}</div>
                  <CapabilityList capabilities={t.capabilities} />
                </td>
                <td data-label="People" className="num">
                  {t.memberCount}
                </td>
                <td className="actions-cell">
                  {t.fromDirectory ? (
                    <span className="muted">managed by your identity provider</span>
                  ) : (
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {grantable.length > 0 && (
        <form className="inline-form" onSubmit={create}>
          <div className="inline-field">
            <label htmlFor="team-name">New team</label>
            <input
              id="team-name"
              value={name}
              required
              placeholder="Platform"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div className="inline-field">
            <label htmlFor="team-role">confers</label>
            <select id="team-role" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
              {grantable.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || name.trim() === ''}
          >
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
    // A viewer has no `credentials.manage` and is refused here. That is the
    // ordinary state of somebody without the permission, not a fault.
    if (resource.error instanceof ApiError && resource.error.code === 'FORBIDDEN') {
      return (
        <Empty title="Not yours to manage">
          {resource.error.message}
        </Empty>
      );
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
          A service account is a principal for a script or a pipeline. It is not a person: it
          has no mailbox, no sign-in and no second factor, so it carries a role of its own and
          its keys can only narrow that role further.
        </Empty>
      ) : (
        accounts.map((a) => (
          <article key={a.id} className="panel">
            <header>
              <div className="account-head">
                <h2>{a.name}</h2>
                {!a.enabled && <Badge tone="warn">disabled</Badge>}
              </div>
              <p className="muted">
                {a.description || 'No description.'} — {a.role}
              </p>
              <CapabilityList capabilities={a.capabilities} />
            </header>
            <p className="account-meta">
              <span>
                {a.keyCount} live {a.keyCount === 1 ? 'key' : 'keys'}
              </span>
              <button type="button" className="link" onClick={() => setOpen(open === a.id ? null : a.id)}>
                {open === a.id ? 'Hide keys' : 'Manage keys'}
              </button>
              {a.enabled && (
                <>
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
                </>
              )}
            </p>
            {open === a.id && <Keys org={org} account={a} />}
          </article>
        ))
      )}

      {grantable.length > 0 && (
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
            <input
              id="sa-name"
              value={name}
              required
              placeholder="ci"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>
          <div className="inline-field">
            <label htmlFor="sa-role">role</label>
            <select id="sa-role" value={role} onChange={(e) => setRole(e.currentTarget.value)}>
              {grantable.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role}
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

function Keys({ org, account }: { org: Organization; account: ServiceAccount }) {
  const [resource, reload] = useResource<{ keys: ApiKey[]; grantable: Capability[] }>(
    (signal) => api.apiKeys(org.id, account.id, signal),
    [org.id, account.id],
  );
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Capability[]>([]);
  const [minted, setMinted] = useState<{ token: string; notice: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (resource.status === 'loading') return <Spinner label="Loading keys…" />;
  if (resource.status === 'error') return <ErrorNotice error={resource.error} onRetry={reload} />;

  const { keys, grantable } = resource.data;

  return (
    <div className="nested">
      {error != null && <ErrorNotice error={error} />}

      {minted && (
        // THE ONLY PLACE A SECRET IS EVER SHOWN. It is not stored in component
        // state beyond this render path, not written to the URL, and not
        // recoverable from any endpoint.
        <div className="notice notice-strong">
          <p>{minted.notice}</p>
          <code className="secret">{minted.token}</code>
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
                <td data-label="Last used" className="muted">
                  {k.lastUsedAt ? relativeTime(k.lastUsedAt) : 'never'}
                </td>
                <td className="actions-cell">
                  {k.live && (
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => {
                        setError(null);
                        api
                          .revokeApiKey(org.id, account.id, k.id)
                          .then(reload)
                          .catch((e: unknown) => setError(e));
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        className="stacked-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          api
            .createApiKey(org.id, account.id, name, scope)
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
          placeholder="deploy pipeline"
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <fieldset>
          <legend>
            What it may do — a key can only narrow this account&rsquo;s own role, never widen it
          </legend>
          <div className="check-grid">
          {grantable.map((c) => (
            <label key={c} className="check">
              <input
                type="checkbox"
                checked={scope.includes(c)}
                onChange={(e) => {
                  // READ THE EVENT BEFORE THE UPDATER RUNS. React nulls
                  // `currentTarget` once the handler returns, and a functional
                  // setState is deferred — so reading it inside the updater
                  // throws on the second render rather than the first, which is
                  // why it looks like it works.
                  const checked = e.currentTarget.checked;
                  setScope((sel) => (checked ? [...sel, c] : sel.filter((x) => x !== c)));
                }}
              />
              <span className="mono small">{c}</span>
            </label>
          ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={name.trim() === '' || scope.length === 0}
        >
          Create key
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

function Identity({ org }: { org: Organization }) {
  const [resource, reload] = useResource<IdentityStatus>(
    (signal) => api.identityStatus(org.id, signal),
    [org.id],
  );

  if (resource.status === 'loading') return <Spinner label="Loading…" />;
  if (resource.status === 'error') {
    if (resource.error instanceof ApiError && resource.error.code === 'FORBIDDEN') {
      return <Empty title="Not yours to manage">{resource.error.message}</Empty>;
    }
    return <ErrorNotice error={resource.error} onRetry={reload} />;
  }

  const s = resource.data;
  return (
    <>
      <dl className="detail">
        <dt>Single sign-on</dt>
        <dd>
          <StateBadge state={s.sso} />
        </dd>

        <dt>Directory sync</dt>
        <dd>
          <StateBadge state={s.directory} />
        </dd>

        <dt>Last directory event</dt>
        <dd>{s.lastDirectoryEventAt ? relativeTime(s.lastDirectoryEventAt) : 'never'}</dd>

        {s.provider && (
          <>
            <dt>Provider</dt>
            <dd>{s.provider}</dd>
          </>
        )}
      </dl>

      {s.notice && <p className="muted">{s.notice}</p>}

      <LinkForm org={org} onLinked={reload} />

      <p className="muted">
        Nodeau does not run a directory of its own. People and groups arrive from your
        identity provider, and what each group may do is decided here.
      </p>
    </>
  );
}

/** LinkForm records the correspondence, and nothing else.
 *
 *  There is no button here that creates a connection, because creating one
 *  needs credentials for the customer's identity provider and this product
 *  deliberately does not hold any. What it records is which organisation and
 *  which directory over there correspond to this one over here — without which
 *  an incoming directory event cannot be resolved to a customer at all. */
function LinkForm({ org, onLinked }: { org: Organization; onLinked: () => void }) {
  const [workosOrg, setWorkosOrg] = useState('');
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="stacked-form"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        api
          .linkIdentity(org.id, workosOrg.trim(), directory.trim())
          .then(() => {
            onLinked();
          })
          .catch((err: unknown) => setError(err))
          .finally(() => setBusy(false));
      }}
    >
      {error != null && <ErrorNotice error={error} />}
      <label htmlFor="workos-org">Identity provider organisation</label>
      <input
        id="workos-org"
        value={workosOrg}
        placeholder="org_…"
        onChange={(e) => setWorkosOrg(e.currentTarget.value)}
      />
      <label htmlFor="workos-dir">Directory</label>
      <input
        id="workos-dir"
        value={directory}
        placeholder="directory_…"
        onChange={(e) => setDirectory(e.currentTarget.value)}
      />
      <p className="muted">
        Both are identifiers from your provider&rsquo;s dashboard. Leaving one empty clears
        it; the people and teams a directory already created stay, because they are members
        of this organisation now.
      </p>
      <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
        Save
      </button>
    </form>
  );
}

/** CapabilityList shows permission names as the identifiers they are.
 *
 *  A comma-joined sentence of dotted names wrapped mid-word in a narrow
 *  column; a list of tokens wraps between them. */
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

/** StateBadge renders a three-valued state honestly.
 *
 *  "We have never asked" is not "there is none", and a badge that showed a
 *  plain off/on would collapse them — which sends an administrator to look for
 *  a switch rather than to their identity provider. */
function StateBadge({ state }: { state: string }) {
  switch (state) {
    case 'active':
      return <Badge tone="ok">active</Badge>;
    case 'inactive':
      return <Badge tone="warn">inactive</Badge>;
    case 'unconfigured':
      return <Badge tone="neutral">not configured</Badge>;
    default:
      return <Badge tone="neutral">not known yet</Badge>;
  }
}
