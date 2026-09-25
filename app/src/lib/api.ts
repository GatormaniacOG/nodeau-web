/**
 * The typed Nodeau Cloud client.
 *
 * # These types mirror pkg/cloudapi, and that is a deliberate duplication
 *
 * The Go package is the source of truth for the wire format. This is a
 * hand-maintained TypeScript mirror rather than generated output, because a
 * code-generation toolchain for a dozen small interfaces is more machinery than
 * the drift it prevents — and the drift is caught anyway: `tests/contract.test.ts`
 * reads the real Go source and fails when a field appears there and not here.
 *
 * # The frontend renders; it never enforces
 *
 * `docs/ROADMAP.md` §7. Capability enforcement is semantic and happens in
 * `internal/entitlement` on the customer's own machine. Nothing in this file or
 * anything that consumes it may gate a control on a plan id — a React component
 * that did would be a second enforcement point that can disagree with the first,
 * and the one with pictures is the one users believe.
 */

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'CONFLICT'
  | 'IDENTITY_UNAVAILABLE'
  | 'ACTIVATION_NOT_FOUND'
  | 'ACTIVATION_EXPIRED'
  | 'ACTIVATION_DENIED'
  | 'ACTIVATION_ALREADY_USED'
  | 'ACTIVATION_PENDING'
  | 'SLOW_DOWN'
  | 'INSTALLATION_REVOKED'
  | 'ENTITLEMENT_REFRESH_DENIED'
  | 'ENTITLEMENT_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface WireError {
  code: ErrorCode;
  message: string;
  requestId?: string;
  retryAfterSeconds?: number;
  /** What was wrong with each field of a rejected request — Phase 17C.
   *
   *  The server owns validation, so a form marks its fields from what it is
   *  TOLD rather than re-deriving the rules. A client that re-validated would
   *  be a second implementation of a rule it does not own, and it would
   *  disagree the day a bound changes. */
  fields?: Record<string, string>;
}

export interface User {
  id: string;
  email: string;
  displayName?: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  kind: 'personal' | 'team';
  role: 'owner' | 'admin' | 'member';
}

export interface Me {
  user: User;
  organizations: Organization[];
}

export interface Plan {
  id: string;
  displayName: string;
  summary?: string;
  status: string;
  purchasable: boolean;
  currentPeriodEnd?: string;
  features: string[];
  limits: Record<string, number>;
}

export interface AvailablePlan {
  id: string;
  displayName: string;
  summary: string;
  features: string[];
  current: boolean;
  purchasable: boolean;
  /**
   * This tier costs nothing, so there is nothing to buy.
   *
   * Separate from `purchasable` because "not purchasable" has two unrelated
   * meanings — a paid tier that is not on sale yet, and a free tier that is
   * never bought — and one boolean cannot tell them apart. See PlanPage.
   */
  free: boolean;
}

// ---------------------------------------------------------------------------
// The fleet — Phase 14
// ---------------------------------------------------------------------------

/**
 * Can Nodeau Cloud see this fleet right now?
 *
 * # It is NOT health and it is NOT scheduling state
 *
 * Three orthogonal dimensions, never one value. A connected machine can be
 * unhealthy; a draining machine is perfectly healthy; and a machine Nodeau
 * Cloud cannot see may be serving happily. Collapsing them is how a dashboard
 * tells somebody their fleet is down when it is not.
 *
 * `unknown` is the row that stops this lying. One connector reports a whole
 * installation, so when it is offline the cloud does not know the other
 * machines are offline — it knows it cannot see them.
 */
export type FleetPresence = 'online' | 'stale' | 'offline' | 'unknown';

export interface FleetGPUView {
  uuid: string;
  ordinal: number;
  model?: string;
  vramTotalMib?: number;
  vramUsedMib?: number;
  /**
   * Every live figure is OPTIONAL, and absent means UNOBSERVED rather than
   * zero. An idle card at 0% and a card whose driver did not answer are
   * different facts, and rendering both as "0" is confidently wrong about one.
   */
  utilizationPercent?: number;
  temperatureC?: number;
  powerWatts?: number;
  powerLimitWatts?: number;
  healthy: boolean;
  /** Whether Nodeau can place work here, as the MACHINE resolved it. */
  schedulable: boolean;
  /** Why not, in the product's own words. */
  note?: string;
}

