/* ==========================================================================
   Nodeau — /docs behaviour
   --------------------------------------------------------------------------
   Four things, all progressive enhancements over a page that already works:
   the sidebar drawer on narrow screens, client-side search, platform tabs, and
   highlighting the section you are reading in "On this page".

   No dependencies and no build step, matching the rest of the site. With
   JavaScript disabled: the sidebar is a list of links, search is an input that
   does nothing, BOTH tab panels are visible with their labels as headings, and
   every anchor resolves. Nothing is hidden behind an enhancement that never
   fires.

   Copy buttons are assets/nodeau.js's job; the generator emits the same
   [data-copy] markup the rest of the site uses, so they work here for free.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------ the drawer */

  const menuBtn = document.querySelector("[data-doc-menu]");
  const sidebar = document.querySelector("[data-doc-sidebar]");

  if (menuBtn && sidebar) {
    const setOpen = (open) => {
      menuBtn.setAttribute("aria-expanded", String(open));
      sidebar.dataset.open = String(open);
    };
    setOpen(false);

    menuBtn.addEventListener("click", () => {
      setOpen(menuBtn.getAttribute("aria-expanded") !== "true");
    });

    // Following a link inside the drawer should not leave it open behind the
    // next page, and an in-page anchor would otherwise be covered by it.
    sidebar.addEventListener("click", (e) => {
      if (e.target.closest("a") && window.matchMedia("(max-width: 960px)").matches) {
        setOpen(false);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        menuBtn.focus();
      }
    });

    // Returning to desktop width must clear the mobile state, or the sidebar
    // stays stuck in whichever state the drawer left it.
    const wide = window.matchMedia("(min-width: 961px)");
    wide.addEventListener("change", (e) => { if (e.matches) setOpen(false); });
  }

  /* ------------------------------------------------------------ the search */

  const input = document.querySelector("[data-doc-search]");
  const results = document.querySelector("[data-doc-results]");
  const tree = document.querySelector("[data-doc-tree]");

  if (input && results && tree && window.fetch) {
    let index = null;
    let loading = null;

    const load = () => {
      if (index) return Promise.resolve(index);
      if (!loading) {
        loading = fetch("/docs/search-index.json", { headers: { Accept: "application/json" } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((data) => { index = Array.isArray(data) ? data : []; return index; })
          .catch(() => { index = []; return index; });
      }
      return loading;
    };

    // Loaded on first focus rather than on page load: a reader who never
    // searches never pays for it.
    input.addEventListener("focus", load, { once: true });

    const escape = (s) => s.replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    // Every term must appear somewhere in the entry. Substring rather than
    // whole-word, because the things people search for here are `--gpus`,
    // `GPU_TOO_SMALL` and `nodeau fleet invite`, none of which tokenise the way
    // prose does.
    const score = (entry, terms) => {
      const title = entry.t.toLowerCase();
      const page = entry.p.toLowerCase();
      const body = entry.b.toLowerCase();
      let total = 0;
      for (const term of terms) {
        if (title.includes(term)) total += title.startsWith(term) ? 12 : 8;
        else if (page.includes(term)) total += 4;
        else if (body.includes(term)) total += 2;
        else return 0;
      }
      return total;
    };

    const highlight = (text, terms) => {
      let out = escape(text);
      for (const term of terms) {
        if (term.length < 2) continue;
        const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
        out = out.replace(re, "<mark>$1</mark>");
      }
      return out;
    };

    const render = (query) => {
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) {
        results.hidden = true;
        results.innerHTML = "";
        tree.hidden = false;
        return;
      }
      tree.hidden = true;
      results.hidden = false;

      const hits = (index || [])
        .map((e) => ({ e, s: score(e, terms) }))
        .filter((h) => h.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 25);

      if (!hits.length) {
        results.innerHTML = `<p>Nothing matched &#8220;${escape(query)}&#8221;.</p>`;
        return;
      }
      results.innerHTML = hits
        .map(({ e }) =>
          `<a href="${escape(e.u)}">${highlight(e.t, terms)}<span>${escape(e.p)}</span></a>`)
        .join("");
    };

    let timer;
    input.addEventListener("input", () => {
      const query = input.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => { load().then(() => render(query)); }, 90);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        render("");
        return;
      }
      // Down-arrow moves into the results, so the whole thing is usable from
      // the keyboard without reaching for a mouse.
      if (e.key === "ArrowDown") {
        const first = results.querySelector("a");
        if (first) { e.preventDefault(); first.focus(); }
      }
    });

    results.addEventListener("keydown", (e) => {
      const links = [...results.querySelectorAll("a")];
      const at = links.indexOf(document.activeElement);
      if (at < 0) return;
      if (e.key === "ArrowDown" && links[at + 1]) { e.preventDefault(); links[at + 1].focus(); }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        (at === 0 ? input : links[at - 1]).focus();
      }
      if (e.key === "Escape") { input.focus(); input.value = ""; render(""); }
    });

    // "/" focuses search, the convention every docs site shares — but never
    // while somebody is typing into something else.
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      if (sidebar && menuBtn && window.matchMedia("(max-width: 960px)").matches) {
        menuBtn.setAttribute("aria-expanded", "true");
        sidebar.dataset.open = "true";
      }
      input.focus();
      input.select();
    });
  }

  /* -------------------------------------------------------------- the tabs */

  // A REMEMBERED PLATFORM, not a hidden one. The panels ship visible; this
  // turns them into tabs and picks one. If the URL names an anchor inside a
  // panel, that panel wins over the remembered choice — a deep link has to
  // land on the thing it names.
  const REMEMBERED = "nodeau-docs-platform";

  let remembered = null;
  try { remembered = localStorage.getItem(REMEMBERED); } catch { remembered = null; }

  document.querySelectorAll("[data-tabs]").forEach((group, groupIndex) => {
    const panels = [...group.querySelectorAll(".tabpanel")];
    if (panels.length < 2) return;

    const list = document.createElement("div");
    list.className = "tablist";
    list.setAttribute("role", "tablist");

    const buttons = panels.map((panel, i) => {
      const label = panel.dataset.tabLabel || `Option ${i + 1}`;
      const id = `tab-${groupIndex}-${i}`;
      panel.id = panel.id || `${id}-panel`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", id);
      panel.setAttribute("tabindex", "0");

      const b = document.createElement("button");
      b.type = "button";
      b.id = id;
      b.textContent = label;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", panel.id);
      list.appendChild(b);
      return b;
    });

    const select = (i, remember) => {
      panels.forEach((p, j) => { p.hidden = j !== i; });
      buttons.forEach((b, j) => {
        b.setAttribute("aria-selected", String(j === i));
        b.tabIndex = j === i ? 0 : -1;
      });
      if (remember) {
        try { localStorage.setItem(REMEMBERED, panels[i].dataset.tabLabel || ""); } catch { /* private mode */ }
      }
    };

    buttons.forEach((b, i) => {
      b.addEventListener("click", () => select(i, true));
      b.addEventListener("keydown", (e) => {
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = (i + d + buttons.length) % buttons.length;
        buttons[next].focus();
        select(next, true);
      });
    });

    group.insertBefore(list, group.firstChild);
    group.dataset.enhanced = "true";

    // Precedence: an anchor in the URL, then the remembered platform, then the
    // first panel.
    const frag = decodeURIComponent(window.location.hash.slice(1));
    let chosen = -1;
    if (frag) {
      chosen = panels.findIndex((p) => p.id === frag || p.querySelector(`#${CSS.escape(frag)}`));
    }
    if (chosen < 0 && remembered) {
      chosen = panels.findIndex((p) => p.dataset.tabLabel === remembered);
    }
    select(chosen < 0 ? 0 : chosen, false);
  });

  // A link to something inside a collapsed panel must reveal it. Anchors
  // elsewhere on the page can point into a tab, and a click that appears to do
  // nothing is worse than no link at all.
  const revealAnchor = () => {
    const frag = decodeURIComponent(window.location.hash.slice(1));
    if (!frag) return;
    let target = null;
    try { target = document.getElementById(frag); } catch { return; }
    if (!target) return;
    const panel = target.closest(".tabpanel");
    if (!panel || !panel.hidden) return;
    const button = document.getElementById(panel.getAttribute("aria-labelledby"));
    if (button) {
      button.click();
      target.scrollIntoView();
    }
  };
  window.addEventListener("hashchange", revealAnchor);
  revealAnchor();

  /* --------------------------------------------------- where am I reading? */

  const tocLinks = [...document.querySelectorAll(".doc-toc a")];
  if (tocLinks.length && "IntersectionObserver" in window) {
    const byId = new Map();
    tocLinks.forEach((a) => {
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      const heading = document.getElementById(id);
      if (heading) byId.set(heading, a);
    });

    let current = null;
    const io = new IntersectionObserver(
      (entries) => {
        // The topmost heading that is at or above the reading line wins, which
        // is stabler than "whichever entry fired last".
        const visible = [...byId.keys()]
          .filter((h) => h.getBoundingClientRect().top < window.innerHeight * 0.4);
        const active = visible[visible.length - 1] || null;
        if (active === current) return;
        current = active;
        tocLinks.forEach((a) => a.removeAttribute("aria-current"));
        if (active) byId.get(active).setAttribute("aria-current", "true");
      },
      { rootMargin: "0px 0px -60% 0px", threshold: 0 }
    );
    byId.forEach((_, heading) => io.observe(heading));
  }
})();
