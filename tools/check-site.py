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
    (r"0\.[67]\.0-phase",
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
     "issue #43: the stronger claim is not exercised on an adopted cluster yet"),
    (r"exactly what it will remove",
     "issue #43: the printed plan is not yet proven against every component"),
    (r"machine it was built on",
     "stale: it has been installed and run on a second machine"),
    (r"Multi-node discovery and placement is the next major platform capability",
     "stale: multi-node discovery and placement is built and validated"),

    # Retired by the 2026-08-13 refresh. The product is described as a product;
    # the roadmap carries the release states. These read as a permanent apology
    # and are not how the site talks about itself any more.
    (r"Self-Hosted Alpha|Experimental Alpha|experimental Alpha",
     "retired positioning: the site names the build, it does not brand itself an alpha"),
    (r"In&nbsp;Alpha|In Alpha",
     "retired label: the roadmap says 'Manual setup' (see the key on /roadmap/)"),
    (r"href=[\"']/alpha/",
     "the install guide moved to /install/; /alpha/ is a redirect, not a link target"),
    (r"[Tt]wo (plans|tiers)",
     "stale: there are three tiers — Home, Home Pro and Business"),
    (r"Next release",
     "stale label: batch, the dashboard, the catalogue and the CLI verbs ship in the "
     "published build now; what remains hands-on is multi-machine, labelled 'Manual setup'"),

    # Retired by Phase 9, which shipped independent multi-GPU per machine in
    # the published build. These sentences UNDERSTATED the product and
    # contradicted the pricing page, which lists two cards in a machine as an
    # included Home Pro capability — so a paying customer reading the FAQ was
    # told they did not have what they had bought.
    (r"[Nn]odeau works with one GPU per machine",
     "stale since Phase 9: every qualified card in a machine is scheduled independently"),
    (r"one GPU per machine, however many machines",
     "stale since Phase 9: Home Pro schedules up to two cards in any one machine"),
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
#
# The multi-machine rule that used to live here is gone, deliberately. It
# required every mention of a second machine to sit beside "not in the public
# installer", which was the right guard while that capability was unproven and
# is now just an apology attached to something that works. What still needs
# qualifying is what Nodeau genuinely does not do — which is the list below.
NEEDS_DISCLAIMER = [
    ("failover", r"not|no\b|does not|will not|never|absent|Planned|pill-planned|unbuilt|nothing"),
    ("heterogeneous", r"pill-inalpha|Manual setup|validated|qualified|reason"),
]
# Measured against the page with its markup stripped, because the distance that
# matters is how far a READER travels between a claim and its qualifier, not how
# many characters of nested <div> sit in between.
DISCLAIMER_WINDOW = 400

# ---------------------------------------------------------------------------
# PLATFORM CLAIMS — the second truthfulness axis
# ---------------------------------------------------------------------------
#
# The capability rules below this were written after the pricing table ticked
# seven Business features that do not exist. They ask "does Nodeau DO this?".
# They have no notion of WHERE it does it, which is why every sentence on the
# site could say Linux-only while the published build ran on Apple Silicon and
# nothing noticed.
#
# The two axes fail in opposite directions and both are live. A capability
# claim overclaims by naming something unbuilt; a platform claim can overclaim
# the same way, but it can equally go STALE and understate — telling a customer
# they cannot do what they have already bought (BUILD_STATE 111.5). So these
# rules run in both directions: strings that must not survive a platform
# shipping, and claims that must never appear at all.
#
# Vocabulary is docs/ROADMAP.md 7's four levels — unsupported, experimental,
# qualified, recommended — used consistently here so the full support matrix,
# which is deferred as its own design task, slots in rather than needing a
# rewrite of everything this touches.

