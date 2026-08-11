# Nodeau marketing site

Static site for **nodeau.ai**.

Plain HTML, CSS and JavaScript. **No build step, no dependencies, no
toolchain.** That is deliberate: a marketing site that cannot be deployed
without a working toolchain is a site that breaks when the toolchain moves.

## Positioning

The site describes Nodeau as it exists today and keeps a hard line between what
ships, what runs, and what is intended.

- **Nodeau Home** — one person, one machine, one GPU. Local inference, model
  and GPU fit checks, an OpenAI-compatible endpoint on `127.0.0.1`. Multi-node
  is deliberately *not* part of Home.
- **Nodeau Business** — teams and organisations with shared GPU hardware. The
  multi-node control plane is real and validated on two machines with different
  NVIDIA generations; it is labelled `In Alpha`, not `Available`, because the
  public installer sets up one machine.

### The three-state rule

This is the site's central editorial constraint. Every capability carries a
status pill, and the colour system reinforces it:

| pill | colour | meaning |
|---|---|---|
| `Available` | green | ships in the public Self-Hosted Alpha |
| `In Alpha` | amber | built and physically validated, **not** in the public installer |
| `Next` | slate | being worked on, or the immediate next priority |
| `Planned` | slate | intended, designed for, not built |
| `Exploring` | slate | intent, not plan |

`In Alpha` exists because without it a capability that genuinely runs on
hardware has to be mislabelled as either unbuilt or fully shipped, and both are
wrong. Do not collapse it, and do not use it for something that has only been
tested synthetically.

### Where the detail lives

The marketing pages describe what Nodeau **does**. They deliberately do not
enumerate how deep the testing goes — no machine counts, no "that is only two
data points", no "and they both belong to the same person". Not volunteering a
test matrix is ordinary editorial judgement, and the old copy was talking
itself down.

**The roadmap carries the full picture**, and that is not optional. It is the
one page that states the exact limits of what multi-machine operation has
shown, and `tools/check-site.py` asserts those sentences are still present. If
they are ever trimmed, every other page silently becomes an overclaim by
omission — which is why they are checked rather than trusted.

### Claims that are deliberately NOT made

Nodeau's control plane spans more than one machine, but a workload has never
been *started* on the second GPU, no machine has been removed to see what
happens, and failover does not exist.

So the site says Nodeau **reasons across** and **decides between** machines. It
must never say that workloads *run across* mixed GPUs, that Nodeau spreads,
distributes or balances work, that failover works, or that any fleet scale has
been tested. `FORBIDDEN` in the checker enforces exactly this, and it matters
more now that the pages no longer carry the caveats that used to catch a
sentence drifting too far.

Three limits stay on the main pages regardless, because they are capability
boundaries rather than testing-depth trivia, and someone could build on them
and get hurt: **no automatic failover**, **not production-ready**, and the
**Available vs In Alpha** split.

The installer at **get.nodeau.ai** is a separate deployment. This site links to
it and must never duplicate or reimplement it.

## Structure

```
index.html            homepage
about/   alpha/   roadmap/   pricing/   faq/   contact/   thanks/
404.html
assets/nodeau.css     design system
assets/nodeau.js      nav, copy buttons, reveal, contact deep-link
netlify.toml          headers; publish ".", no build command
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
2. **Label every capability.** Use the three-state rule above. If something is
   not in the public installer, say so next to it, not in a footnote.
3. **No absolute privacy claims.** The endpoint is localhost-only and
   authenticated, and Nodeau collects nothing — but a third-party app you point
   at it can do what it likes, and the site says so.
4. **No production-readiness claims.** It is an experimental Alpha, and it does
   not fail over.
5. **No invented prices.** Home is "coming soon", Business is "contact us".
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
hard-codes a version string, and that a list of retired phrases has not crept
back in. Run it before pushing.

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

`netlify.toml` sets security headers and cache policy. There is deliberately no
catch-all redirect: one would swallow `404.html` and serve the homepage for
every typo.

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