export interface FleetMachineView {
  id: string;
  /** What to display: the operator's name if they set one, else the machine's. */
  name: string;
  /** Always what the machine calls itself, shown beside the display name so a
   *  rename can never make two machines look like one. */
  reportedName: string;
  presence: FleetPresence;
  health: string;
  schedulingState: string;
  /** What this machine reports it is USING. Never render the word "default":
   *  it means different things on different builds. */
  schedulingMode?: string;
  platform?: string;
  osVersion?: string;
  nodeauVersion?: string;
  agentVersion?: string;
  role?: string;
  executionPlane?: string;
  /** What this machine can be asked to do. A control is offered only when the
   *  machine that would execute it declares the capability — a button that will
   *  certainly fail is not shown. */
  capabilities?: string[];
  localOnline?: boolean;
  lastReportedAt?: string;
  /** What somebody ASKED for, present only when it differs from what the
   *  machine reports. Two fields that usually say the same thing invite a UI
   *  that renders whichever it reached first; one that appears only while
   *  reconciliation is pending can only be rendered as what it is. */
  desiredSchedulingState?: string;
  /** Why a machine is deliberately out of service, so a fleet with a machine
   *  down on purpose does not read as a fleet with a fault. */
  maintenanceReason?: string;
  maintenanceUntil?: string;
  /** The ceiling on the predicted power of everything Nodeau may run here. A
   *  SCHEDULING ceiling: it makes a candidate infeasible and writes nothing to
   *  any card. */
  powerBudgetWatts?: number;
  findings?: { code: string; severity?: string; detail: string }[];
  gpus?: FleetGPUView[];
}

export interface FleetInstallation {
  id: string;
  name: string;
  presence: FleetPresence;
  lastSyncAt?: string;
  connected: boolean;
  nodeauVersion?: string;
  /** The sentence to show above the machines — the product's own words. */
  headline: string;
  machines: FleetMachineView[];
}

export interface FleetView {
  installations: FleetInstallation[];
}

export interface FleetWorkloadView {
  name: string;
  machineId?: string;
  machineName?: string;
  type?: string;
  task?: string;
  model?: string;
  state: string;
  reasonCode?: string;
  reasonDetail?: string;
  gpuCount?: number;
  deviceUuids?: string[];
  schedulingMode?: string;
  /** The scheduler's own explanation, carried verbatim. There is no
   *  cloud-side explanation generator and there must not be one here either. */
  placementSummary?: string;
  restartCount?: number;
  generation?: number;
  lastReportedAt?: string;
  /** WHICH COPY of the workload this row is (issue #132): an opaque token the
   *  machine minted. Never displayed — a person reads the name — and always
   *  SUBMITTED with a stop, so the stop is about the copy this row showed and
   *  never about a later one that took the same name. */
  incarnation?: string;
}

export type OperationState =
  | 'requested'
  | 'delivered'
  | 'applying'
  | 'applied'
  | 'observed'
  | 'failed'
  | 'expired';

export interface Operation {
  id: string;
  kind: string;
  machineId?: string;
  machineName?: string;
  workloadName?: string;
  deviceUuid?: string;
  state: OperationState;
  resultCode?: string;
  resultDetail?: string;
  summary?: string;
  requestedByEmail?: string;
  requestedAt: string;
  deliveredAt?: string;
  finishedAt?: string;
  expiresAt?: string;
}

export interface FleetLogArtifact {
  operationId: string;
  text: string;
  lines: number;
  truncated: boolean;
  collectedAt: string;
  expiresAt: string;
  /** The honest limitation, carried WITH the artefact so this cannot be
   *  rendered without it. */
  warning?: string;
}

export interface Installation {
  id: string;
  name: string;
  nodeauVersion?: string;
  nodeCount: number;
  gpuCount: number;
  createdAt: string;
  lastSeenAt?: string;
  active: boolean;
  activated: boolean;
  entitlementPlanId?: string;
  entitlementNotAfter?: string;
}

export interface ActivationPendingView {
  userCode: string;
  requestedName?: string;
  nodeauVersion?: string;
  expiresAt: string;
}

export interface SecurityEvent {
  type: string;
  occurredAt: string;
  actorUserId?: string;
  installationId?: string;
  detail?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * ApiError carries the backend's typed reason.
 *
 * Components branch on `code`, never on `message`. A component that matched on
 * message text would break the day somebody improved the wording, which is the
 * opposite of what a good error message should cost.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  /** Per-field problems, when the server sent any — Phase 17C. */
  readonly fields?: Record<string, string>;

  constructor(status: number, body: WireError) {
    super(body.message || body.code);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = status;
    this.requestId = body.requestId;
    this.retryAfterSeconds = body.retryAfterSeconds;
    this.fields = body.fields;
  }
}

