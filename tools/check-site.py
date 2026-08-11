#!/usr/bin/env python3
"""Structural and editorial checks for the Nodeau marketing site.

The site has no build step on purpose (see README), so there is no framework
to catch a broken link, an undefined CSS class or a claim that stopped being
true. This script is that safety net. Standard library only — a checker that
needs `pip install` would be the toolchain the site was designed to avoid.

    python3 tools/check-site.py

It reports every problem it finds and exits non-zero if any are errors.
"""

from __future__ import annotations

import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Phrases retired by a refresh, kept here so they cannot quietly return. Each
# entry is (pattern, why it is wrong now). Matched case-insensitively against
# the rendered-ish source of every page.
RETIRED = [
    (r"v0\.1\.0-alpha\.[0-9]",
     "hard-coded version; use <span data-release></span> (RELEASE lives in assets/nodeau.js)"),
    (r"0\.6\.0-phase",
     "development build number must never appear on the public site"),
    (r"[Ss]ingle GPU today",
     "stale: the control plane reasons across more than one machine"),
    (r"while multi-node is built",
     "stale: the multi-node foundation is built and validated"),
    (r"measured, not estimated",
     "false: Nodeau estimates conservatively on unmeasured hardware and labels it"),
    (r"refuses configurations it has not measured",
     "false since the estimator shipped; it estimates and says so"),
    (r"[Nn]odeau refuses to guess",
     "overstated: it estimates when it must, and reports the source"),
    (r"removes only its own work",
     "issue #43: uninstall under-removes on adopted Kubernetes; claim not guaranteed"),
    (r"exactly what it will remove",
     "issue #43: the printed plan can name components no code path deletes"),
    (r"machine it was built on",
     "stale: it has been installed and run on a second machine"),
    (r"Multi-node discovery and placement is the next major platform capability",
     "stale: multi-node discovery and placement is built and validated"),
    (r"Heterogeneous fleet scheduling is <strong>Planned</strong>",
     "stale: heterogeneous reasoning is In Alpha"),
]

# Claims that must never appear, regardless of refresh. These are capabilities
# Nodeau does not have; wording that implies them is a defect, not a style nit.
#
# This list carries more weight than it looks. The marketing pages deliberately
# no longer enumerate how shallow the testing is, which is a fair editorial
# choice — but it removes the caveats that used to stop a confident sentence
# from reading as a bigger claim than the evidence supports. The guard is now
# the thing keeping that line, so it is stricter than it was.
FORBIDDEN = [
    (r"production[- ]proven|battle[- ]tested|enterprise[- ]grade",
     "unsupportable maturity claim"),
    (r"every NVIDIA (GPU|card) (works|is supported)",
     "no such claim: two cards have been run on, the rest are estimated"),
    (r"failover works|supports failover|failover across",
     "Nodeau has no failover of any kind"),

    # Nodeau DECIDES between machines. It has never STARTED a workload on the
    # second one. "reasons across" and "decides between" are true; anything
    # that puts the workload itself on several machines is not.
    (r"runs? (your )?(workloads?|models?|inference) across",
     "workloads do not run across machines; Nodeau reasons across and decides between them"),
    (r"(spread|distribute|balance)s? .{0,24}across (machines|GPUs|nodes|your fleet)",
     "Nodeau does not spread, distribute or balance work across machines"),
    (r"across your (whole )?fleet|manage your fleet|fleet management is",
     "fleet-scale operation is unbuilt; do not write as though it ships"),
    (r"scales? to (dozens|hundreds|any number)",
     "no scale claim is supportable"),
    (r"automatically (moves?|migrates?|recovers?|reschedules?)",
     "Nodeau never moves a workload on its own"),
]

