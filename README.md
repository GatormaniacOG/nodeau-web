# Nodeau marketing site

Static site for **nodeau.ai**.

Plain HTML, CSS and JavaScript. **No build step, no dependencies, no
toolchain.** That is deliberate: a marketing site that cannot be deployed
without a working toolchain is a site that breaks when the toolchain moves.

## Positioning

The site describes Nodeau as a product. It does not describe it as an
experiment, and it does not annotate every sentence with how far the testing
goes — that reads as a changelog, and it talked the product down.

Three tiers, and the boundaries between them are about scale and
collaboration rather than customer size:

- **Home** — one person, one machine, one GPU. Free, and genuinely useful:
  local inference, the model catalogue, the local dashboard, fit checks, the
  authenticated OpenAI-compatible endpoint.
- **Home Pro** — the prosumer. Several machines you own, several GPUs in a
  machine, batch inference, remote management, model replication.
- **Business** — an organisation. Members, RBAC, SSO, quotas, audit, fleet
  policy, priority queues, support.

The tier table on `/pricing/` is derived from `internal/entitlement/plans.go`
in the platform repository, which is the thing that actually decides what an
installation may do. **If the two disagree, the code wins and the page is
wrong** — a pricing page that promises what the binary refuses is worse than
one that promises less.

### Release states live on the roadmap, and only there

Every capability on `/roadmap/` carries one of five labels:

| pill | colour | meaning |
|---|---|---|
| `Available` | green | in the published build |
| `Next release` | amber | qualified on real hardware here, in the next published build |
| `Working on it` | slate | under way now |
| `Planned` | slate | intended, designed for, not built |
| `Exploring` | slate | intent, not plan |

`Next release` is load-bearing. Without it, something that runs on real
hardware has to be labelled either unbuilt or already downloadable, and both
are wrong. Do not collapse it, and do not use it for something that has only
been tested synthetically.

The marketing pages carry no status pills at all. The roadmap is the ledger,
it is linked from every page that describes a capability, and
`tools/check-site.py` asserts its key sentences are still there.

### Claims that are deliberately NOT made

Nodeau's control plane spans more than one machine, and a workload has been
placed and served on a second machine's GPU. What has never happened is a
workload *moving* between machines: placement decides where something runs and
then holds it there, and there is no failover of any kind.

So the site says Nodeau **reasons across**, **decides between** and **holds**.
It must never say that workloads *run across* mixed GPUs, that Nodeau spreads,
distributes or balances work, that failover works, or that any fleet scale has
been tested. `FORBIDDEN` in the checker enforces exactly this.

Two boundaries stay on the sub-pages regardless of tone, because somebody
could build on them and get hurt: **no automatic failover**, and **Nodeau
assumes the people with access to a machine are trusted**. `REQUIRED` in the
checker pins the sentences that carry them on `/roadmap/`, `/faq/` and
`/about/`. They are deliberately **not** on the homepage.

### The account application

`app.nodeau.ai` is a **separate Netlify site** built from `app/` in this
repository. The marketing site links to it — header, footer, the account
section on the homepage — and `netlify.toml` redirects the addresses people
type by hand (`/login`, `/signin`, `/account`, `/dashboard`, `/activate`,
`/app/*`) to it. `/app/*` is forced, because the repository root is published
as-is and `app/` would otherwise be served as raw, unbuilt source.

The install guide moved from `/alpha/` to `/install/`. The old path is a
permanent redirect and must stay one: it is linked from release notes and
other people's posts.

The installer at **get.nodeau.ai** is a separate deployment. This site links to
it and must never duplicate or reimplement it.

## Structure

```
index.html            homepage
about/   install/   roadmap/   pricing/   faq/   contact/   thanks/
404.html
assets/nodeau.css     design system
assets/nodeau.js      nav, copy buttons, reveal, contact deep-link
netlify.toml          headers, redirects; publish ".", no build command
app/                  the account application — SEPARATE Netlify site
robots.txt  sitemap.xml  favicon.svg
tools/generate-pages.py   one-off generator (see below)
```

Pages are directories with an `index.html`, so `/about` works on Netlify and
under any plain static server without redirect rules.