/**
 * NetworkError is "we never got an answer".
 *
 * Kept apart from every server-side failure because the remedy is different and
 * because "Nodeau Cloud is unreachable" must never be shown as though the
 * customer's own installation were at fault.
 */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Could not reach Nodeau Cloud.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* Resource governance — Phase 17C                                             */
/* -------------------------------------------------------------------------- */

/**
 * An organisation's policy over one fleet.
 *
 * # null and [] are DIFFERENT and this file must never normalise them
 *
 * `null` means NO POLICY — every model, every card, every machine. `[]` means a
 * policy that permits NOTHING. They are opposite intentions, both reachable,
 * and a helper here that turned one into the other would change what a fleet
 * enforces from inside a browser.
 *
 * A quota that is absent is NO QUOTA. Zero is the same thing said differently
 * and the server canonicalises it away, so nothing here has to decide.
 */
export interface GovernanceSettings {
  maxWorkloads?: number;
  maxGpus?: number;
  maxBatchWorkers?: number;
  allowedModels: string[] | null;
  allowedDevices: string[] | null;
  allowedNodes: string[] | null;
}

export interface GovernanceDevice {
  uuid: string;
  model?: string;
  machineName?: string;
  inPool: boolean;
}

export interface GovernanceMachine {
  name: string;
  machineId?: string;
  inGroup: boolean;
}

/**
 * What the organisation asked for, and what the fleet reports it has.
 *
 * `applied` is the SERVER's comparison of the two. A page that rendered a
 * saved form as a working policy would be reporting a claim as a fact, which is
 * the failure desired-versus-observed exists to prevent.
 *
 * `mayManage` is the server's answer too. A console that recomputed a
 * permission from a role name would be a second implementation of the
 * permission model, and it would disagree the day a role changes.
 */
// ---------------------------------------------------------------------------
// Phase 17D — usage, audit and fleet policy
// ---------------------------------------------------------------------------

/** One workload's consumption inside a window.
 *
 *  `acceleratorSeconds` is a fact about a RESERVATION — how long this workload
 *  held how many cards — and NOT a measurement of any card. Nodeau cannot
 *  attribute GPU utilisation per process (issue #17) and this figure does not
 *  pretend to. */
export interface UsageLine {
  kind: string;
  name: string;
  nodeName?: string;
  modelId?: string;
  modelSha256?: string;
  acceleratorSeconds: number;
  intervals: number;
  /** Present only when the organisation entered its own rate. */
  estimatedCost?: number;
}

export interface UsageSummary {
  acceleratorSeconds: number;
  /** Absent when no rate is set. ABSENT IS NOT ZERO: a zero renders as "this
   *  cost you nothing", which is a claim Nodeau is in no position to make. */
  estimatedCost?: number;
  currency?: string;
  /** Says WHY a cost is absent, which a missing field cannot. "Nobody entered
   *  a rate" and "there was no usage" must not render identically. */
  rateConfigured: boolean;
  from: string;
  to: string;
  lines?: UsageLine[];
}

export interface UsageRate {
  /** null CLEARS the rate, which is different from zero. */
  perAcceleratorHour: number | null;
  currency?: string;
}

export interface AuditEvent {
  type: string;
  occurredAt: string;
  actorUserId?: string;
  actorServiceAccountId?: string;
  installationId?: string;
  target?: string;
  /** "applied" or "refused". ABSENT for events written before the column
   *  existed — absent is not "applied", and rendering it as success would
   *  invent a fact about every record from before 2026-09-13. */
  result?: string;
  detail?: Record<string, string>;
}

export interface AuditPage {
  events: AuditEvent[];
  /** Stated WITH the data, so a reader who sees the oldest record can tell
   *  "this is all there was" from "this is all that is kept". */
  retentionDays: number;
}

