/* ==========================================================================
   Nodeau — site behaviour
   --------------------------------------------------------------------------
   Four small things: the header border on scroll, the mobile navigation, copy
   buttons, and a reveal-on-scroll that is skipped entirely when the visitor
   has asked for reduced motion.

   No dependencies and no build step, matching the rest of the site. Everything
   degrades: with JavaScript disabled the navigation is still a list of links,
   the code blocks are still selectable text, and nothing is hidden behind a
   reveal that never fires.
   ========================================================================== */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------- header */

  const header = document.querySelector("[data-header]");
  if (header) {
    const onScroll = () => {
      header.dataset.scrolled = String(window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ------------------------------------------------------------ mobile nav */

  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");

  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      nav.dataset.open = String(open);
      // The label changes with the state so a screen reader announces what the
      // button will do next, not what it did last.
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    setOpen(false);

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Escape closes and returns focus, which is the one keyboard behaviour
    // people actually expect from a disclosure menu.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        toggle.focus();
      }
    });

    // Following a link inside the panel should not leave it hanging open
    // behind the next page, and in-page anchors would otherwise be covered.
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });

    // Returning to desktop width must clear the mobile state, or the panel
    // stays stuck open as an odd strip under the header.
    const wide = window.matchMedia("(min-width: 861px)");
    const onWide = (e) => { if (e.matches) setOpen(false); };
    wide.addEventListener("change", onWide);
  }

  /* --------------------------------------------------------------- copying */

  const toast = document.querySelector("[data-toast]");
  let toastTimer;

  const announce = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.dataset.show = "false"; }, 2200);
  };

  // The clipboard API needs a secure context. On plain http — someone previewing
  // the site locally — it simply is not there, so the fallback selects the text
  // and says so rather than failing silently.
  const legacyCopy = (text) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    document.body.removeChild(area);
    return ok;
  };

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      // Prefer the target block's text over a duplicated attribute: the command
      // people copy is then guaranteed to be the command they can see, which is
      // not true when the two are maintained separately.
      const targetSel = button.getAttribute("data-copy");
      const target = targetSel ? document.querySelector(targetSel) : null;
      const text = (target ? target.innerText : button.getAttribute("data-copy-text") || "").trim();
      if (!text) return;

      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          ok = true;
        } else {
          ok = legacyCopy(text);
        }
      } catch {
        ok = legacyCopy(text);
      }

      const label = button.querySelector("[data-copy-label]");
      if (ok) {
        button.dataset.copied = "true";
        if (label) label.textContent = "Copied";
        announce("Copied to clipboard");
        setTimeout(() => {
          button.dataset.copied = "false";
          if (label) label.textContent = "Copy";
        }, 2000);
      } else {
        announce("Press Ctrl+C to copy");
      }
    });
  });

  /* ---------------------------------------------------------------- reveal */

  const revealables = document.querySelectorAll(".reveal");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    // Show everything immediately. Content must never depend on an animation
    // having run.
    revealables.forEach((el) => el.classList.add("is-visible"));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -32px" }
    );
    revealables.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------ year */

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  /* --------------------------------------------------------------- release */

  // The published version, READ FROM THE CHANNEL rather than written here.
  //
  // This used to be a constant, "the single place the published version is
  // written down" — and it named a beta from 2026-08 on every page for a month
  // while the channel moved twelve releases on, so the roadmap told visitors
  // that everything it lists is in that build. One place to edit is still
  // a place somebody has to remember to edit.
  //
  // So the page asks the channel a visitor would install from.
  // `/channel/beta.json` is proxied to get.nodeau.ai by netlify.toml, which
  // keeps the request same-origin. The site describes what a visitor can
  // install, never what is on a branch, and the channel is exactly that.
  //
  // UNKNOWN SHOWS NOTHING. Offline, blocked or malformed, the slots stay empty
  // and anything marked [data-release-note] stays hidden, so no sentence ever
  // carries a number nobody checked.
  const releaseSlots = document.querySelectorAll("[data-release]");
  if (releaseSlots.length && window.fetch) {
    fetch("/channel/beta.json", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((manifest) => {
        const v = manifest && manifest.version;
        if (typeof v !== "string" || !/^v\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/.test(v)) return;
        releaseSlots.forEach((el) => {
          el.textContent = v;
        });
        document.querySelectorAll("[data-release-note]").forEach((el) => {
          el.hidden = false;
        });
      })
      .catch(() => {});
  }

  /* -------------------------------------------------- contact preselection */

  // /contact?type=business deep-links from every Business call to action.
  //
  // `alpha` is kept pointing at install help: the install guide used to live at
  // /alpha/ and links out there still carry the old parameter. An unknown value
  // simply leaves the select alone, so a stale link is never worse than no
  // parameter at all.
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const interest = document.querySelector("#interest");
  if (type && interest) {
    const map = {
      business: "Nodeau Business",
      pro: "Nodeau Home Pro",
      home: "Nodeau Home",
      install: "Install help",
      alpha: "Install help",
      partner: "Design partner",
      partnership: "Partnership",
    };
    const wanted = map[type.toLowerCase()];
    if (wanted && [...interest.options].some((o) => o.value === wanted)) {
      interest.value = wanted;
    }
  }
})();