### tools/generate-pages.py

A one-off script used to generate the sub-pages with a consistent header and
footer. **The committed HTML is the source of truth** — the script is kept only
as a record of how the shared shell was produced. If you edit a page, edit the
HTML. If you change the header or footer, change it in every page (there are
nine) or re-run the script and re-apply page bodies.

This is the honest cost of having no build step. It is a small site and the
trade was made knowingly.

## Content rules

1. **Never publish a command that does not exist.** Every command shown was
   verified against the shipped CLI before publication. In particular, do not
   document raw Kubernetes join procedures as a Nodeau workflow — development
   plumbing is not product UX.
2. **Label every capability on the roadmap.** Use the five states above. The
   marketing pages don't label; they link to the page that does.
3. **No absolute privacy claims.** The endpoint is localhost-only and
   authenticated, and Nodeau collects nothing — but a third-party app you point
   at it can do what it likes, and the site says so.
4. **No production-readiness claims, and no failover claims.** Nodeau does not
   fail over, and it is not built for mutually hostile users on one box. Say
   that where it matters (roadmap, FAQ, About) and do not apologise for it
   everywhere else.
5. **No invented prices.** Home is free, Home Pro is "coming soon" until
   checkout exists, Business is "contact us".
6. **Name the hardware actually tested.** "Run on an RTX 3080 and an RTX 2080"
   is both stronger and truer than "heterogeneous GPUs supported". Name the
   cards; do not count the machines. Never imply every NVIDIA card works.
7. **Say where a number came from.** Nodeau measures where it can and estimates
   conservatively where it cannot; the site must not claim it never estimates.
8. **Write like a person.** Short sentences, plain words, contractions where
   they land naturally. The voice is a knowledgeable colleague telling you how
   it is, not a spec sheet and not a pitch deck. If a sentence needs two
   em-dashes and a semicolon, it needs to be two sentences.

### The version string

`v0.1.0-alpha.5` — the **public** channel version — is written down in exactly
one place: `RELEASE` in `assets/nodeau.js`. Pages carry an empty
`<span data-release></span>` that it fills. Do not hard-code the version into a
page, and do not put a development build number (`0.6.0-…`) on the site at all.

With JavaScript off the span stays empty and surrounding whitespace collapses,
so every sentence still reads correctly.

## Checking the site

```bash
python3 tools/check-site.py
```

Standard library only, no dependencies. It verifies structure (one `<title>`,
canonical, OG tags, no stray `<!doctype>`), that internal links and in-page
anchors resolve, that every CSS class used in the HTML is defined, that no page
hard-codes a version string, that the sentences in `REQUIRED` are still present,
and that a list of retired phrases has not crept back in. Run it before pushing.

It skips `app/` entirely — that is the account application, it has its own
toolchain and its own tests (`cd app && npm run check`), and once anyone has run
`npm ci` it contains several hundred vendored HTML files.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Clipboard copy buttons need a secure context,
so on plain `http://` they fall back to selecting the text — that is expected
locally and works normally on the deployed HTTPS site.

## Netlify

- Build command: *(blank)*
- Publish directory: `.`

`netlify.toml` sets security headers, cache policy and the redirects listed
above. There is deliberately no catch-all redirect: one would swallow
`404.html` and serve the homepage for every typo.

The account application is a **second site from this repository**, with base
directory `app` and its own `app/netlify.toml`. Nothing about it belongs here.

### Forms

`/contact/` uses **Netlify Forms**. The form is plain static HTML, so Netlify
detects it at deploy time — there is no backend and no function.

- `name="contact"`, `method="POST"`, `data-netlify="true"`
- hidden `form-name` input matching the form name
- `netlify-honeypot="bot-field"` with an off-screen `bot-field` input
- `action="/thanks/"` for the success redirect
- `/contact/?type=business` preselects the Business option

**Submissions are not emailed anywhere until a notification is configured.**
That is a one-time setting in the Netlify UI:

> Site configuration → Forms → Form notifications → Add notification →
> Email notification → **founders@nodeau.ai**

No credentials belong in this repository. There is no Gmail integration, no
OAuth and no API key.
