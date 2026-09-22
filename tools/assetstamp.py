"""Content-addressed asset URLs, so a cached stylesheet cannot outlive its HTML.

# The defect this exists for

`/docs` shipped, and returning visitors got the new markup with the OLD
stylesheet: a wall of unstyled text. Reproduced exactly, pixel for pixel.

Nothing was wrong with the deploy. netlify.toml serves HTML as
`max-age=0, must-revalidate` and `/assets/*` as `max-age=3600` — and the asset
filenames never change. So a browser that had visited in the previous hour used
its cached `nodeau.css` without asking the server, while the HTML arrived fresh.
New page, old CSS.

It read as a browser bug because it presents as one: the person's Chrome had the
asset cached and their Safari did not, so one was broken and the other perfect
against the same server.

# The fix, and why it is derived rather than typed

Every reference to a shared asset carries `?v=<first 8 of its sha256>`. Change
the file and every page's URL changes with it, so a stale entry is not found
rather than being trusted.

A hand-typed `?v=2` would work exactly once. The number is computed from the
bytes, applied by tools/stamp-assets.py, emitted by tools/build-docs.py from
this same function, and asserted by tools/check-site.py — so the three cannot
disagree, and forgetting to bump it is not a thing anybody can do.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The shared assets every page links. Listed rather than globbed: a new file
# under assets/ becomes cache-stamped deliberately, not by landing in a
# directory.
ASSETS = ("nodeau.css", "nodeau.js", "docs.js")

# Matches a reference with or without an existing stamp, so rewriting is
# idempotent and a stamp is replaced rather than appended to.
REFERENCE = re.compile(
    r'(/assets/(' + "|".join(re.escape(a) for a in ASSETS) + r'))(\?v=[0-9a-f]+)?'
)

_cache: dict[str, str] = {}


def version(name: str) -> str:
    """The first 8 hex characters of the asset's SHA-256."""
    if name not in _cache:
        path = ROOT / "assets" / name
        _cache[name] = hashlib.sha256(path.read_bytes()).hexdigest()[:8]
    return _cache[name]


def stamped(name: str) -> str:
    """`/assets/nodeau.css?v=1a2b3c4d`."""
    return f"/assets/{name}?v={version(name)}"


def rewrite(html: str) -> str:
    """Point every shared-asset reference at its current content hash."""
    return REFERENCE.sub(lambda m: f"{m.group(1)}?v={version(m.group(2))}", html)