export interface FleetGovernance {
  installationId: string;
  desired: GovernanceSettings;
  observed?: GovernanceSettings;
  observedAt?: string;
  applied: boolean;
  consistent: boolean;
  setByEmail?: string;
  setAt?: string;
  mayManage: boolean;
  machines: number;
  devices?: GovernanceDevice[];
  nodes?: GovernanceMachine[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * The header every state-changing request must carry.
 *
 * Mirrors `cloudapi.CSRFHeader`. Its value is not checked and is not a secret:
 * the security property is that a cross-origin HTML form cannot set a custom
 * header, so a request carrying one has either the same origin or a CORS
 * preflight the server approved.
 */
const CSRF_HEADER = 'X-Nodeau-Request';

/**
 * apiBase is where the Cloud API lives.
 *
 * From the build-time environment, because it differs between a developer's
 * machine and production and must not be guessed from `window.location` — an
 * app served from a preview URL would then talk to an API that does not exist.
 * Only NON-SECRET values are ever put in a frontend bundle; everything in a
 * Vite `VITE_` variable is public by construction and this one is a hostname.
 */
/* ---------------------------------------------------------------------------
 * Organisation governance — Phase 17B
 * ---------------------------------------------------------------------------
 *
 * NO TYPE HERE HAS A FIELD FOR A SECRET, with one exception: `CreatedApiKey`,
 * the response to creating one. That is the only moment the plaintext exists
 * outside the caller's own memory, and there is no endpoint that reads it back.
 *
 * `capabilities` is the SERVER's answer and is never recomputed here. A client
 * that derived what somebody may do would be a second implementation of the
 * permission model, and it would disagree the day a role changes.
 */

/** One thing a principal may do. A string, because the authoritative
 *  vocabulary lives on the server and a copy here would drift. */
export type Capability = string;

export interface RoleDescription {
  role: string;
  capabilities: Capability[];
  /** Whether the CALLER may put somebody in this role. The server's answer,
   *  because "you cannot hand out a role above your own" is a rule a client
   *  must not be trusted to apply. */
  grantable: boolean;
}

export interface Member {
  userId: string;
  email: string;
  displayName?: string;
  role: string;
  /** What this person's teams confer, shown beside the direct role rather than
   *  merged into it: "you are a viewer, and the platform team makes you an
   *  operator" is two facts and an administrator needs both. */
  teamRoles?: string[];
  capabilities: Capability[];
  active: boolean;
  /** An identity provider owns this membership, so a control here would be
   *  undone by the next sync. */
  fromDirectory?: boolean;
}

export interface MemberList {
  members: Member[];
  roles: RoleDescription[];
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  role: string;
  capabilities: Capability[];
  memberCount: number;
  fromDirectory?: boolean;
  createdAt: string;
}

export interface ServiceAccount {
  id: string;
  name: string;
  description?: string;
  role: string;
  capabilities: Capability[];
  enabled: boolean;
  keyCount: number;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  /** The scheme and the account id, for telling two keys apart. Deliberately
   *  not the start of the secret. */
  prefix: string;
  scope: Capability[];
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
  /** Whether it would authenticate right now. Revoked, expired and "its
   *  account is disabled" are three ways to be dead, and only the server knows
   *  all three. */
  live: boolean;
}

export interface CreatedApiKey {
  key: ApiKey;
  /** Shown once, never recoverable. */
  token: string;
  notice: string;
}

export interface IdentityStatus {
  /** 'unknown' | 'unconfigured' | 'active' — three-valued, because "we have
   *  never asked" and "we asked and there is none" send different people to do
   *  different things. */
  sso: string;
  directory: string;
  provider?: string;
  lastDirectoryEventAt?: string;
  notice?: string;
}

// ---------------------------------------------------------------------------
// The model catalogue
// ---------------------------------------------------------------------------

/**
 * One model a person can choose to run.
 *
 * # `id` is submitted; everything else is for reading
 *
 * The canonical identifier is what the machine resolves, and it is the ONLY
 * field that goes back to the API. A display name is what somebody recognises;
 * conflating the two is how a form submits "Qwen3.5 4B" to a scheduler that
 * has never heard of it.
 *
 * # `tasks` absent means NOT KNOWN, never "none"
 *
 * A model Nodeau Cloud has only ever seen running on somebody's fleet has no
 * profile in the hosted catalogue. Rendering that as "can do nothing" would be
 * a claim about somebody's own model that nothing established.
 */
export interface CatalogModel {
  id: string;
  displayName?: string;
  family?: string;
  parameters?: string;
  quantization?: string;
  role?: string;
  /** The hardware ladder rung the catalogue assigns: 8, 12, 16 or 24 GiB.
   *
   *  GUIDANCE AND NEVER ADMISSION. Whether a model fits is arithmetic done on
   *  the machine, against the card actually present, at the moment it is
   *  asked. Nothing in this application may filter on it — a browser that
   *  hid a model because it estimated a poor fit would be a second admission
   *  engine beside the one that works, and it would be wrong first on exactly
   *  the machines whose free memory is not their nameplate. */
  recommendedVramGib?: number;
  /** What a workload can be STARTED for. Absent means Nodeau Cloud does not
   *  know, which is not the same as none. */
  tasks?: string[];
  capabilities?: string[];
  /** active, deprecated or legacy. Absent for a model the catalogue does not
   *  describe. */
  status?: string;
  /** Offer this one first: an active curated entry. A deprecated model is
   *  still listed — somebody's fleet may be serving one right now. */
  featured: boolean;
  /** WHERE THIS KNOWLEDGE CAME FROM — `catalog` for Nodeau's curated set,
   *  `fleet` for an id this organisation's own fleet reported running.
   *
   *  Deliberately not "origin", which is a TRUST CLASS. Nodeau Cloud cannot
   *  decide whether an id it does not recognise is a customer's imported GGUF
   *  or a curated model from a newer release, and saying "custom" would assert
   *  a supply-chain fact nobody established. */
  source: 'catalog' | 'fleet';
  /** The workloads this fleet is running on it, for a fleet-sourced entry. */
  runningAs?: string[];
  /** Whether the organisation's own model policy allows it — Phase 17C,
   *  answered by the SERVER. Nothing here re-derives it: a client that did
   *  would be a second implementation of a policy it does not own. */
  permitted: boolean;
  notPermittedReason?: string;
}

export interface ModelCatalog {
  models: CatalogModel[];
  /** The task filter that produced this list, echoed so a page can tell "no
   *  model can embed" from "the catalogue is empty". */
  task?: string;
  /** The fleet whose model policy was applied. Empty means none was. */
  installationId?: string;
  /** Whether an organisation model policy was in force at all. Separate from
   *  every entry being permitted: "there is no policy" and "the policy happens
   *  to list everything" are different facts. */
  policyApplied: boolean;
}

// -- fleet rollouts — Phase 18B ------------------------------------------------
//
// A PLAN IS A READ and an OPERATION is what a person authorised. The console
// renders both as the server answered them: which machines move, in what
// order, what it costs the work on them, and — once authorised — what each
// machine REPORTS running, beside what it was asked to run. Nothing here
// decides who may authorise: the list carries `mayUpgrade`, answered.

/** A machine's disposition in a plan, in the server's own words. */
export type RolloutMachineState = 'up-to-date' | 'ready' | 'waiting' | 'blocked' | 'unknown';

export interface RolloutImpact {
  workloads?: string[];
  serving: number;
  downtime: boolean;
  alternateCapacity?: boolean;
  summary: string;
}

export interface RolloutPlanMachine {
  key: string;
  name?: string;
  controlPlane?: boolean;
  state: RolloutMachineState;
  from?: string;
  to: string;
  reason?: string;
  explanation?: string;
  impact: RolloutImpact;
  order?: number;
}

/** A plan, as `POST .../fleet/lifecycle/plan` answers it. The target's fields
 *  are capitalised because that is the released 18A JSON contract. */
export interface RolloutPlan {
  state: 'no-op' | 'ready' | 'waiting' | 'blocked';
  target: { Channel: string; Version: string; Commit: string };
  machines: RolloutPlanMachine[] | null;
  notes?: string[];
  hash: string;
}

export interface RolloutStep {
  seq: number;
  machineKey: string;
  /** The machine's identity when the step was planned: a machine removed and
   *  joined again is a new machine, and the step is not about it. */
  machineIncarnation?: string;
  machineName?: string;
  controlPlane?: boolean;
  from: string;
  to: string;
  state: 'pending' | 'in-progress' | 'complete' | 'failed' | 'skipped';
  attempt: number;
  phase?: string;
  reason?: string;
  detail?: string;
  observedVersion?: string;
}

export interface RolloutOperation {
  id: string;
  generation: number;
  state: 'authorized' | 'in-progress' | 'held' | 'complete' | 'canceled' | 'superseded';
  /** Frozen when authorised: a version, a commit and the digests of every
   *  archive and image it installs — never a URL. */
  target: {
    channel: string;
    version: string;
    commit: string;
    artifacts?: Record<string, string>;
    images?: Record<string, string>;
  };
  steps: RolloutStep[] | null;
  run?: { seq: number; attempt: number };
  cancelRequested?: boolean;
  windowOverride?: boolean;
  holdReason?: string;
  holdDetail?: string;
  authorizedBy?: string;
  createdAt: string;
}

/** An operation, with each step's machine as it REPORTS itself. */
export interface RolloutView {
  operation: RolloutOperation;
  observed: Record<string, { version?: string; reportedAt?: string; present: boolean }>;
  /** Why the next machine has not started, when it is the maintenance window. */
  waiting?: string;
}

export interface RolloutList {
  operations: RolloutView[];
  /** Whether THIS person may authorise, cancel or resume — the server's answer. */
  mayUpgrade: boolean;
  whyNot?: string;
}

export const apiBase: string =
  (import.meta.env.VITE_NODEAU_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8080';

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiBase + path, {
      method,
      // The session is an HttpOnly cookie the browser holds for api.nodeau.ai.
      // Without this the cookie is not sent on a cross-origin request and every
      // call looks unauthenticated.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        [CSRF_HEADER]: '1',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (cause) {
    // An aborted request is the caller unmounting, not a failure to report.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError(cause);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const wire = parsed as WireError | undefined;
    if (wire?.code) throw new ApiError(response.status, wire);
    // Not a Nodeau error body — almost always a proxy or a platform error page.
    // Say what actually happened rather than inventing a code.
    throw new ApiError(response.status, {
      code: 'INTERNAL_ERROR',
      message: `Nodeau Cloud returned HTTP ${response.status}.`,
    });
  }
  return parsed as T;
}

export const api = {
  me: (signal?: AbortSignal) => request<Me>('GET', '/v1/me', undefined, signal),

  plan: (orgId: string, signal?: AbortSignal) =>
    request<Plan>('GET', `/v1/organizations/${encodeURIComponent(orgId)}/plan`, undefined, signal),

  availablePlans: (orgId: string, signal?: AbortSignal) =>
    request<{ plans: AvailablePlan[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/plans`,
      undefined,
      signal,
    ),

  installations: (orgId: string, signal?: AbortSignal) =>
    request<{ installations: Installation[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/installations`,
      undefined,
      signal,
    ),

  installation: (orgId: string, id: string, signal?: AbortSignal) =>
    request<Installation>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/installations/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),

  deactivateInstallation: (orgId: string, id: string) =>
    request<void>(
      'DELETE',
      `/v1/organizations/${encodeURIComponent(orgId)}/installations/${encodeURIComponent(id)}`,
    ),

  events: (orgId: string, signal?: AbortSignal) =>
    request<{ events: SecurityEvent[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/events`,
      undefined,
      signal,
    ),

  /** Start a hosted checkout for a paid plan.
   *
   *  Returns the URL to send the browser to; the caller navigates. This grants
   *  nothing by itself — a plan follows from stored subscription state, which
   *  follows from a verified webhook, never from the customer's return trip.
   *
   *  Two refusals are expected rather than exceptional, and read differently to
   *  a user:
   *    403 FORBIDDEN — the launch gate is closed; paid plans are not on sale
   *                    from this deployment yet.
   *    409 CONFLICT  — this build defines the plan but maps no price to it,
   *                    which is what selling Home Pro and not Business looks
   *                    like.
   */
  members: (orgId: string, signal?: AbortSignal) =>
    request<MemberList>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/members`,
      undefined,
      signal,
    ),

  setMemberRole: (orgId: string, userId: string, role: string) =>
    request<MemberList>(
      'PATCH',
      `/v1/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
      { role },
    ),

  deactivateMember: (orgId: string, userId: string) =>
    request<MemberList>(
      'DELETE',
      `/v1/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
    ),

  teams: (orgId: string, signal?: AbortSignal) =>
    request<{ teams: Team[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/teams`,
      undefined,
      signal,
    ),

  createTeam: (orgId: string, name: string, role: string) =>
    request<Team>('POST', `/v1/organizations/${encodeURIComponent(orgId)}/teams`, { name, role }),

  deleteTeam: (orgId: string, teamId: string) =>
    request<void>(
      'DELETE',
      `/v1/organizations/${encodeURIComponent(orgId)}/teams/${encodeURIComponent(teamId)}`,
    ),

  serviceAccounts: (orgId: string, signal?: AbortSignal) =>
    request<{ accounts: ServiceAccount[]; roles: RoleDescription[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/service-accounts`,
      undefined,
      signal,
    ),

  createServiceAccount: (orgId: string, name: string, description: string, role: string) =>
    request<ServiceAccount>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/service-accounts`,
      { name, description, role },
    ),

  disableServiceAccount: (orgId: string, accountId: string) =>
    request<void>(
      'DELETE',
      `/v1/organizations/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(accountId)}`,
    ),

  apiKeys: (orgId: string, accountId: string, signal?: AbortSignal) =>
    request<{ keys: ApiKey[]; grantable: Capability[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(accountId)}/keys`,
      undefined,
      signal,
    ),

  /** Mint one key. The response is the ONLY time the plaintext exists outside
   *  the caller's own memory, and there is no endpoint that reads it back. */
  createApiKey: (orgId: string, accountId: string, name: string, scope: Capability[]) =>
    request<CreatedApiKey>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(accountId)}/keys`,
      { name, scope },
    ),

  revokeApiKey: (orgId: string, accountId: string, keyId: string) =>
    request<void>(
      'DELETE',
      `/v1/organizations/${encodeURIComponent(orgId)}/service-accounts/${encodeURIComponent(accountId)}/keys/${encodeURIComponent(keyId)}`,
    ),

  identityStatus: (orgId: string, signal?: AbortSignal) =>
    request<IdentityStatus>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/identity`,
      undefined,
      signal,
    ),