# Words that are only safe next to a disclaimer. A bare mention reads as a
# feature; the check is that a negation or a roadmap label sits close by.
NEEDS_DISCLAIMER = [
    ("failover", r"not|no\b|does not|will not|never|absent|Planned|pill-planned|unbuilt|nothing"),
    ("heterogeneous", r"In&nbsp;Alpha|In Alpha|pill-inalpha|validated|reason"),
    # Multi-machine capability must always sit next to its status label. The
    # marketing pages carry no other reminder that it is not installable.
    ("more than one (GPU )?machine",
     r"In Alpha|not yet|not in the public|on purpose|sets up one machine"),
]
# Measured against the page with its markup stripped, because the distance that
# matters is how far a READER travels between a claim and its qualifier, not how
# many characters of nested <div> sit in between.
DISCLAIMER_WINDOW = 400

# Content the site must not lose. The roadmap is the one page that carries the
# full picture, so the exact limits of what multi-machine operation has shown
# live there and nowhere else. If a future edit trims them, every other page
# becomes an overclaim by omission — so they are asserted rather than trusted.
REQUIRED = [
    ("roadmap/index.html", "has not been started on the second GPU",
     "the roadmap must keep the exact limit of what multi-machine has shown"),
    ("roadmap/index.html", "Nodeau does not do this",
     "the roadmap must say plainly that failover does not exist"),
    ("roadmap/index.html", "In Alpha",
     "the roadmap must keep the In Alpha state"),
]


def text_of(html: str) -> str:
    """The page as a reader sees it: no tags, no entities, single spaces."""
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = (t.replace("&nbsp;", " ").replace("&amp;", "&")
          .replace("&lt;", "<").replace("&gt;", ">").replace("&#39;", "'"))
    return re.sub(r"\s+", " ", t).strip()