RETIRED_PLATFORM = [
    (r"Linux-first",
     "stale: Apple Silicon is qualified; the footer claim appeared on every page"),
    (r"NVIDIA-only",
     "stale: the native Metal execution plane is qualified on Apple Silicon"),
    (r"no AMD, Intel or Apple GPUs",
     "false: Apple Silicon runs through Metal; AMD and Intel remain unsupported"),
    (r"Unified memory changes the fit calculation",
     "stale FAQ answer: macOS is no longer 'Exploring', it is qualified"),
    (r"Unified memory changes the admission model",
     "stale roadmap entry: macOS is no longer 'Exploring', it is qualified"),
    (r"One GPU per machine",
     "stale since Phase 9: every qualified card in a machine is scheduled independently"),

    # A macOS version floor is an assertion nobody has evidence for. install.sh
    # branches on Darwin/arm64 and never checks a version, and exactly one
    # configuration has run Nodeau — macOS 26.5 on an M3 Pro. Say what was
    # tested; do not print a minimum that implies somebody looked.
    (r"macOS 1[0-9] or later|macOS 1[0-9]\+|requires macOS 1[0-9]",
     "invented version floor: untested is not unsupported, and the installer checks no version"),
]

# Platform claims that are wrong in EVERY context, so a plain match is safe.
# Anything whose truth depends on a nearby qualifier belongs in
# NEEDS_DISCLAIMER instead — a negation like "a Mac cannot join a fleet" must
# not be caught here, and writing it as a forbidden pattern would do exactly
# that.
FORBIDDEN_PLATFORM = [
    (r"(macOS|Apple Silicon) is fully supported|full (macOS|Apple Silicon) support",
     "overclaim: macOS is qualified with named exclusions, not 'fully supported'"),
    (r"(Mac|macOS|Apple Silicon)[^.]{0,40}can join[^.]{0,30}(fleet|cluster)",
     "false: a Mac is a native execution plane and is not a Kubernetes node (issue #93)"),
    (r"multi[- ]GPU on (a )?(Mac|macOS|Apple)",
     "false: multi-GPU per machine is a Linux/NVIDIA capability"),
    (r"batch (inference|jobs?) (works?|runs?|is available) on (a )?(Mac|macOS|Apple)",
     "false: Batch Inference V1 has no darwin implementation and returns a typed error"),
    (r"runs on (any|every) Mac",
     "overclaim: qualified on Apple Silicon only, and on one machine and one model"),
]

# A platform named without its exclusions is the overclaim this whole section
# exists to prevent. The operator chose "qualified" over "experimental", and
# that word is only honest when the same surface says what is excluded.
#
# This is a PER-PAGE rule, not a per-mention one, and the distinction was
# forced by watching it run. Written first as a proximity window like
# NEEDS_DISCLAIMER, it fired on three honest passing mentions — "on a Linux
# machine with an NVIDIA GPU or on an Apple Silicon Mac" — where the page
# already carried the exclusions in full further down. Satisfying it per
# mention would have meant repeating "standalone" into unreadable copy, and
# loosening the regex until those passed would have left a rule that matched
# anything.
#
# "The same surface" is the page. A page that names the platform must also
# state what it excludes, somewhere a reader will meet it. That is strictly
# stronger than the window in one respect — a far-off footer mention no longer
# passes just because a qualifier happens to sit within 400 characters of it —
# and weaker in none that matter, because a page cannot mention the platform
# and omit the exclusions entirely, which is the failure being guarded.
PLATFORM_WORDS = r"Apple Silicon|Metal|macOS"
PLATFORM_EXCLUSIONS = (
    r"standalone|cannot join|not a Kubernetes|Linux-only|Linux only|"
    r"batch inference is|does not join|unsupported"
)

