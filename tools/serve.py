#!/usr/bin/env python3
"""Serve the site locally the way Netlify serves it, closely enough to test.

    python3 tools/serve.py            # http://127.0.0.1:8080
    python3 tools/serve.py 8123

Three behaviours `python3 -m http.server` lacks, each of which a page depends on:

  - /channel/beta.json is PROXIED to get.nodeau.ai, as netlify.toml does, so
    every [data-release] slot fills with the live version locally too;
  - a missing path is answered with /404.html and status 404;
  - the repository files netlify.toml hides (README.md, tools/, docs-src/) 404.

Standard library only. For local preview and tools/site-audit.mjs, never for
production: Netlify serves the real site and netlify.toml is its configuration.
"""

from __future__ import annotations

import http.server
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HIDDEN = ("/README.md", "/tools/", "/docs-src/", "/netlify.toml", "/.gitignore", "/.git/")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, *args) -> None:  # quiet by default
        pass

    def not_found(self) -> None:
        body = (ROOT / "404.html").read_bytes()
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/channel/beta.json":
            try:
                with urllib.request.urlopen("https://get.nodeau.ai/channel/beta.json", timeout=10) as r:
                    body = r.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                self.send_error(502)
            return
        if path.startswith(HIDDEN) or path.startswith("/app/"):
            self.not_found()
            return
        target = ROOT / path.lstrip("/")
        if target.is_dir():
            if not path.endswith("/"):
                self.send_response(301)
                self.send_header("Location", path + "/")
                self.end_headers()
                return
            target = target / "index.html"
        if not target.exists():
            self.not_found()
            return
        super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"serving {ROOT} at http://127.0.0.1:{port}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
