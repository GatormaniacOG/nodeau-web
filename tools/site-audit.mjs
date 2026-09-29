// A real-browser audit of every public page, at every width that matters.
//
//   python3 tools/serve.py 8123 &
//   PLAYWRIGHT_BROWSERS_PATH=~/.local/nodeau-toolchains/playwright \
//     node tools/site-audit.mjs http://127.0.0.1:8123 /tmp/site-audit
//
// It uses the Playwright that the account app already vendors (app/), so the
// marketing site still has no toolchain of its own; this is an optional check
// for a person about to publish, not part of tools/check-site.py.
//
// WHY A BROWSER AND NOT MORE REGEXES. tools/check-site.py reads the source. It
// cannot see a table pushing a phone's page sideways, a heading squeezed into
// three letters a line, or a script error. Those are properties of a rendered
// page at a width, so they are measured in one.
//
// Every finding names the route and the width. Screenshots land in the output
// directory for the part no automated check replaces: looking at them.

import { chromium } from '../app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] || 'http://127.0.0.1:8123').replace(/\/$/, '');
const out = process.argv[3] || '/tmp/site-audit';
const widths = (process.env.WIDTHS || '1920,1440,1280,1024,768,390').split(',').map(Number);
const shotWidths = new Set((process.env.SHOT_WIDTHS || '1440,390').split(',').map(Number));
mkdirSync(out, { recursive: true });

const sitemap = readFileSync(join(here, '..', 'sitemap.xml'), 'utf8');
const routes = [...sitemap.matchAll(/<loc>https:\/\/nodeau\.ai(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
routes.push('/thanks/', '/no-such-page/');

const findings = [];
const note = (route, width, kind, detail) => findings.push({ route, width, kind, detail });

const browser = await chromium.launch();
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  for (const route of routes) {
    const page = await ctx.newPage();
    const expected404 = route === '/no-such-page/';
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !(expected404 && /404/.test(msg.text()))) {
        note(route, width, 'console-error', msg.text().slice(0, 200));
      }
    });
    page.on('pageerror', (err) => note(route, width, 'page-error', String(err).slice(0, 200)));
    page.on('response', (res) => {
      const url = res.url();
      if (!url.startsWith(base)) return;
      if (res.status() >= 400 && !(expected404 && url.startsWith(base + route))) {
        note(route, width, 'http-' + res.status(), url.replace(base, ''));
      }
    });

    const resp = await page.goto(base + route, { waitUntil: 'networkidle' });
    if (!expected404 && resp && resp.status() !== 200) note(route, width, 'status', String(resp.status()));

    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible')));

    const report = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const res = { overflow: document.documentElement.scrollWidth - vw, offenders: [], tiny: [], squeezed: [], a11y: [] };
      const clipped = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return true;
        }
        return false;
      };
      const visible = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0;
      };
      for (const el of document.body.querySelectorAll('*')) {
        if (!visible(el)) continue;
        if (el.closest('.visually-hidden, .skip-link, .hp, [hidden]')) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 && !clipped(el)) {
          res.offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
        }
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
        if (own) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs < 11.5) res.tiny.push(`${el.tagName.toLowerCase()} ${fs}px "${el.textContent.trim().slice(0, 40)}"`);
        }
      }
      for (const h of document.querySelectorAll('h1, h2, h3')) {
        if (!visible(h)) continue;
        const r = h.getBoundingClientRect();
        const text = h.textContent.trim();
        if (text.length > 18 && r.width < 150) res.squeezed.push(`${h.tagName} ${Math.round(r.width)}px "${text.slice(0, 40)}"`);
      }
      // Accessibility basics: one h1, no skipped heading levels, names on
      // controls, alt text, unique ids, a language.
      const hs = [...document.querySelectorAll('main h1, main h2, main h3, main h4')].filter((h) => !h.closest('[hidden]'));
      const h1s = document.querySelectorAll('h1');
      if (h1s.length !== 1) res.a11y.push(`${h1s.length} h1 elements`);
      let last = 1;
      for (const h of hs) {
        const lvl = Number(h.tagName[1]);
        if (lvl > last + 1) res.a11y.push(`heading skips from h${last} to h${lvl}: "${h.textContent.trim().slice(0, 40)}"`);
        last = lvl;
      }
      for (const b of document.querySelectorAll('button, a[href]')) {
        const name = (b.getAttribute('aria-label') || b.textContent || '').trim();
        if (!name && !b.querySelector('img[alt]')) res.a11y.push(`unnamed ${b.tagName.toLowerCase()} ${b.outerHTML.slice(0, 80)}`);
      }
      for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) res.a11y.push(`img without alt ${img.src}`);
      const ids = {};
      for (const el of document.querySelectorAll('[id]')) ids[el.id] = (ids[el.id] || 0) + 1;
      for (const [id, n] of Object.entries(ids)) if (n > 1) res.a11y.push(`duplicate id #${id} x${n}`);
      if (!document.documentElement.lang) res.a11y.push('no lang attribute');
      for (const input of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        if (input.closest('.hp')) continue;
        const id = input.id;
        const labelled = (id && document.querySelector(`label[for="${id}"]`)) || input.closest('label') || input.getAttribute('aria-label');
        if (!labelled) res.a11y.push(`unlabelled ${input.tagName.toLowerCase()}#${id}`);
      }
      return res;
    });

    if (report.overflow > 0) note(route, width, 'horizontal-overflow', `${report.overflow}px`);
    for (const o of report.offenders.slice(0, 5)) note(route, width, 'offscreen', o);
    for (const t of [...new Set(report.tiny)].slice(0, 5)) note(route, width, 'tiny-text', t);
    for (const s of report.squeezed) note(route, width, 'squeezed-heading', s);
    if (width === 1440) for (const a of report.a11y) note(route, width, 'a11y', a);

    if (shotWidths.has(width)) {
      const name = (route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + `-${width}.png`;
      await page.screenshot({ path: join(out, name), fullPage: true });
    }
    await page.close();
  }

  // Interaction on a phone: the site menu and the docs menu must open and
  // show their links on screen.
  if (width === 390) {
    const page = await ctx.newPage();
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.click('[data-nav-toggle]');
    const navOk = await page.isVisible('#site-nav a[href="/docs/"]');
    if (!navOk) note('/', width, 'mobile-nav', 'menu did not show the Docs link');
    await page.screenshot({ path: join(out, 'mobile-nav-open-390.png') });
    await page.goto(base + '/docs/install-linux/', { waitUntil: 'networkidle' });
    const btn = await page.$('[data-doc-menu]');
    if (btn) {
      await btn.click();
      const sideOk = await page.isVisible('#doc-sidebar a[href="/docs/quickstart/"]');
      if (!sideOk) note('/docs/install-linux/', width, 'docs-menu', 'sidebar did not show its links');
      await page.screenshot({ path: join(out, 'docs-menu-open-390.png') });
    } else {
      note('/docs/install-linux/', width, 'docs-menu', 'no docs menu button');
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();

writeFileSync(join(out, 'report.json'), JSON.stringify(findings, null, 2));
const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
console.log(`${routes.length} routes × ${widths.length} widths · ${findings.length} findings`);
for (const [k, n] of Object.entries(byKind)) console.log(`  ${k}: ${n}`);
for (const f of findings.slice(0, 60)) console.log(`  ${f.kind.padEnd(20)} ${String(f.width).padEnd(5)} ${f.route}  ${f.detail}`);
process.exit(findings.length ? 1 : 0);
