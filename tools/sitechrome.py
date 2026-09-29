"""The site's header and footer, written once.

Every page on nodeau.ai carries the same header and footer. Until 2026-09-29
there were eleven hand-typed copies of each (nine marketing pages, plus the two
inside tools/build-docs.py), and a navigation change meant editing all of them
and hoping. So the shell lives here:

  - tools/build-docs.py renders it into every generated /docs page;
  - tools/sync-chrome.py writes it into every hand-written page, between the
    `<header class="site-header"` and `</header>` tags and between
    `<footer class="site-footer">` and `</footer>`;
  - tools/check-site.py runs `sync-chrome.py --check`, so a page whose copy has
    drifted fails the site check instead of reaching a visitor.

Standard library only, like everything else in tools/.
"""

from __future__ import annotations

BRAND_MARK = (
    '<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    '<rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="#b8ff5a" stroke-width="1.6"/>'
    '<rect x="8" y="8" width="8" height="8" rx="2" fill="#b8ff5a"/>'
    "</svg>"
)

# The primary navigation. Install is deliberately the button, not a nav item:
# it is the one action the whole site is asking for.
NAV = [
    ("/product/", "Product"),
    ("/business/", "Business"),
    ("/docs/", "Docs"),
    ("/pricing/", "Pricing"),
    ("/roadmap/", "Roadmap"),
]

APP = "https://app.nodeau.ai/"


def _current(href: str, route: str) -> bool:
    if href == "/docs/":
        return route.startswith("/docs/")
    return href == route


def header(route: str) -> str:
    """The sticky site header, with aria-current on the section being read."""
    items = []
    for href, label in NAV:
        cur = ' aria-current="page"' if _current(href, route) else ""
        items.append(f'        <li><a href="{href}"{cur}>{label}</a></li>')
    get_cur = ' aria-current="page"' if route == "/install/" else ""
    return (
        '<header class="site-header" data-header>\n'
        '  <div class="wrap">\n'
        f'    <a class="brand" href="/" aria-label="Nodeau home">{BRAND_MARK}<span>Nodeau</span></a>\n'
        '    <button class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">\n'
        '      <svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>\n'
        '      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>\n'
        '    </button>\n'
        '    <nav class="nav" id="site-nav" data-nav aria-label="Primary">\n'
        '      <ul>\n'
        + "\n".join(items) + "\n"
        f'        <li class="nav-mobile-only"><a href="/install/"{get_cur}>Install</a></li>\n'
        f'        <li class="nav-signin"><a href="{APP}">Sign in</a></li>\n'
        '      </ul>\n'
        '    </nav>\n'
        '    <div class="header-actions">\n'
        f'      <a class="btn btn-ghost btn-sm" href="{APP}">Sign in</a>\n'
        '      <a class="btn btn-primary btn-sm" href="/install/">Get Nodeau</a>\n'
        '    </div>\n'
        '  </div>\n'
        '</header>'
    )


FOOTER_COLUMNS = [
    ("Product", [
        ("/product/", "What Nodeau does"),
        ("/business/", "For business"),
        ("/pricing/", "Pricing"),
        ("/roadmap/", "Roadmap"),
        ("/install/", "Get Nodeau"),
    ]),
    ("Docs", [
        ("/docs/", "Documentation"),
        ("/docs/install-linux/", "Install on Linux"),
        ("/docs/install-macos/", "Install on a Mac"),
        ("/docs/api/", "The API"),
        ("/docs/cli/", "CLI reference"),
        ("/docs/troubleshooting/", "Troubleshooting"),
    ]),
    ("Company", [
        ("/about/", "About"),
        ("/faq/", "FAQ"),
        ("/contact/", "Contact"),
        ("/docs/security/", "Security and privacy"),
        ("mailto:founders@nodeau.ai", "founders@nodeau.ai"),
    ]),
]


def footer() -> str:
    """The site footer. The release comes from the live channel, never typed."""
    cols = []
    for title, links in FOOTER_COLUMNS:
        lis = "\n".join(f'          <li><a href="{h}">{t}</a></li>' for h, t in links)
        cols.append(
            "      <div>\n"
            f"        <h2 class=\"footer-title\">{title}</h2>\n"
            "        <ul>\n" + lis + "\n        </ul>\n"
            "      </div>"
        )
    return (
        '<footer class="site-footer">\n'
        '  <div class="wrap">\n'
        '    <div class="footer-grid">\n'
        '      <div class="footer-brand">\n'
        f'        <a class="brand" href="/" aria-label="Nodeau home">{BRAND_MARK}<span>Nodeau</span></a>\n'
        '        <p>Your GPUs. One private AI cloud.</p>\n'
        '      </div>\n'
        + "\n".join(cols) + "\n"
        '    </div>\n'
        '    <div class="footer-bottom">\n'
        '      <span>&#169; <span data-year>2026</span> Nodeau</span>\n'
        '      <span><span data-release-note hidden>Current release <span data-release></span> &#183; </span>Runs on hardware you own</span>\n'
        '    </div>\n'
        '  </div>\n'
        '</footer>'
    )
