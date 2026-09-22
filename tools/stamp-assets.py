#!/usr/bin/env python3
"""Stamp every page's shared-asset URLs with the asset's content hash.

    python3 tools/stamp-assets.py           # rewrite the HTML
    python3 tools/stamp-assets.py --check   # fail if any page is unstamped or stale

Run this after changing assets/nodeau.css, assets/nodeau.js or assets/docs.js.
tools/check-site.py runs `--check`, so a page referencing a version of an asset
that no longer exists fails the site check rather than reaching a visitor whose
browser still has the old one.

tools/build-docs.py stamps the pages it generates from the same function, so
this script only has to handle the hand-written pages — but it walks all of
them, which is what makes the two agreeing something that is asserted rather
than assumed.

See tools/assetstamp.py for why the version is derived from the bytes.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assetstamp  # noqa: E402

ROOT = assetstamp.ROOT

# `app/` is the account application: a separate Netlify site with its own
# toolchain and its own hashed bundles. Same boundary check-site.py draws.
SKIP = {".git", "app", "node_modules", "dist"}


def pages() -> list[Path]:
    return sorted(
        p for p in ROOT.rglob("*.html")
        if not (SKIP & set(p.relative_to(ROOT).parts))
    )


def main(argv: list[str]) -> int:
    check = "--check" in argv
    stale: list[str] = []

    for page in pages():
        before = page.read_text()
        after = assetstamp.rewrite(before)
        if before == after:
            continue
        stale.append(str(page.relative_to(ROOT)))
        if not check:
            page.write_text(after)

    if check:
        if stale:
            print("these pages reference an asset version that is not current:")
            for s in stale:
                print(f"  {s}")
            print("\nRun: python3 tools/stamp-assets.py")
            return 1
        print(f"{len(pages())} pages carry the current asset stamps "
              + " ".join(f"{a}={assetstamp.version(a)}" for a in assetstamp.ASSETS))
        return 0

    print(f"stamped {len(pages())} pages · " +
          " ".join(f"{a}={assetstamp.version(a)}" for a in assetstamp.ASSETS))
    if stale:
        print("updated: " + ", ".join(stale))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
