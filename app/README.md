# Nodeau Account application

The authenticated app served at **app.nodeau.ai**. React + TypeScript + Vite,
deployed to Netlify as a **second site from this repository** with `app` as the
build base — the marketing site at the repository root is untouched and keeps
its no-build deployment.

## What it is for

Sign in, see your organisation, see the machines linked to it, approve a new
one, and see which plan is in force. That is the whole scope, and the omissions
are deliberate: there is no remote control, no live fleet view and no checkout,
because none of those exist yet and a button that lies is worse than an absent
feature.

## Running it

```bash
npm ci
VITE_NODEAU_API_URL=http://localhost:8080 npm run dev
```

with `nodeau-cloud serve` running in the platform repository:

```bash
cd ../../nodeforge
eval "$(./scripts/dev-postgres.sh start)"
DATABASE_URL="$NODEAU_TEST_POSTGRES" NODEAU_APP_URL=http://localhost:5173 \
  go run ./cmd/nodeau-cloud migrate && \
DATABASE_URL="$NODEAU_TEST_POSTGRES" NODEAU_APP_URL=http://localhost:5173 \
  go run ./cmd/nodeau-cloud serve
```

Without WorkOS credentials the sign-in route answers a stated 503 and every
other route works. That is a development configuration, and the Go side refuses
it in production.

## Checks

```bash
npm run check      # typecheck, lint, unit tests, production build
npm run e2e        # browser tests, if Playwright browsers are installed
```

`tests/contract.test.ts` reads `pkg/cloudapi/cloudapi.go` from the platform
repository and fails when a field exists there and not in `src/lib/api.ts`. It
skips when that repository is not checked out beside this one — set
`NODEAU_PLATFORM_REPO` to point at it.

## Configuration

| Variable | Where | Secret? |
|---|---|---|
| `VITE_NODEAU_API_URL` | Netlify UI, per context | **No.** Vite inlines `VITE_*` into the bundle at build time, so everything here is public by construction. A secret must never be one. |

## Boundaries

Four things stay apart (`docs/ROADMAP.md` §5.2 in the platform repository):

```
public website  ·  authenticated app  ·  cloud API  ·  local Nodeau API
```

This is the second. It talks only to the Cloud API — never to a customer's
Kubernetes, never to their local Nodeau, and never to WorkOS or Stripe beyond
the redirect the Cloud API sends it on.