# Content the site must not lose. The roadmap is the one page that carries the
# full picture, so the exact limits of what multi-machine operation has shown
# live there and nowhere else. If a future edit trims them, every other page
# becomes an overclaim by omission — so they are asserted rather than trusted.
REQUIRED = [
    # THE SUPPORT MATRIX IS AN EXIT CRITERION, NOT A PAGE DECORATION.
    #
    # docs/ROADMAP.md §7 asks for two things and they are joined by "and": a
    # second platform reaching meaningful product quality, AND a support matrix
    # distinguishing unsupported · experimental · qualified · recommended.
    # Deleting the table would un-meet half a phase's exit criterion silently,
    # with every other page still reading correctly — so the four level names
    # and the rows that carry the exclusions are asserted rather than trusted.
    #
    # "Batch inference" is required on the install page because it is the one
    # §7.1 parity item with no darwin implementation. A matrix that stopped
    # listing it would not become wrong sentence by sentence; it would become
    # wrong by omission, which is the failure this whole file exists to catch.
    ("install/index.html", "What runs where",
     "the support matrix section itself must remain — its heading is the one string unique to it"),
    ("install/index.html", "Recommended",
     "the support matrix must keep the level that means 'what we run and measure'"),
    ("install/index.html", "Qualified",
     "the support matrix must keep the level Apple Silicon sits at"),
    ("install/index.html", "Experimental",
     "the four levels are the exit criterion; a level with nothing in it is still a level"),
    ("install/index.html", "Unsupported",
     "the support matrix must keep the level that means Nodeau refuses rather than half-works"),
    ("install/index.html", "Batch inference",
     "the matrix must keep the row naming the one capability a Mac does not have"),
    ("install/index.html", "runs standalone",
     "the matrix must keep the row saying a Mac does not join a fleet"),

    ("roadmap/index.html", "Nodeau does not do this",
     "the roadmap must say plainly that failover does not exist"),
    ("roadmap/index.html", "no automatic failover",
     "the roadmap must state the limit next to the multi-machine capabilities"),
    ("roadmap/index.html", "Manual setup",
     "the roadmap must keep the state for things that ship but are not yet one command"),
    ("roadmap/index.html", "Available",
     "the roadmap must keep the state that means 'in the published build'"),

    # The marketing pages describe the product; the FAQ and the About page are
    # where somebody goes to find the edges. Both must keep the one boundary a
    # reader could otherwise build on and get hurt by.
    ("faq/index.html", "does not fail over on its own",
     "the FAQ must answer the failover question honestly"),
    ("about/index.html", "does not fail over on its own",
     "About must keep the sentence that says what Nodeau will not pretend"),

    # Three tiers, since 2026-08-12. A pricing page that quietly loses the
    # middle one takes Home Pro's whole audience with it.
    ("pricing/index.html", "Home Pro",
     "pricing must show all three tiers"),
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


# ---------------------------------------------------------------------------
# The pricing comparison table must not promise Business what Home Pro admits
# is unbuilt.
# ---------------------------------------------------------------------------
#
# Business includes everything Home Pro includes, plus organisational
# capabilities. So a row that reads "Coming soon" under Home Pro and "Included"
# under Business is describing a capability that is not built for one tier and
# somehow shipped for the other. That cannot be true, and it is exactly what the
# page said for seven rows: role-based access control, single sign-on, quotas,
# audit history, fleet policy, priority queues and shared ownership all carried
# a tick under Business while none of them existed.
#
# Business is not on sale, so nobody could be charged on the claim — but a
# design partner reading the page was being told the tier already did things it
# could not do, and the same page marked Home Pro's unbuilt items honestly two
# columns to the left.
#
# Checked structurally rather than by phrase, because the defect is a
# RELATIONSHIP between cells and any wording of it is equally wrong.

ROW = re.compile(r"<tr>\s*<th scope=\"row\">(.*?)</th>(.*?)</tr>", re.S)
CELL = re.compile(r"<td class=\"([a-z][a-z-]*)[^\"]*\"[^>]*>(.*?)</td>", re.S)


def comparison_rows(src: str) -> list[tuple[str, list[str]]]:
    """Return (row label, [class per column]) for every three-column row."""
    out = []
    for label, body in ROW.findall(src):
        cells = CELL.findall(body)
        if len(cells) != 3:
            continue
        out.append((re.sub(r"<[^>]+>", "", label).strip(), [c for c, _ in cells]))
    return out


# Capabilities Nodeau has NAMED and not BUILT.
#
# Mirrors internal/entitlement/delivery.go in the product repository, which is
# the authority: every feature there declares Delivered or Planned, and no plan
# may grant one that is not Delivered (issue #74). This list is the site's copy,
# because the two repositories do not share code — so it has to be updated when
# a capability ships, and the roadmap page is the reminder: a row here that the
# roadmap marks Available is a contradiction the next check catches.
#
# The failure this prevents is precise. The pricing table showed a tick under
# Business for seven capabilities that do not exist — role-based access control,
# single sign-on, quotas, audit history, fleet policy, priority queues, shared
# ownership — while marking Home Pro's unbuilt items honestly two columns to the
# left. Business is not on sale, so nobody could be charged on the claim, but a
# design partner reading it was told the tier already did things it cannot do.
NOT_BUILT = {
    "organisations and shared ownership",
    "role-based access control",
    "single sign-on",
    "quotas",
    "quotas and fleet policy",
    "audit history",
    "fleet policy",
    "priority queues",
    "advanced scheduling controls",
    "scheduled and overnight batch",
    "remote dashboard and management",
    "model replication across machines",
}


def check_unbuilt_is_never_included(name: str, src: str, errors: list[str]) -> None:
    """No capability that does not exist may be shown as included, in any tier."""
    for label, classes in comparison_rows(src):
        if label.strip().lower() not in NOT_BUILT:
            continue
        for column, cls in zip(("Home", "Home Pro", "Business"), classes):
            if cls == "c-yes":
                errors.append(
                    f"{name}: the row {label!r} is shown as INCLUDED for {column}, and that "
                    "capability is not built. Mark it 'Coming soon' (c-soon), or — if it "
                    "has shipped — remove it from NOT_BUILT here and from the Planned "
                    "section of the roadmap."
                )


def check_tier_consistency(name: str, src: str, errors: list[str]) -> None:
    for label, classes in comparison_rows(src):
        home, home_pro, business = classes
        if home_pro == "c-soon" and business == "c-yes":
            errors.append(
                f"{name}: the row {label!r} is 'Coming soon' for Home Pro and 'Included' "
                "for Business. Business includes everything Home Pro does, so a "
                "capability that is unbuilt for one cannot have shipped for the other."
            )
        if home == "c-yes" and business in {"c-no", "c-soon"}:
            errors.append(
                f"{name}: the row {label!r} is included in free Home and not in Business. "
                "Nothing is ever withheld from a paid tier."
            )


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    # The marketing site only. `app/` is the account application: a second
    # Netlify site, with its own toolchain, its own tests and — once anyone has
    # run `npm ci` — several hundred vendored HTML files that are none of this
    # checker's business. Excluding the directory rather than just
    # node_modules/dist keeps that boundary explicit.
    skip = {".git", "app", "node_modules", "dist"}
    html_files = sorted(
        p for p in ROOT.rglob("*.html") if not (skip & set(p.relative_to(ROOT).parts))
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

        check_unbuilt_is_never_included(name, src, errors)
        check_tier_consistency(name, src, errors)

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
        for pattern, why in RETIRED_PLATFORM:
            for m in re.finditer(pattern, src):
                errors.append(f"{name}: retired platform claim {m.group(0)!r} — {why}")
        for pattern, why in FORBIDDEN:
            for m in re.finditer(pattern, src, re.IGNORECASE):
                errors.append(f"{name}: forbidden claim {m.group(0)!r} — {why}")
        for pattern, why in FORBIDDEN_PLATFORM:
            for m in re.finditer(pattern, src, re.IGNORECASE):
                errors.append(f"{name}: forbidden platform claim {m.group(0)!r} — {why}")

        # A loaded word is fine as long as the sentence around it does the
        # qualifying. Checking a window rather than the word itself is what
        # keeps this from firing on every honest mention.
        plain = text_of(src)
        # Per-page: naming a platform obliges the page to say what it excludes.
        if re.search(PLATFORM_WORDS, plain, re.IGNORECASE) and not re.search(
                PLATFORM_EXCLUSIONS, plain, re.IGNORECASE):
            errors.append(
                f"{name}: names a platform but states no exclusions — "
                "a page that says where Nodeau runs must say what it does not do there")
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
