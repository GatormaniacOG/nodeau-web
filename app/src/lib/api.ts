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

  constructor(status: number, body: WireError) {
    super(body.message || body.code);
    this.name = 'ApiError';
    this.code = body.code;
    this.status = status;
    this.requestId = body.requestId;
    this.retryAfterSeconds = body.retryAfterSeconds;
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
};

/** signInURL is a top-level navigation, not a fetch — the provider redirect
 *  cannot happen inside XHR. */
export function signInURL(returnTo?: string): string {
  const url = new URL(apiBase + '/v1/auth/login');
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
