# Nodeau marketing site

Static site for **nodeau.ai**.

Plain HTML, CSS and JavaScript. **No build step, no dependencies, no
toolchain.** That is deliberate: a marketing site that cannot be deployed
without a working toolchain is a site that breaks when the toolchain moves.

## Positioning

The site describes Nodeau as it exists today — a working Self-Hosted Alpha —
and keeps a hard line between what ships and what is intended.

- **Nodeau Home** — one person, one machine, one GPU. Local inference, model
  and GPU fit checks, an OpenAI-compatible endpoint on `127.0.0.1`. Multi-node
  is deliberately *not* part of Home.
- **Nodeau Business** — teams and organisations with shared GPU hardware. The
  single-node foundation exists today; fleet capability is labelled roadmap.

Every roadmap item carries a status pill (`Available`, `In Alpha`, `Next`,
`Planned`, `Exploring`) and the colour system reinforces it: green means it
exists or it is the thing to click, slate blue means roadmap. Nothing is
silently promoted from intent to fact.

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
   verified against the shipped CLI before publication.
2. **Label roadmap items.** If something is not in the current Alpha, say so
   next to it, not in a footnote.
3. **No absolute privacy claims.** The endpoint is localhost-only and
   authenticated, and Nodeau collects nothing — but a third-party app you point
   at it can do what it likes, and the site says so.
4. **No production-readiness claims.** It is an experimental Alpha.
5. **No invented prices.** Home is "coming soon", Business is "contact us".

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