class Page(HTMLParser):
    """Collects the handful of facts the checks need from one page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.titles: list[str] = []
        self._in_title = False
        self.ids: set[str] = set()
        self.classes: set[str] = set()
        self.links: list[str] = []
        self.metas: dict[str, str] = {}
        self.canonical: str | None = None
        self.doctypes = 0

    def handle_decl(self, decl: str) -> None:
        if decl.lower().startswith("doctype"):
            self.doctypes += 1

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}

        if tag == "title":
            self._in_title = True
        if "id" in a:
            self.ids.add(a["id"])
        if "class" in a:
            self.classes.update(a["class"].split())
        if tag == "a" and "href" in a:
            self.links.append(a["href"])
        if tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.metas[key] = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.titles.append(data.strip())


def route_of(path: Path) -> str:
    """The public URL path a file is served at."""
    rel = path.relative_to(ROOT)
    if rel.name == "index.html":
        parent = rel.parent.as_posix()
        return "/" if parent == "." else f"/{parent}/"
    return f"/{rel.as_posix()}"


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    html_files = sorted(
        p for p in ROOT.rglob("*.html") if ".git" not in p.parts
    )
    if not html_files:
        print("no HTML files found — wrong directory?")
        return 2

    css = (ROOT / "assets" / "nodeau.css").read_text()
    defined_classes = set(re.findall(r"\.([A-Za-z][\w-]*)", css))

    pages: dict[str, Page] = {}
    sources: dict[str, str] = {}

    for f in html_files:
        src = f.read_text()
        p = Page()
        p.feed(src)
        route = route_of(f)
        pages[route] = p
        sources[route] = src
        name = str(f.relative_to(ROOT))

        # ---------------------------------------------------------- structure
        if p.doctypes != 1:
            errors.append(f"{name}: expected exactly one doctype, found {p.doctypes}")
        if len(p.titles) != 1 or not p.titles[0]:
            errors.append(f"{name}: expected exactly one non-empty <title>")
        elif len(p.titles[0]) > 70:
            warnings.append(f"{name}: <title> is {len(p.titles[0])} chars (>70 truncates in search)")

        desc = p.metas.get("description", "")
        if not desc:
            errors.append(f"{name}: no meta description")
        elif len(desc) > 200:
            warnings.append(f"{name}: meta description is {len(desc)} chars")

        for required in ("og:title", "og:description", "og:url", "og:type", "og:site_name"):
            if required not in p.metas:
                errors.append(f"{name}: missing {required}")

        if not p.canonical:
            errors.append(f"{name}: no canonical link")
        elif f.name != "404.html" and not p.canonical.endswith(route):
            errors.append(f"{name}: canonical {p.canonical} does not match route {route}")

        # OG title should not silently drift from the page title.
        if p.titles and p.metas.get("og:title") and p.metas["og:title"] != p.titles[0]:
            warnings.append(f"{name}: og:title differs from <title>")

        # ------------------------------------------------------------ classes
        for cls in sorted(p.classes - defined_classes):
            errors.append(f"{name}: class '{cls}' is used but not defined in nodeau.css")

        # ------------------------------------------------------------ content
        for pattern, why in RETIRED:
            for m in re.finditer(pattern, src):
                errors.append(f"{name}: retired phrase {m.group(0)!r} — {why}")
        for pattern, why in FORBIDDEN:
            for m in re.finditer(pattern, src, re.IGNORECASE):
                errors.append(f"{name}: forbidden claim {m.group(0)!r} — {why}")

        # A loaded word is fine as long as the sentence around it does the
        # qualifying. Checking a window rather than the word itself is what
        # keeps this from firing on every honest mention.
        plain = text_of(src)
        for word, disclaimer in NEEDS_DISCLAIMER:
            for m in re.finditer(word, plain, re.IGNORECASE):
                lo = max(0, m.start() - DISCLAIMER_WINDOW)
                window = plain[lo:m.end() + DISCLAIMER_WINDOW]
                if not re.search(disclaimer, window, re.IGNORECASE):
                    errors.append(
                        f"{name}: {m.group(0)!r} appears with no qualifier nearby "
                        f"(…{plain[max(0, m.start() - 60):m.end() + 60]}…)"
                    )

        # Every page must be able to render its version from the single source.
        if "data-release" not in src and f.name not in {"404.html"}:
            warnings.append(f"{name}: no [data-release] slot; footer version will be missing")

    # ------------------------------------------------------------------ links
    for route, p in pages.items():
        for href in p.links:
            if href.startswith(("http://", "https://", "mailto:", "tel:")):
                continue
            target, _, frag = href.partition("#")
            # /contact/?type=business is one page with a deep-link parameter,
            # not a distinct route.
            target = target.split("?", 1)[0] or route

            if target not in pages:
                errors.append(f"{route}: link to {href} — no such page")
                continue
            if frag and frag not in pages[target].ids:
                errors.append(f"{route}: link to {href} — no element with id '{frag}'")

    # --------------------------------------------------------------- required
    for rel, needle, why in REQUIRED:
        f = ROOT / rel
        if not f.exists():
            errors.append(f"{rel}: missing, but REQUIRED content is asserted against it")
        elif needle.lower() not in text_of(f.read_text()).lower():
            errors.append(f"{rel}: lost required content {needle[:48]!r} — {why}")

    # ---------------------------------------------------------------- sitemap
    sitemap = (ROOT / "sitemap.xml").read_text()
    listed = set(re.findall(r"<loc>https://nodeau\.ai(/[^<]*)</loc>", sitemap))
    # /thanks/ is a form-submission landing page and 404.html is an error page;
    # neither is a destination anyone should arrive at from search.
    unlisted_by_design = {"/thanks/", "/404.html"}
    public = {r for r in pages if r not in unlisted_by_design}
    for missing in sorted(public - listed):
        warnings.append(f"sitemap.xml: {missing} is not listed")
    for extra in sorted(listed - public):
        errors.append(f"sitemap.xml: {extra} is listed but no page exists")

    # ----------------------------------------------------------------- report
    for w in warnings:
        print(f"warn  {w}")
    for e in errors:
        print(f"ERROR {e}")

    print(
        f"\n{len(html_files)} pages · {len(errors)} error(s) · {len(warnings)} warning(s)"
    )
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
