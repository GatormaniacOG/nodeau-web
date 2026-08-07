# Nodeau marketing site

A dependency-free static landing page for **nodeau.ai**.

## Preview locally

From this directory:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Files

- `index.html` — landing page content and semantic structure
- `styles.css` — responsive visual design and animation
- `script.js` — reveal animations, copy buttons, header behavior
- `favicon.svg` — Nodeau node-mark favicon

## Before production

1. Confirm that `hello@nodeau.ai` exists, or replace it in `index.html`.
2. Replace any copy that describes features not yet ready for external users.
3. Add analytics only after selecting a privacy/analytics approach.
4. Add Privacy / Terms / Security pages before collecting customer data.
5. Do not expose a homelab endpoint directly from this marketing site.

## Suggested hosting

The site is pure static HTML/CSS/JS and can be deployed to Cloudflare Pages, Vercel, Netlify, GitHub Pages, S3/CloudFront, or any static host. Because the domain is registered at Squarespace, you can keep the registration there and point DNS records at the chosen host.

For a zero-build deployment on Cloudflare Pages or Netlify, upload the directory as-is.

## Design direction

Original Nodeau design using a dark, technical, high-contrast visual language: oversized typography, compact infrastructure cards, terminal/code surfaces, a subtle animated node topology, and restrained lime/cyan signal colors. It is inspired by the general feel of modern infrastructure/compute landing pages, not a copy of any reference site.
