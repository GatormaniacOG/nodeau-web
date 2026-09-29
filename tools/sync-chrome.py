#!/usr/bin/env python3
"""Write the shared header and footer into every hand-written page.

    python3 tools/sync-chrome.py           # rewrite the pages
    python3 tools/sync-chrome.py --check   # fail if any page has drifted

The header and footer live in tools/sitechrome.py. This replaces everything from
`<header class="site-header"` to `</header>` and from `<footer class="site-footer">`
to `</footer>` in each page outside /docs (which tools/build-docs.py generates
from the same module), so a navigation change is one edit rather than eleven.

A page with no header or no footer is reported rather than skipped: a page that
silently opts out of the shell is the drift this exists to prevent.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sitechrome  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SKIP = {".git", "app", "node_modules", "dist", "docs"}

HEADER = re.compile(r'<header class="site-header".*?</header>', re.S)
FOOTER = re.compile(r'<footer class="site-footer">.*?</footer>', re.S)


def route_of(path: Path) -> str:
    rel = path.relative_to(ROOT)
    if rel.name == "index.html":
        parent = rel.parent.as_posix()
        return "/" if parent == "." else f"/{parent}/"
    return f"/{rel.as_posix()}"


def pages() -> list[Path]:
    return sorted(
        p for p in ROOT.rglob("*.html")
        if not (SKIP & set(p.relative_to(ROOT).parts))
    )


def synced(path: Path) -> str:
    src = path.read_text()
    route = route_of(path)
    if not HEADER.search(src) or not FOOTER.search(src):
        raise SystemExit(f"{path.relative_to(ROOT)}: no site header or footer to replace")
    src = HEADER.sub(lambda _: sitechrome.header(route), src, count=1)
    src = FOOTER.sub(lambda _: sitechrome.footer(), src, count=1)
    return src


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale = []
    for page in pages():
        want = synced(page)
        if page.read_text() != want:
            stale.append(str(page.relative_to(ROOT)))
            if not check:
                page.write_text(want)
    if check:
        if stale:
            print("these pages carry a header or footer that differs from tools/sitechrome.py:")
            for s in stale:
                print(f"  {s}")
            print("\nRun: python3 tools/sync-chrome.py")
            return 1
        print(f"{len(pages())} pages carry the shared header and footer")
        return 0
    print(f"synced {len(pages())} pages" + (f" · updated: {', '.join(stale)}" if stale else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
