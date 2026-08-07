# Nodeau marketing site

Static landing page for **nodeau.ai**.

## Positioning

The homepage now speaks to two audiences:

- **Home / casual GPU users** — private AI on a gaming PC or workstation, hardware-fit guidance, OpenAI-compatible local endpoints, power/quiet-hour awareness, and **Windows via WSL marked as coming soon**.
- **Startups / small teams** — multi-node placement, policy-driven cloud overflow, health/performance visibility, explainable admission, plus clearly marked roadmap items such as RBAC, audit history, and quotas.

The site intentionally describes Nodeau as an early product. Roadmap items are labeled rather than presented as shipping features.

## Files

- `index.html` — page structure and copy
- `styles.css` — complete responsive styling
- `script.js` — reveal animations, copy buttons, header state
- `favicon.svg` — lightweight favicon

No build step or external dependencies are required.

## Netlify

If this repository is connected to Netlify, use:

- Build command: *(blank)*
- Publish directory: `.`

Pushes to the configured production branch (usually `main`) will deploy automatically.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