  /** Record WHICH identity-provider organisation and directory govern this
   *  one. Nodeau records a correspondence and creates nothing: the connection
   *  itself is made in the provider's own dashboard. */
  linkIdentity: (orgId: string, workosOrganizationId: string, directoryId: string) =>
    request<IdentityStatus>('PUT', `/v1/organizations/${encodeURIComponent(orgId)}/identity`, {
      workosOrganizationId,
      directoryId,
    }),

  startCheckout: (orgId: string, planId: string) =>
    request<{ url: string }>('POST', `/v1/organizations/${encodeURIComponent(orgId)}/checkout`, {
      planId,
    }),

  /** Open the billing provider's own portal.
   *
   *  Available whenever a subscription exists, INCLUDING while checkout is
   *  gated off — somebody who has already paid must always be able to see,
   *  change and cancel what they are paying for. Gating this behind a launch
   *  switch would let a launch decision trap a customer in a subscription.
   */
  billingPortal: (orgId: string) =>
    request<{ url: string }>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/billing-portal`,
    ),

  pendingActivation: (userCode: string, signal?: AbortSignal) =>
    request<ActivationPendingView>(
      'GET',
      `/v1/activation/pending/${encodeURIComponent(userCode)}`,
      undefined,
      signal,
    ),

  approveActivation: (userCode: string, organizationId: string, name: string) =>
    request<{ installation: Installation }>('POST', '/v1/activation/approve', {
      userCode,
      organizationId,
      name,
    }),

  denyActivation: (userCode: string) =>
    request<void>('POST', '/v1/activation/deny', { userCode }),

  logout: () => request<{ logoutUrl?: string }>('POST', '/v1/auth/logout'),

  // -- the fleet ------------------------------------------------------------

  fleet: (orgId: string, signal?: AbortSignal) =>
    request<FleetView>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet`,
      undefined,
      signal,
    ),

  fleetMachine: (orgId: string, id: string, signal?: AbortSignal) =>
    request<FleetMachineView>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/machines/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),

  renameFleetMachine: (orgId: string, id: string, displayName: string) =>
    request<FleetMachineView>(
      'PATCH',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/machines/${encodeURIComponent(id)}`,
      { displayName },
    ),

  fleetWorkloads: (orgId: string, signal?: AbortSignal) =>
    request<{ workloads: FleetWorkloadView[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/workloads`,
      undefined,
      signal,
    ),

  fleetOperations: (orgId: string, signal?: AbortSignal) =>
    request<{ operations: Operation[] }>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/operations`,
      undefined,
      signal,
    ),

  fleetOperation: (orgId: string, id: string, signal?: AbortSignal) =>
    request<Operation>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/operations/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),

  /** Ask a machine, or the fleet, to do one typed thing.
   *
   *  Returns immediately with a handle to follow. Nothing here waits for a
   *  model to download, and nothing renders a terminal success until the
   *  operation reaches `observed` — which the SERVER decides by comparing the
   *  intent against what the fleet reports, because only it holds both.
   *
   *  Three refusals are expected rather than exceptional:
   *    403 FORBIDDEN — this plan includes seeing the fleet and not changing it.
   *    409 CONFLICT  — the target machine's build cannot do this yet.
   *    400 INVALID   — the parameters are not something Nodeau can run.
   */
  requestFleetOperation: (orgId: string, body: Record<string, unknown>) =>
    request<Operation>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/operations`,
      body,
    ),

  // -- usage, audit and fleet policy — Phase 17D -----------------------------

  /** What this organisation's hardware did, inside a window.
   *
   *  NOT a bill and not a meter. Nodeau is priced for infrastructure rather
   *  than for tokens, and this surface carries no token count and no price of
   *  Nodeau's. `estimatedCost` appears only when the organisation entered its
   *  own rate. */
  usage: (orgId: string, params?: { from?: string; to?: string }, signal?: AbortSignal) =>
    request<UsageSummary>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/usage` +
        (params && (params.from || params.to)
          ? '?' +
            new URLSearchParams(
              Object.entries(params).filter(([, v]) => !!v) as [string, string][],
            ).toString()
          : ''),
      undefined,
      signal,
    ),

  /** The models this organisation may choose to run.
   *
   *  # Server-side, and that is the point
   *
   *  The curated catalogue compiled into Nodeau Cloud, plus the ids this
   *  organisation's own fleet reported running, narrowed by the organisation's
   *  17C model policy. Filtering in a browser would be a second implementation
   *  of a policy it does not own, and it would not be authorization in any
   *  case — every submitted id is governed and admitted again on the machine.
   *
   *  `task` asks for models that can be STARTED for that task. An unknown one
   *  is refused rather than answered with an empty list. */
  models: (
    orgId: string,
    params?: { task?: string; installationId?: string },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    if (params?.task) query.set('task', params.task);
    if (params?.installationId) query.set('installationId', params.installationId);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request<ModelCatalog>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/models${suffix}`,
      undefined,
      signal,
    );
  },

  usageRate: (orgId: string, signal?: AbortSignal) =>
    request<UsageRate>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/usage/rate`,
      undefined,
      signal,
    ),

  /** Set or clear the organisation's own rate.
   *
   *  `perAcceleratorHour: null` CLEARS it, which is different from zero: "do
   *  not show me a cost" and "this costs me nothing" are both things a customer
   *  may legitimately mean. */
  setUsageRate: (orgId: string, rate: UsageRate) =>
    request<UsageRate>(
      'PUT',
      `/v1/organizations/${encodeURIComponent(orgId)}/usage/rate`,
      rate,
    ),

  /** The audit trail — who changed what, and whether it happened.
   *
   *  A REFUSAL IS THE EVENT AN INVESTIGATION STARTS FROM, which is why
   *  `result` is filterable and why the list shows refusals rather than only
   *  what succeeded. */
  auditEvents: (
    orgId: string,
    params?: { type?: string; result?: string; target?: string; limit?: number },
    signal?: AbortSignal,
  ) =>
    request<AuditPage>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/events` +
        (params && Object.values(params).some((v) => v !== undefined && v !== '')
          ? '?' +
            new URLSearchParams(
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([k, v]) => [k, String(v)]),
            ).toString()
          : ''),
      undefined,
      signal,
    ),

  // -- resource governance — Phase 17C --------------------------------------

  fleetGovernance: (orgId: string, signal?: AbortSignal) =>
    request<FleetGovernance>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/governance`,
      undefined,
      signal,
    ),

  /** Replace a fleet's whole policy.
   *
   *  A REPLACEMENT, not a patch: what is sent is what the fleet will have. A
   *  patch would need a way to say "remove the model policy" distinct from "do
   *  not mention it", and the obvious encodings of that collapse the null/[]
   *  distinction.
   *
   *  Returns the operation to follow. Nothing is applied when this resolves —
   *  the fleet has to hear about it and report back, and only then does the
   *  server call it applied. */
  setFleetGovernance: (orgId: string, governance: GovernanceSettings) =>
    request<Operation>(
      'PUT',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/governance`,
      { governance },
    ),

  // -- fleet rollouts — Phase 18B --------------------------------------------

  rollouts: (orgId: string, signal?: AbortSignal) =>
    request<RolloutList>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/lifecycle/operations`,
      undefined,
      signal,
    ),

  /** A plan is a READ: nothing is stored and nothing moves. */
  planRollout: (orgId: string, body: { channel: string; version?: string }) =>
    request<RolloutPlan>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/lifecycle/plan`,
      body,
    ),

  /** Authorise THE PLAN THAT WAS SHOWN, named by its identity. The server
   *  recomputes its own and refuses with a sentence if they differ. */
  authorizeRollout: (
    orgId: string,
    body: { channel: string; version?: string; planHash: string; windowOverride: boolean },
  ) =>
    request<RolloutView>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/lifecycle/operations`,
      body,
    ),

  cancelRollout: (orgId: string, id: string) =>
    request<RolloutView>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/lifecycle/operations/${encodeURIComponent(id)}/cancel`,
    ),

  resumeRollout: (orgId: string, id: string) =>
    request<RolloutView>(
      'POST',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/lifecycle/operations/${encodeURIComponent(id)}/resume`,
    ),

  fleetLogs: (orgId: string, opId: string, signal?: AbortSignal) =>
    request<FleetLogArtifact>(
      'GET',
      `/v1/organizations/${encodeURIComponent(orgId)}/fleet/logs/${encodeURIComponent(opId)}`,
      undefined,
      signal,
    ),
};

/** signInURL is a top-level navigation, not a fetch — the provider redirect
 *  cannot happen inside XHR. */
export function signInURL(returnTo?: string): string {
  const url = new URL(apiBase + '/v1/auth/login');
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
