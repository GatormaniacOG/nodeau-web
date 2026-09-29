# Nodeau marketing site

Static site for **nodeau.ai**.

Plain HTML, CSS and JavaScript. **No build step, no dependencies, no
toolchain.** That is deliberate: a marketing site that cannot be deployed
without a working toolchain is a site that breaks when the toolchain moves.
Netlify publishes the repository as it is; the small Python tools below keep
the committed HTML honest, and none of them run at deploy time.

## Positioning

**Your GPUs. One private AI cloud.** Nodeau turns the GPUs and computers people
already own into one private AI cloud: run models, add machines, use familiar
APIs. The product defines the website, and the site never describes a
capability the current release does not have.

Three tiers, and the boundaries between them are about scale and collaboration
rather than customer size:

- **Home**: one machine, one GPU. Free, and a whole product: local inference,
  the catalog, fit checks, bring-your-own-model on Linux, the OpenAI-compatible
  endpoint, the local dashboard.
- **Home Pro**: $9.99 a month. Up to three machines, up to two GPUs in each,
  batch inference, and running the fleet from a browser.
- **Business**: tailored per organisation, and the public path is a
  conversation. There is deliberately no Business price, checkout or
  "buy" button.

The tier details on `/pricing/` come from `internal/entitlement/plans.go` in the
platform repository, which is what actually decides what an installation may
do. **If the two disagree, the code wins and the page is wrong.**

## Voice

The site sounds like a technical founder talking to another developer: warm,
direct, contractions, the occasional exclamation mark, short sentences mixed
with longer ones.

- **No em or en dashes in prose**, on any page. `tools/check-site.py` enforces
  it. Verbatim product output inside `<pre>`/`<code>` is exempt, because a
  transcript must say what the binary prints.
- **No buzzwords** (seamless, leverage, empower, unlock, robust, cutting-edge,
  next-generation…). Enforced.
- **No negative product framing on the marketing pages.** Scope is stated as
  what IS true: "a Mac runs standalone", "each card holds its own share",
  "running work stays where Nodeau placed it". Enforced for every page outside
  `/docs`. The docs may use the product's own precise vocabulary (refused,
  unsupported, reason codes) where exact error semantics need it.
- **Positive never means deceptive.** The boundaries somebody could build on
  and get hurt by (no failover, memory counted per card, a Mac standalone,
  capacity rather than speed from a split) are still stated, positively, and
  `REQUIRED` in the checker pins the sentences that carry them.

## Release states live on the roadmap

Every capability on `/roadmap/` carries one of four labels:

| pill | meaning |
|---|---|
| `Available` | in the current release on the public channel |
| `In progress` | being built or tested now; arrives in a future release |
| `Planned` | designed for and on the list |
| `Exploring` | a direction, not yet a plan |

**Released capability defines public claims.** Something built and staged, or
deployed on the hosted side with no customer-facing surface, is `In progress`
until a release on the public channel carries it. The marketing pages carry no
status pills; they link to the roadmap for anything that is not available yet.

## Structure

```
index.html            the story: what Nodeau is, starting, hardware, tasks, fleet, developers, plans
product/              everything Nodeau does, section by section
business/             Nodeau for teams and organisations
install/              Get Nodeau: Linux and Mac side by side, first request, next steps
pricing/  roadmap/  faq/  about/  contact/  thanks/
404.html
docs/                 GENERATED from docs-src/ (see below)
assets/nodeau.css     design system
assets/nodeau.js      nav, copy buttons, reveal, release version, contact deep-link
assets/docs.js        docs sidebar drawer, search, platform tabs, scrollspy
assets/og.png         the social preview image
netlify.toml          headers, redirects, the channel proxy, hidden repo files
app/                  the account application: a SEPARATE Netlify site
tools/                checkers and generators (standard library only)
```

Pages are directories with an `index.html`, so `/about` works on Netlify and
under any plain static server without redirect rules.

### One header and one footer

`tools/sitechrome.py` holds the site header and footer. `tools/build-docs.py`
renders them into every docs page, and `tools/sync-chrome.py` writes them into
every hand-written page between `<header class="site-header"` … `</header>` and
`<footer class="site-footer">` … `</footer>`. Change the navigation in one
place, then:

```bash
python3 tools/sync-chrome.py
```

`check-site.py` runs `sync-chrome.py --check`, so a hand-edited shell fails.

