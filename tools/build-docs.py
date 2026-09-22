#!/usr/bin/env python3
"""Build /docs from docs-src/*.md.

    python3 tools/build-docs.py            # write docs/
    python3 tools/build-docs.py --check    # fail if the output is not current

WHY A GENERATOR ON A SITE WITH NO BUILD STEP
--------------------------------------------
The site is deployed as plain files and must stay that way: netlify.toml has no
build command, and a marketing site that cannot be deployed without a toolchain
is one that breaks when the toolchain moves. So this is the same trade
tools/generate-pages.py already made — the OUTPUT is committed and is what
Netlify serves. The difference is that this generator is idempotent and
`--check` runs in the site check, so the committed HTML cannot drift from the
Markdown the way a one-off generator's output can.

The documentation is 20-odd pages of prose that shares one header, one footer,
one sidebar and one search index. Hand-maintaining that is how a sidebar comes
to list a page that no longer exists.

Standard library only, for the same reason check-site.py is: a docs build that
needs `pip install` is the toolchain the site was designed to avoid.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assetstamp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs-src"
OUT = ROOT / "docs"

# ---------------------------------------------------------------------------
# Front matter
# ---------------------------------------------------------------------------


def split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        raise SystemExit("every docs source needs front matter")
    end = text.index("\n---\n", 3)
    meta: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if not line.strip():
            continue
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()
    return meta, text[end + 5:]


# ---------------------------------------------------------------------------
# Inline markup
# ---------------------------------------------------------------------------

CODE_SPAN = re.compile(r"`([^`]+)`")
LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
BOLD = re.compile(r"\*\*([^*]+)\*\*")
EM = re.compile(r"(?<![*\w])\*([^*\n]+)\*(?![*\w])")


def inline(text: str) -> str:
    """Render inline markup, escaping everything that is not markup.

    Code spans are extracted FIRST and reinserted last, so `**` inside a
    command line is not read as emphasis — which matters here because the CLI
    reference is full of shell syntax.
    """
    spans: list[str] = []

    def stash(m: re.Match[str]) -> str:
        spans.append(html.escape(m.group(1)))
        return f"\x00{len(spans) - 1}\x00"

    text = CODE_SPAN.sub(stash, text)
    text = html.escape(text, quote=False)

    # Links are written with escaped text already; unescape the URL side only.
    def link(m: re.Match[str]) -> str:
        label, href = m.group(1), html.unescape(m.group(2))
        external = href.startswith(("http://", "https://"))
        rel = ' rel="noopener"' if external else ""
        return f'<a href="{html.escape(href, quote=True)}"{rel}>{label}</a>'

    text = LINK.sub(link, text)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    text = EM.sub(r"<em>\1</em>", text)
    # {release} is the published version, read from the channel at page load by
    # assets/nodeau.js. A version typed into a page is a stale row the day the
    # channel moves — nodeau.ai carried one for a month (issue #151).
    text = text.replace("{release}", '<span data-release>the current beta channel</span>')
    text = re.sub(r"\x00(\d+)\x00", lambda m: f"<code>{spans[int(m.group(1))]}</code>", text)
    return text


SLUG_STRIP = re.compile(r"[^a-z0-9 -]")


def slugify(text: str) -> str:
    text = CODE_SPAN.sub(r"\1", text).lower()
    text = text.replace("/", " ").replace("_", "-")
    text = SLUG_STRIP.sub("", text)
    return re.sub(r"[ -]+", "-", text).strip("-")


# ---------------------------------------------------------------------------
# Block parsing
# ---------------------------------------------------------------------------

CALLOUT_KINDS = {
    "note": "Note",
    "important": "Important",
    "warning": "Warning",
    "danger": "Destructive",
    "security": "Security",
    "linux": "Linux / NVIDIA only",
    "macos": "macOS / Apple Silicon only",
    "homepro": "Home Pro",
    "business": "Business",
}


class Context:
    """Ids and counters shared by a page and everything nested inside it.

    A callout and a tab panel are rendered by a recursive call, and their code
    blocks and headings still land on ONE page. Handing each nested render its
    own counter produced `id="x-code-1"` twice on a page and a copy button
    pointing at the wrong block — so the counter is shared rather than
    reconciled afterwards.
    """

    def __init__(self, slug: str) -> None:
        self.slug = slug
        self.ids: set[str] = set()
        self.code_blocks = 0

    def next_code_id(self) -> str:
        self.code_blocks += 1
        return f"{self.slug}-code-{self.code_blocks}"

    def heading_id(self, text: str, explicit: str | None) -> str:
        base = explicit or slugify(text)
        hid, n = base, 2
        while hid in self.ids:
            hid, n = f"{base}-{n}", n + 1
        self.ids.add(hid)
        return hid


class Doc:
    """One page: HTML, the headings it defines, and its searchable text."""

    def __init__(self, slug: str, meta: dict[str, str], ctx: Context) -> None:
        self.slug = slug
        self.meta = meta
        self.ctx = ctx
        self.out: list[str] = []
        self.headings: list[tuple[int, str, str]] = []   # level, id, text

    def emit(self, s: str) -> None:
        self.out.append(s)

    @property
    def ids(self) -> set[str]:
        return self.ctx.ids


HEADING = re.compile(r"^(#{2,4})\s+(.*?)(?:\s+\{#([a-z0-9-]+)\})?\s*$")
FENCE = re.compile(r"^```([a-z0-9+-]*)\s*(?:title=(.*))?$")
CALLOUT_OPEN = re.compile(r"^:::(" + "|".join(CALLOUT_KINDS) + r")(?:\s+(.*))?$")
TAB_LABEL = re.compile(r"^::::\s*(.+)$")
OL_ITEM = re.compile(r"^(\s*)(\d+)\.\s+(.*)$")
UL_ITEM = re.compile(r"^(\s*)[-*]\s+(.*)$")


def render(slug: str, meta: dict[str, str], body: str, ctx: Context | None = None) -> Doc:
    ctx = ctx or Context(slug)
    doc = Doc(slug, meta, ctx)
    lines = body.split("\n")
    i = 0
    n = len(lines)
    para: list[str] = []

    def flush_para() -> None:
        if para:
            doc.emit(f"<p>{inline(' '.join(para).strip())}</p>")
            para.clear()

    def collect_until(closer: str, start: int) -> tuple[list[str], int]:
        """Lines up to a closing marker, tracking nesting of the same marker."""
        depth, buf, j = 1, [], start
        while j < n:
            line = lines[j]
            if line.rstrip() == closer:
                depth -= 1
                if depth == 0:
                    return buf, j + 1
            elif line.startswith(closer) and CALLOUT_OPEN.match(line):
                depth += 1
            buf.append(line)
            j += 1
        raise SystemExit(f"{slug}: unterminated {closer} block")

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # ------------------------------------------------------------ blanks
        if not stripped:
            flush_para()
            i += 1
            continue

        # ---------------------------------------------------------- headings
        m = HEADING.match(line)
        if m:
            flush_para()
            level = len(m.group(1))
            text = m.group(2).strip()
            hid = ctx.heading_id(text, m.group(3))
            doc.headings.append((level, hid, CODE_SPAN.sub(r"\1", text)))
            doc.emit(
                f'<h{level} id="{hid}" class="doc-h">{inline(text)}'
                f'<a class="doc-anchor" href="#{hid}" aria-label="Link to this section">#</a>'
                f"</h{level}>"
            )
            i += 1
            continue

        # -------------------------------------------------------------- rule
        if stripped == "---":
            flush_para()
            doc.emit('<hr class="doc-rule">')
            i += 1
            continue

        # -------------------------------------------------------------- code
        m = FENCE.match(stripped)
        if m:
            flush_para()
            lang, title = m.group(1) or "", (m.group(2) or "").strip()
            buf, i = [], i + 1
            while i < n and lines[i].rstrip() != "```":
                buf.append(lines[i])
                i += 1
            i += 1
            cid = ctx.next_code_id()
            label = title or {"bash": "Terminal", "json": "JSON", "jsonl": "JSONL",
                              "python": "Python", "yaml": "YAML", "text": "Output",
                              "http": "HTTP"}.get(lang, lang or "Code")
            copyable = lang in {"bash", "sh", "json", "jsonl", "python", "yaml", "http", ""}
            code = html.escape("\n".join(buf))
            head = f'<div class="code-head"><span>{html.escape(label)}</span>'
            if copyable:
                head += (
                    f'<button class="copy-btn" type="button" data-copy="#{cid}">'
                    f'<span data-copy-label>Copy</span>'
                    f'<span class="visually-hidden"> {html.escape(label)} block</span></button>'
                )
            head += "</div>"
            doc.emit(
                f'<div class="code doc-code">{head}'
                f'<pre id="{cid}"><code>{code}</code></pre></div>'
            )
            continue

        # ---------------------------------------------------------- callouts
        m = CALLOUT_OPEN.match(stripped)
        if m:
            flush_para()
            kind, title = m.group(1), (m.group(2) or "").strip()
            buf, i = collect_until(":::", i + 1)
            inner = render(slug, meta, "\n".join(buf), ctx)
            doc.headings.extend(inner.headings)
            body_html = inner.html()
            doc.emit(
                f'<aside class="callout callout-{kind}">'
                f'<p class="callout-kind">{html.escape(title or CALLOUT_KINDS[kind])}</p>'
                f"{body_html}</aside>"
            )
            continue

        # -------------------------------------------------------------- tabs
        if stripped == ":::tabs":
            flush_para()
            buf, i = collect_until(":::", i + 1)
            panels: list[tuple[str, list[str]]] = []
            for raw in buf:
                tm = TAB_LABEL.match(raw.strip())
                if tm:
                    panels.append((tm.group(1).strip(), []))
                elif panels:
                    panels[-1][1].append(raw)
            doc.emit('<div class="tabs" data-tabs>')
            for label, content in panels:
                inner = render(slug, meta, "\n".join(content), ctx)
                doc.headings.extend(inner.headings)
                body_html = inner.html()
                doc.emit(
                    f'<section class="tabpanel" data-tab-label="{html.escape(label, quote=True)}">'
                    f'<p class="tabpanel-label">{html.escape(label)}</p>{body_html}</section>'
                )
            doc.emit("</div>")
            continue

        # ------------------------------------------------------------- table
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            flush_para()
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            header, body_rows = rows[0], rows[2:]
            out = ['<div class="table-wrap"><table class="doc-table"><thead><tr>']
            out += [f"<th>{inline(c)}</th>" for c in header]
            out.append("</tr></thead><tbody>")
            for r in body_rows:
                out.append("<tr>")
                for idx, c in enumerate(r):
                    lbl = html.escape(header[idx], quote=True) if idx < len(header) else ""
                    out.append(f'<td data-label="{lbl}">{inline(c)}</td>')
                out.append("</tr>")
            out.append("</tbody></table></div>")
            doc.emit("".join(out))
            continue

        # --------------------------------------------------------- blockquote
        if stripped.startswith("> "):
            flush_para()
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].lstrip())
                i += 1
            inner = render(slug, meta, "\n".join(buf), ctx)
            doc.headings.extend(inner.headings)
            doc.emit(f'<blockquote class="doc-quote">{inner.html()}</blockquote>')
            continue

        # -------------------------------------------------------------- lists
        if UL_ITEM.match(line) or OL_ITEM.match(line):
            flush_para()
            block, base_indent = [], len(line) - len(line.lstrip())
            while i < n and (lines[i].strip() and
                             (UL_ITEM.match(lines[i]) or OL_ITEM.match(lines[i])
                              or len(lines[i]) - len(lines[i].lstrip()) > base_indent)):
                block.append(lines[i])
                i += 1
            doc.emit(render_list(block, base_indent))
            continue

        para.append(stripped)
        i += 1

    flush_para()
    return doc


def render_list(block: list[str], indent: int) -> str:
    """Render one list level, recursing into deeper indentation."""
    ordered = bool(OL_ITEM.match(block[0]))
    items: list[list[str]] = []
    for line in block:
        m = OL_ITEM.match(line) or UL_ITEM.match(line)
        if m and len(line) - len(line.lstrip()) == indent:
            items.append([m.group(3) if OL_ITEM.match(line) else m.group(2)])
        elif items:
            items[-1].append(line)
        # A continuation line before any item cannot happen: the caller only
        # enters here on an item.
    tag = "ol" if ordered else "ul"
    out = [f'<{tag} class="doc-list">']
    for item in items:
        head, rest = item[0], item[1:]
        nested = [r for r in rest if r.strip()]
        if nested and (UL_ITEM.match(nested[0]) or OL_ITEM.match(nested[0])):
            sub_indent = len(nested[0]) - len(nested[0].lstrip())
            out.append(f"<li>{inline(head)}{render_list(nested, sub_indent)}</li>")
        elif nested:
            cont = " ".join(x.strip() for x in nested)
            out.append(f"<li>{inline(head)} {inline(cont)}</li>")
        else:
            out.append(f"<li>{inline(head)}</li>")
    out.append(f"</{tag}>")
    return "".join(out)


Doc.html = lambda self: "\n".join(self.out)  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# The page shell
# ---------------------------------------------------------------------------
#
# ONE HEADER AND ONE FOOTER, HERE. The rest of the site keeps nine hand-typed
# copies (README: "the honest cost of having no build step"). The docs are
# twenty-odd pages, which is past the point where that trade is affordable, so
# the shell is written once and `--check` keeps the committed output equal to
# it.

BRAND = (
    '<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">\n'
    '        <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="#b8ff5a" stroke-width="1.6"/>\n'
    '        <rect x="8" y="8" width="8" height="8" rx="2" fill="#b8ff5a"/>\n'
    "      </svg>"
)

NAV_ITEMS = [
    ("/#home", "For home"),
    ("/#business", "For business"),
    ("/install/", "Install"),
    ("/docs/", "Docs"),
    ("/pricing/", "Pricing"),
    ("/roadmap/", "Roadmap"),
]


def site_header() -> str:
    items = []
    for href, label in NAV_ITEMS:
        cur = ' aria-current="page"' if href == "/docs/" else ""
        items.append(f'        <li><a href="{href}"{cur}>{label}</a></li>')
    nav = "\n".join(items)
    return f'''
<header class="site-header" data-header>
  <div class="wrap">
    <a class="brand" href="/">
      {BRAND}
      Nodeau
    </a>
    <button class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
      <svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <nav class="nav" id="site-nav" data-nav aria-label="Primary">
      <ul>
{nav}
        <li class="nav-signin"><a href="https://app.nodeau.ai/">Sign in</a></li>
      </ul>
    </nav>
    <div class="header-actions">
      <a class="btn btn-ghost btn-sm" href="https://app.nodeau.ai/">Sign in</a>
      <a class="btn btn-primary btn-sm" href="/install/">Install Nodeau</a>
    </div>
  </div>
</header>
'''


SITE_FOOTER = '''
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="brand" href="/" style="margin-bottom:0.75rem">
          ''' + BRAND + '''
          Nodeau
        </a>
        <p style="max-width:34ch">You own the GPUs. Nodeau makes them usable AI infrastructure.</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="/#home">For home</a></li>
          <li><a href="/#business">For business</a></li>
          <li><a href="/pricing/">Pricing</a></li>
          <li><a href="/roadmap/">Roadmap</a></li>
        </ul>
      </div>
      <div>
        <h4>Docs</h4>
        <ul>
          <li><a href="/docs/">Documentation</a></li>
          <li><a href="/docs/install-linux/">Linux install</a></li>
          <li><a href="/docs/install-macos/">macOS install</a></li>
          <li><a href="/docs/cli/">CLI reference</a></li>
          <li><a href="/docs/troubleshooting/">Troubleshooting</a></li>
        </ul>
      </div>
      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="/about/">About</a></li>
          <li><a href="/faq/">FAQ</a></li>
          <li><a href="/contact/">Contact</a></li>
          <li><a href="mailto:founders@nodeau.ai">founders@nodeau.ai</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&#169; <span data-year>2026</span> Nodeau</span>
      <span>Self-hosted <span data-release></span> &#183; your hardware, your models</span>
    </div>
  </div>
</footer>

<div class="toast" data-toast role="status" aria-live="polite"></div>
<script src="/assets/nodeau.js" defer></script>
<script src="/assets/docs.js" defer></script>
</body>
</html>
'''


def sidebar(nav: list[dict], current: str) -> str:
    """The docs navigation, rendered from nav.json and nothing else."""
    out = ['<nav class="doc-nav" aria-label="Documentation">']
    for group in nav:
        gid = slugify(group["group"])
        has_current = any(p["slug"] == current for p in group["pages"])
        open_attr = " open" if has_current else ""
        out.append(f'<details class="doc-group" id="nav-{gid}"{open_attr}>')
        out.append(f'<summary class="doc-group-name">{html.escape(group["group"])}</summary>')
        out.append('<ul class="doc-links">')
        for page in group["pages"]:
            href = "/docs/" if page["slug"] == "overview" else f'/docs/{page["slug"]}/'
            cur = ' aria-current="page"' if page["slug"] == current else ""
            out.append(
                f'<li><a href="{href}"{cur} data-nav-title="{html.escape(page["nav"], quote=True)}">'
                f'{html.escape(page["nav"])}</a></li>'
            )
        out.append("</ul></details>")
    out.append("</nav>")
    return "".join(out)


def on_this_page(doc: Doc) -> str:
    items = [h for h in doc.headings if h[0] == 2]
    if len(items) < 2:
        return ""
    links = "".join(
        f'<li><a href="#{hid}">{html.escape(text)}</a></li>' for _, hid, text in items
    )
    return (
        '<nav class="doc-toc" aria-label="On this page">'
        '<p class="doc-toc-title">On this page</p>'
        f'<ul>{links}</ul></nav>'
    )


def page_html(doc: Doc, nav: list[dict], prev_next: tuple[dict | None, dict | None]) -> str:
    meta, slug = doc.meta, doc.slug
    route = "/docs/" if slug == "overview" else f"/docs/{slug}/"
    title = meta["title"]
    desc = meta["description"]
    if len(desc) > 200:
        raise SystemExit(f"{slug}: meta description is {len(desc)} chars (limit 200)")

    prev_page, next_page = prev_next
    pager = []
    if prev_page:
        href = "/docs/" if prev_page["slug"] == "overview" else f'/docs/{prev_page["slug"]}/'
        pager.append(
            f'<a class="doc-prev" href="{href}"><span>Previous</span>'
            f'{html.escape(prev_page["nav"])}</a>'
        )
    if next_page:
        href = "/docs/" if next_page["slug"] == "overview" else f'/docs/{next_page["slug"]}/'
        pager.append(
            f'<a class="doc-next" href="{href}"><span>Next</span>'
            f'{html.escape(next_page["nav"])}</a>'
        )
    pager_html = f'<nav class="doc-pager" aria-label="Pagination">{"".join(pager)}</nav>' if pager else ""

    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc, quote=True)}">
<link rel="canonical" href="https://nodeau.ai{route}">
<meta name="theme-color" content="#08090b">
<meta property="og:type" content="article">
<meta property="og:url" content="https://nodeau.ai{route}">
<meta property="og:site_name" content="Nodeau">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/nodeau.css">
</head>
<body class="docs-page">
<a class="skip-link" href="#main">Skip to content</a>
{site_header()}
<div class="doc-shell">
  <button class="doc-menu-btn" type="button" data-doc-menu aria-expanded="false" aria-controls="doc-sidebar">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    Docs menu
  </button>
  <aside class="doc-sidebar" id="doc-sidebar" data-doc-sidebar>
    <div class="doc-search">
      <label class="visually-hidden" for="doc-search-input">Search documentation</label>
      <input id="doc-search-input" type="search" placeholder="Search docs" autocomplete="off"
             spellcheck="false" data-doc-search aria-describedby="doc-search-help">
      <p id="doc-search-help" class="visually-hidden">Results appear below as you type.</p>
    </div>
    <div class="doc-results" data-doc-results hidden role="region" aria-live="polite" aria-label="Search results"></div>
    <div data-doc-tree>
      {sidebar(nav, slug)}
    </div>
  </aside>

  <main id="main" class="doc-main">
    <article class="doc-body">
      <p class="eyebrow"><a href="/docs/">Docs</a> &#183; {html.escape(doc.meta.get("group", ""))}</p>
      <h1 class="doc-title">{html.escape(doc.meta.get("heading", title))}</h1>
      <p class="lede doc-lede">{inline(doc.meta.get("lede", desc))}</p>
      {on_this_page(doc)}
      {doc.html()}
      {pager_html}
      <p class="doc-foot">Documentation for the current published build,
      <span data-release>the beta channel</span>. Something here wrong or missing?
      <a href="/contact/?type=install">Tell us</a> &#8212; a report from a machine we have
      never seen is the most useful thing we get.</p>
    </article>
  </main>
</div>
{SITE_FOOTER}'''


# ---------------------------------------------------------------------------
# Search index
# ---------------------------------------------------------------------------
#
# Built from the rendered headings and the plain text under each of them, so it
# cannot list a section that does not exist. Client-side and static: there is no
# backend to add, and a docs search that needs one would be the first server
# this site has ever required.

TAG_RE = re.compile(r"<[^>]+>")


def plain(html_text: str) -> str:
    text = TAG_RE.sub(" ", html_text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def index_entries(doc: Doc) -> list[dict]:
    route = "/docs/" if doc.slug == "overview" else f"/docs/{doc.slug}/"
    body = doc.html()
    # Split the rendered page at its own heading anchors.
    parts = re.split(r'<h([234]) id="([a-z0-9-]+)"', body)
    entries = [{
        "t": doc.meta["heading"] if "heading" in doc.meta else doc.meta["title"],
        "u": route,
        "p": doc.meta["nav"],
        "b": plain(parts[0])[:600],
    }]
    for k in range(1, len(parts), 3):
        hid, chunk = parts[k + 1], parts[k + 2]
        heading = plain(chunk.split("</h", 1)[0])
        rest = chunk.split("</h", 1)[1] if "</h" in chunk else ""
        entries.append({
            "t": heading.rstrip("#").strip(),
            "u": f"{route}#{hid}",
            "p": doc.meta["nav"],
            "b": plain(rest)[:600],
        })
    return entries


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def build() -> dict[str, str]:
    nav = json.loads((SRC / "nav.json").read_text())
    order: list[dict] = []
    for group in nav:
        for page in group["pages"]:
            page["group"] = group["group"]
            order.append(page)

    files: dict[str, str] = {}
    index: list[dict] = []
    known_routes = {"/docs/" if p["slug"] == "overview" else f'/docs/{p["slug"]}/' for p in order}
    anchors: dict[str, set[str]] = {}
    links: list[tuple[str, str]] = []

    docs: list[Doc] = []
    for page in order:
        path = SRC / f'{page["slug"]}.md'
        if not path.exists():
            raise SystemExit(f'nav.json names {page["slug"]}, but {path} does not exist')
        meta, body = split_front_matter(path.read_text())
        meta.setdefault("nav", page["nav"])
        meta["group"] = page["group"]
        doc = render(page["slug"], meta, body)
        docs.append(doc)
        route = "/docs/" if doc.slug == "overview" else f"/docs/{doc.slug}/"
        anchors[route] = doc.ids
        for href in re.findall(r'href="(/docs/[^"]*)"', doc.html()):
            links.append((route, href))

    for pos, doc in enumerate(docs):
        prev_page = order[pos - 1] if pos > 0 else None
        next_page = order[pos + 1] if pos + 1 < len(order) else None
        rel = "index.html" if doc.slug == "overview" else f"{doc.slug}/index.html"
        # Stamped here rather than by a later pass, so the generated pages and
        # the hand-written ones are produced by one function.
        files[rel] = assetstamp.rewrite(page_html(doc, nav, (prev_page, next_page)))
        index.extend(index_entries(doc))

    # Internal /docs links are resolved here as well as by check-site.py, so a
    # broken cross-reference fails the build that produced it rather than a
    # later check somebody may not run.
    problems = []
    for src_route, href in links:
        target, _, frag = href.partition("#")
        target = target or src_route
        if target not in known_routes:
            problems.append(f"{src_route}: link to {href} — no such docs page")
        elif frag and frag not in anchors[target]:
            problems.append(f"{src_route}: link to {href} — no anchor '{frag}' on that page")
    if problems:
        raise SystemExit("broken internal docs links:\n  " + "\n  ".join(problems))

    files["search-index.json"] = json.dumps(index, separators=(",", ":"), ensure_ascii=False)
    return files


# ---------------------------------------------------------------------------
# The sitemap's docs block
# ---------------------------------------------------------------------------
#
# Written from nav.json rather than kept by hand. check-site.py already reports
# an unlisted page, and a warning somebody has to remember to act on is the
# stale row this whole generator exists to avoid — twenty-three of them.

SITEMAP_START = "  <!-- docs:start -->"
SITEMAP_END = "  <!-- docs:end -->"


def sitemap_block(nav: list[dict]) -> str:
    rows = []
    for group in nav:
        for page in group["pages"]:
            route = "/docs/" if page["slug"] == "overview" else f'/docs/{page["slug"]}/'
            priority = "0.9" if page["slug"] == "overview" else "0.7"
            rows.append(
                f'  <url><loc>https://nodeau.ai{route}</loc><priority>{priority}</priority></url>'
            )
    return "\n".join([SITEMAP_START, *rows, SITEMAP_END])


def sitemap_with_docs(nav: list[dict]) -> str:
    path = ROOT / "sitemap.xml"
    current = path.read_text()
    if SITEMAP_START not in current or SITEMAP_END not in current:
        raise SystemExit(
            "sitemap.xml has no docs block. Add these two lines inside <urlset>:\n"
            f"{SITEMAP_START}\n{SITEMAP_END}"
        )
    head = current.split(SITEMAP_START)[0]
    tail = current.split(SITEMAP_END, 1)[1]
    return head + sitemap_block(nav) + tail


def main(argv: list[str]) -> int:
    check = "--check" in argv
    files = build()
    stale = []

    nav = json.loads((SRC / "nav.json").read_text())
    sitemap_path = ROOT / "sitemap.xml"
    wanted_sitemap = sitemap_with_docs(nav)
    if sitemap_path.read_text() != wanted_sitemap:
        stale.append("sitemap.xml")
        if not check:
            sitemap_path.write_text(wanted_sitemap)

    for rel, content in sorted(files.items()):
        path = OUT / rel
        current = path.read_text() if path.exists() else None
        if current == content:
            continue
        stale.append(rel)
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)

    expected = {OUT / rel for rel in files}
    orphans = [
        p for p in OUT.rglob("*")
        if p.is_file() and p not in expected
    ]
    for p in orphans:
        stale.append(str(p.relative_to(OUT)) + " (not generated by docs-src)")
        if not check:
            p.unlink()

    if check:
        if stale:
            print("docs/ is out of date with docs-src/:")
            for s in stale:
                print(f"  {s}")
            print("\nRun: python3 tools/build-docs.py")
            return 1
        print(f"docs/ is current — {len(files) - 1} pages")
        return 0

    print(f"wrote {len(files) - 1} pages + search index to docs/")
    if stale:
        print("changed: " + ", ".join(stale))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