### /docs is generated; everything else is hand-written

```
docs-src/*.md          the content, one file per page, with front matter
docs-src/nav.json      THE navigation: sidebar, order, prev/next and sitemap
docs-src/cli-commands.txt   every public command and its flags, from the RELEASED binary
tools/build-docs.py    docs-src -> docs/*/index.html + docs/search-index.json
```

Change the Markdown, run `build-docs.py`, commit both. Never edit
`docs/**/index.html` by hand: `--check` fails, which is the point.

**The CLI reference follows the released binary, not the source tree.**
`docs-src/cli-commands.txt` is produced by the platform repository's
`scripts/docs/dump-cli-commands.sh <path-to-released-nodeau>`, run against the
archive a customer downloads for the current channel release.
`tools/check-cli-coverage.py` then fails on:

- a shipped command the reference does not document;
- a `nodeau …` command a docs page names that does not exist;
- a `--flag` on any docs page that no command accepts;
- on the hand-written pages, a `nodeau …` invocation that names no command, or a
  flag that **that specific command** does not accept.

### Shared assets are cache-stamped

Every page links `/assets/*.css|js` with `?v=<first 8 of the file's sha256>`.
`netlify.toml` serves HTML as `must-revalidate` and assets for an hour under
names that never change, so an unstamped change would pair new markup with a
cached old stylesheet. After changing anything in `assets/`:

```bash
python3 tools/stamp-assets.py
```

### The version string

No page carries a version. Every `<span data-release></span>` is filled by
`assets/nodeau.js` from `/channel/beta.json`, which `netlify.toml` proxies to
`get.nodeau.ai`, so the site always names the release a visitor would install.
With JavaScript off, or the channel unreachable, the slots stay empty and
anything marked `data-release-note` stays hidden, so no sentence carries a
number nobody checked.

## Checking the site

```bash
python3 tools/check-site.py      # everything below, in one command
```

Standard library only. It verifies structure (one `<title>`, canonical, Open
Graph tags), that internal links and anchors resolve, that every CSS class used
is defined, the voice rules above, the `REQUIRED` sentences, the retired and
forbidden phrases, the pricing table's tier logic, the sitemap, and it runs
`build-docs.py --check`, `check-cli-coverage.py`, `stamp-assets.py --check` and
`sync-chrome.py --check`.

### In a real browser

Geometry and script errors only exist in a rendered page, so there is an
optional browser audit using the Playwright the account app already vendors:

```bash
python3 tools/serve.py 8123 &
PLAYWRIGHT_BROWSERS_PATH=~/.local/nodeau-toolchains/playwright \
  node tools/site-audit.mjs http://127.0.0.1:8123 /tmp/site-audit
```

It visits every sitemap route plus a 404 probe at 1920, 1440, 1280, 1024, 768
and 390 pixels, and reports horizontal overflow, elements off screen, console
and page errors, failed requests, tiny text, squeezed headings, heading-level
skips, unnamed controls and duplicate ids. It also opens the phone menu and the
docs menu. Screenshots land in the output directory: look at them, because no
automated check replaces that.

## Local preview

```bash
python3 tools/serve.py           # http://127.0.0.1:8080
```

It serves the site the way Netlify does in the three ways pages depend on: the
channel proxy (so the version fills in), the 404 page, and the hidden repository
files. Clipboard copy buttons need a secure context, so on plain `http://` they
fall back to selecting the text.

## Netlify

- Build command: *(blank)*
- Publish directory: `.`

`netlify.toml` sets security headers, cache policy, the redirects people type by
hand (`/login`, `/signin`, `/account`, `/dashboard`, `/activate`, `/app/*`,
`/alpha`, `/download`, `/install.sh`), the `/channel/beta.json` proxy, and 404s
for repository files that are not pages (`README.md`, `tools/`, `docs-src/`).
There is deliberately no catch-all redirect: one would swallow `404.html`.

The account application is a **second site from this repository**, with base
directory `app` and its own `app/netlify.toml`, deployed from its own branch.
Nothing about it belongs here.

### Forms

`/contact/` uses **Netlify Forms**: plain static HTML, detected at deploy time,
with a honeypot and `action="/thanks/"`. `/contact/?type=business` preselects
the Business option. Submissions are emailed once a notification is configured
in the Netlify UI (Forms → Form notifications → founders@nodeau.ai). No
credentials belong in this repository.
