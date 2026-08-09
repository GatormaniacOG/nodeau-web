#!/usr/bin/env python3
"""Generate the remaining Nodeau site pages.

Run once. The output is committed; the site itself still has no build step.
Keeping the header and footer in one place here is only to stop six hand-typed
copies from drifting apart.
"""
import pathlib

ROOT = pathlib.Path("/home/pranav/src/nodeau-web")

BRAND = '''<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="#b8ff5a" stroke-width="1.6"/>
        <rect x="8" y="8" width="8" height="8" rx="2" fill="#b8ff5a"/>
      </svg>'''

NAV_ITEMS = [
    ("/#home", "For home", "home"),
    ("/#business", "For business", "business"),
    ("/alpha/", "Alpha", "alpha"),
    ("/roadmap/", "Roadmap", "roadmap"),
    ("/pricing/", "Pricing", "pricing"),
]


def head(title, desc, path, og_title=None, og_desc=None, robots=None):
    extra = f'\n<meta name="robots" content="{robots}">' if robots else ""
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://nodeau.ai{path}">{extra}
<meta name="theme-color" content="#08090b">
<meta property="og:type" content="website">
<meta property="og:url" content="https://nodeau.ai{path}">
<meta property="og:site_name" content="Nodeau">
<meta property="og:title" content="{og_title or title}">
<meta property="og:description" content="{og_desc or desc}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/nodeau.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
'''


def header(current, cta_href="/alpha/", cta_label="Install Alpha"):
    items = []
    for href, label, key in NAV_ITEMS:
        cur = ' aria-current="page"' if key == current else ""
        items.append(f'        <li><a href="{href}"{cur}>{label}</a></li>')
    nav = "\n".join(items)
    return f'''
<header class="site-header" data-header>
  <div class="wrap">
    <a class="brand" href="/">
      {BRAND}
      Nodeau
    </a>
    <button class="nav-toggle" data-nav-toggle aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
      <svg class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <nav class="nav" id="site-nav" data-nav aria-label="Primary">
      <ul>
{nav}
      </ul>
    </nav>
    <div class="header-actions">
      <a class="btn btn-ghost btn-sm" href="/contact/">Talk to us</a>
      <a class="btn btn-primary btn-sm" href="{cta_href}">{cta_label}</a>
    </div>
  </div>
</header>

<main id="main">
'''


FOOTER = f'''
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <a class="brand" href="/" style="margin-bottom:0.75rem">
          {BRAND}
          Nodeau
        </a>
        <p style="max-width:34ch">You own the GPU. Nodeau makes it usable infrastructure.</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="/#home">For home</a></li>
          <li><a href="/#business">For business</a></li>
          <li><a href="/pricing/">Pricing</a></li>
          <li><a href="/roadmap/">Roadmap</a></li>
        </ul>
      </div>
      <div>
        <h4>Start</h4>
        <ul>
          <li><a href="/alpha/">Alpha guide</a></li>
          <li><a href="https://get.nodeau.ai/">Installer</a></li>
          <li><a href="https://get.nodeau.ai/docs/requirements.md">Requirements</a></li>
          <li><a href="https://get.nodeau.ai/docs/troubleshooting.md">Troubleshooting</a></li>
        </ul>
      </div>
      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="/about/">About</a></li>
          <li><a href="/faq/">FAQ</a></li>
          <li><a href="/contact/">Contact</a></li>
          <li><a href="mailto:founders@nodeau.ai">founders@nodeau.ai</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span data-year>2026</span> Nodeau</span>
      <span>Self-Hosted Alpha v0.1.0-alpha.1 · experimental · Linux-first</span>
    </div>
  </div>
</footer>

<div class="toast" data-toast role="status" aria-live="polite"></div>
<script src="/assets/nodeau.js" defer></script>
</body>
</html>
'''


def page(path, filename, current, title, desc, body, **kw):
    html = head(title, desc, path, **kw) + header(current) + body + FOOTER
    out = ROOT / filename
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(f"  {filename}")


def rows(items):
    """items: (title, pill_class, pill_label, description)"""
    out = []
    for t, pc, pl, d in items:
        out.append(f'''        <div class="row">
          <h3>{t}</h3>
          <span class="pill {pc}">{pl}</span>
          <p>{d}</p>
        </div>''')
    return "\n".join(out)


def qa(question, answer):
    return f'''      <details class="qa">
        <summary>{question}</summary>
        <div class="answer">{answer}</div>
      </details>'''


# ===========================================================================
# ROADMAP
# ===========================================================================

roadmap_body = f'''
  <section class="hero" style="padding-bottom:2rem">
    <div class="wrap">
      <p class="eyebrow">Roadmap</p>
      <h1 style="font-size:var(--step-3)">Single GPU today. Fleet intelligence next.</h1>
      <p class="lede" style="margin-top:1.15rem">
        Nodeau has a working Self-Hosted Alpha. This page separates what runs
        today from what is intended, because the difference matters more than
        the ambition does.
      </p>
      <div class="btn-row" style="margin-top:1.75rem">
        <span class="pill pill-available">Available</span>
        <span class="pill pill-next">Next</span>
        <span class="pill pill-planned">Planned</span>
        <span class="pill pill-exploring">Exploring</span>
      </div>
      <p style="color:var(--text-3);font-size:0.88rem;margin-top:1rem;max-width:56ch">
        There are no dates on this page. Nodeau is a small effort and a date
        would be a guess presented as a commitment.
      </p>
    </div>
  </section>

  <section class="tight divider">
    <div class="wrap">

      <div class="stage">
        <div class="stage-head">
          <h2>Now — the working Alpha</h2>
          <span class="pill pill-available">Available</span>
          <p>Everything here runs in v0.1.0-alpha.1 on a single Linux machine with a single NVIDIA GPU.</p>
        </div>
        <div class="rows">
{rows([
    ("Self-hosted installer", "pill-available", "Available", "One public command. Verifies the release artifact before installing anything."),
    ("nodeau install", "pill-available", "Available", "Checks the machine, shows a plan and every privileged command, then sets up the local infrastructure — adopting what is already there rather than replacing it."),
    ("nodeau doctor", "pill-available", "Available", "Read-only diagnosis of the host, GPU, driver, container stack and storage."),
    ("nodeau quickstart", "pill-available", "Available", "Model consent, download, verification, admission, deployment and a local endpoint in one command."),
    ("VRAM-aware admission", "pill-available", "Available", "Decides whether a workload fits before scheduling it, and explains the arithmetic either way."),
    ("Reservation accounting", "pill-available", "Available", "Tracks what Nodeau has already committed on a GPU, so a second workload is judged against reality."),
    ("GPU hardware observation", "pill-available", "Available", "A node agent reports the GPU's real addressable memory and current usage."),
    ("Measured model profiles", "pill-available", "Available", "Memory and throughput measured on real hardware. Nodeau refuses configurations it has not measured rather than estimating."),
    ("Model artifact verification", "pill-available", "Available", "Downloaded from the publisher, checked against a known SHA-256, quarantined on mismatch."),
    ("Local OpenAI-compatible API", "pill-available", "Available", "Bound to 127.0.0.1 with a locally generated key. Streaming supported."),
    ("Support bundles", "pill-available", "Available", "One redacted archive for diagnosis. Nothing is uploaded."),
    ("Install ownership ledger", "pill-available", "Available", "Records what Nodeau installed as distinct from what it found, so uninstall removes only its own work."),
    ("Reproducible release artifacts", "pill-available", "Available", "Pinned versions and checksums, verified end to end before publication."),
])}
        </div>
      </div>

      <div class="stage">
        <div class="stage-head">
          <h2>Next — harden and expand</h2>
          <span class="pill pill-next">Next</span>
          <p>The immediate priority is making the Alpha work on machines other than the one it was built on.</p>
        </div>
        <div class="rows">
{rows([
    ("Clean-machine validation", "pill-next", "Next", "Broader testing on hardware Nodeau has never seen. This is the current gate."),
    ("Installer edge cases", "pill-next", "Next", "More failure modes handled cleanly, better recovery, clearer diagnostics."),
    ("More NVIDIA GPUs", "pill-next", "Next", "Additional cards measured and profiled rather than assumed compatible."),
    ("More Ubuntu and Linux coverage", "pill-next", "Next", "Beyond the single measured Ubuntu 24.04 baseline."),
    ("Upgrade and repair flow", "pill-next", "Next", "Moving between versions without reinstalling from scratch."),
    ("More model profiles", "pill-next", "Next", "More models and quantisations, with measured memory and throughput."),
    ("Windows via WSL", "pill-planned", "Planned", "The GPU path through WSL is genuinely different and is currently refused rather than half-supported. Native Windows is not planned."),
    ("Home experience", "pill-planned", "Planned", "Easier model browsing, simpler configuration, better local status. A graphical interface is possible later but is not committed."),
])}
        </div>
      </div>

      <div class="stage">
        <div class="stage-head">
          <h2>Business — multi-node</h2>
          <span class="pill pill-planned">Planned</span>
          <p>The next major platform capability, and the point at which Nodeau becomes a fleet control plane rather than a single-machine tool. None of this is in the Alpha.</p>
        </div>
        <div class="rows">
{rows([
    ("Multi-node GPU discovery", "pill-planned", "Planned", "More than one GPU machine under one control plane, with health and heartbeats."),
    ("Explainable placement", "pill-planned", "Planned", "Choose a machine for a workload, and report why each candidate was not chosen."),
    ("Heterogeneous fleets", "pill-planned", "Planned", "Mixed GPU generations reasoned about individually rather than treated as interchangeable."),
    ("VRAM-aware scheduling across machines", "pill-planned", "Planned", "The admission model that exists today, applied across a fleet."),
    ("Model locality awareness", "pill-planned", "Planned", "Prefer machines that already hold the model, because pulling weights dominates cold start."),
    ("Performance-aware placement", "pill-planned", "Planned", "Use measured throughput rather than card names to choose."),
])}
        </div>
      </div>

      <div class="stage">
        <div class="stage-head">
          <h2>Business — fleet management</h2>
          <span class="pill pill-planned">Planned</span>
          <p>Once workloads can move between machines, the organisational layer becomes the useful part.</p>
        </div>
        <div class="rows">
{rows([
    ("Fleet inventory and health", "pill-planned", "Planned", "What hardware exists, what is running on it, and what is wrong."),
    ("Model inventory and rollout", "pill-planned", "Planned", "Which models are where, and moving between versions deliberately."),
    ("Team access and organisation RBAC", "pill-planned", "Planned", "Who can deploy what, where."),
    ("Quotas and policy", "pill-planned", "Planned", "Limits and placement rules expressed once, enforced centrally."),
    ("Audit history", "pill-planned", "Planned", "A durable record of decisions and changes."),
    ("Observability and alerts", "pill-planned", "Planned", "Utilisation, saturation and failure surfaced rather than inferred."),
    ("Health-aware rescheduling and failover", "pill-planned", "Planned", "Recovering a workload elsewhere. Nodeau does not do this today."),
    ("Maintenance and drain workflows", "pill-planned", "Planned", "Taking a machine out of service without dropping what it was running."),
])}
        </div>
      </div>

      <div class="stage">
        <div class="stage-head">
          <h2>Exploring</h2>
          <span class="pill pill-exploring">Exploring</span>
          <p>Directions we think are right but have not committed to. Treat these as intent, not plan.</p>
        </div>
        <div class="rows">
{rows([
    ("Cloud overflow", "pill-exploring", "Exploring", "Owned hardware first, cloud when policy or capacity requires it. Hybrid scheduling across both."),
    ("Nodeau-hosted control plane", "pill-exploring", "Exploring", "A managed management plane over infrastructure you still own. Inference would not inherently need to traverse it simply because management is hosted."),
    ("Multiple GPUs per machine", "pill-exploring", "Exploring", "Deliberately separate from multi-node. Nodeau currently works with one GPU per node."),
    ("AMD GPU support", "pill-exploring", "Exploring", "A different runtime and memory story, not a configuration flag."),
    ("macOS support", "pill-exploring", "Exploring", "Unified memory changes the admission model substantially."),
    ("Broader runtimes", "pill-exploring", "Exploring", "vLLM and others alongside llama.cpp."),
    ("Automatic quantisation", "pill-exploring", "Exploring", "Fitting a model to a card rather than refusing it."),
    ("Scale to zero", "pill-exploring", "Exploring", "Release the GPU when idle, reload on demand."),
    ("Git-to-deploy", "pill-exploring", "Exploring", "A repository as the unit of deployment."),
    ("Air-gapped and private registries", "pill-exploring", "Exploring", "For organisations that cannot pull from the public internet."),
])}
        </div>
      </div>

    </div>
  </section>

  <section class="tight divider cta">
    <div class="wrap">
      <h2 style="font-size:var(--step-2)">Want to influence the order?</h2>
      <p class="lede" style="margin:1rem auto 1.75rem;max-width:46ch">
        Design partners with real GPU hardware shape what gets built next.
      </p>
      <div class="btn-row">
        <a class="btn btn-primary" href="/contact/?type=business">Become a design partner</a>
        <a class="btn btn-ghost" href="/alpha/">Install Alpha</a>
      </div>
    </div>
  </section>
'''

# ===========================================================================
# PRICING
# ===========================================================================

pricing_body = '''
  <section class="hero" style="padding-bottom:2rem">
    <div class="wrap">
      <p class="eyebrow">Pricing</p>
      <h1 style="font-size:var(--step-3)">Priced for infrastructure, not for tokens.</h1>
      <p class="lede" style="margin-top:1.15rem">
        Your hardware does the inference. Nodeau’s job is making that hardware
        usable and manageable, so nothing here is metered per prompt, per token
        or per request.
      </p>
    </div>
  </section>

  <section class="tight divider">
    <div class="wrap">
      <div class="split">
        <div class="panel panel-home">
          <h3>Nodeau Home</h3>
          <p class="kicker">For individuals running private, local AI on a personal GPU.</p>
          <div class="price">Coming soon</div>
          <p class="price-note">Self-Hosted Alpha available now. No card required.</p>
          <ul class="checks">
            <li>A single personal machine</li>
            <li>A single GPU</li>
            <li>Local inference on your own hardware</li>
            <li>Supported model profiles</li>
            <li>Model and GPU fit checks before anything starts</li>
            <li>Local OpenAI-compatible API with its own key</li>
            <li>Simple CLI, diagnostics and support bundles</li>
          </ul>
          <a class="btn btn-primary btn-sm" href="/alpha/">Try Alpha</a>
        </div>

        <div class="panel">
          <h3>Nodeau Business</h3>
          <p class="kicker">For startups and organisations managing shared GPU infrastructure.</p>
          <div class="price">Contact us</div>
          <p class="price-note">Design partners welcome while multi-node is built.</p>
          <ul class="checks">
            <li>Everything in Home</li>
            <li>GPU workload management on owned hardware</li>
          </ul>
          <ul class="checks checks-future" style="margin-top:0">
            <li>Multi-node placement <span class="pill pill-planned" style="margin-left:.35rem">Planned</span></li>
            <li>Heterogeneous GPU fleets <span class="pill pill-planned" style="margin-left:.35rem">Planned</span></li>
            <li>Team controls, RBAC, quotas and policy <span class="pill pill-planned" style="margin-left:.35rem">Planned</span></li>
            <li>Fleet observability and audit <span class="pill pill-planned" style="margin-left:.35rem">Planned</span></li>
            <li>Support</li>
          </ul>
          <a class="btn btn-ghost btn-sm" href="/contact/?type=business">Contact us</a>
        </div>
      </div>

      <div class="note" style="margin-top:2.5rem;max-width:64ch">
        Items marked <strong>Planned</strong> are not in the current Alpha. They
        are on the <a href="/roadmap/">roadmap</a> and are described there with
        the same labels. Nothing on this page is a commitment to a date.
      </div>
    </div>
  </section>

  <section class="tight divider">
    <div class="wrap">
      <h2 style="font-size:var(--step-2)">Why there is no per-token price</h2>
      <div class="grid grid-3" style="margin-top:1.75rem">
        <div class="feature">
          <h3>Your GPU does the work</h3>
          <p>Inference runs on hardware you already paid for. Charging per token would be charging you for your own electricity.</p>
        </div>
        <div class="feature">
          <h3>The value is management</h3>
          <p>Deciding what fits, keeping it running, and — for teams — knowing what is where. That scales with machines, not with prompts.</p>
        </div>
        <div class="feature">
          <h3>Capacity you can predict</h3>
          <p>Owned hardware has a fixed ceiling and a fixed cost. That is a different shape from per-request billing, and for some workloads a better one.</p>
        </div>
      </div>
      <p class="note" style="margin-top:2rem;max-width:60ch">
        Owned hardware is not automatically cheaper than cloud inference. It
        depends entirely on utilisation, and the honest answer for a machine
        that sits idle is usually no.
      </p>
    </div>
  </section>

  <section class="tight divider cta">
    <div class="wrap">
      <h2 style="font-size:var(--step-2)">Start with the Alpha.</h2>
      <p class="lede" style="margin:1rem auto 1.75rem;max-width:42ch">
        It is free, it needs no account, and it will tell you honestly whether
        your machine can run it.
      </p>
      <div class="btn-row">
        <a class="btn btn-primary" href="/alpha/">Install Alpha</a>
        <a class="btn btn-ghost" href="/contact/?type=business">Talk about Business</a>
      </div>
    </div>
  </section>
'''

# ===========================================================================
# ABOUT
# ===========================================================================

about_body = '''
  <section class="hero" style="padding-bottom:2rem">
    <div class="wrap">
      <p class="eyebrow">About</p>
      <h1 style="font-size:var(--step-3)">You own the GPU. Nodeau makes it usable infrastructure.</h1>
      <p class="lede" style="margin-top:1.15rem">
        A short explanation of what sits between a graphics card and a working
        AI endpoint, and which parts Nodeau takes on.
      </p>
    </div>
  </section>

  <section class="tight divider">
    <div class="wrap prose stack-lg">
      <div>
        <h2 style="font-size:var(--step-2)">A GPU is not infrastructure</h2>
        <p style="color:var(--text-2)">
          A modern graphics card is an enormous amount of compute sitting in a
          desktop case. Using it to run an AI model is a different problem from
          owning it. Between the two sit drivers, runtime libraries, model file
          formats, quantisation, container plumbing, a model server, an API,
          authentication, and something to keep it all running.
        </p>
        <p style="color:var(--text-2)">
          None of that is why anyone wanted to run a model. It is the tax.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">Models are not interchangeable</h2>
        <p style="color:var(--text-2)">
          Two models with the same name can need very different amounts of
          memory depending on how they were compressed, how much context you
          give them, and how many requests you want to handle at once. The
          honest way to know what a configuration costs is to measure it.
        </p>
        <p style="color:var(--text-2)">
          Nodeau ships measured profiles rather than formulas. If a
          configuration has not been measured on hardware like yours, Nodeau
          says so instead of inventing a number.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">The number on the box is not the number you get</h2>
        <p style="color:var(--text-2)">
          A card advertised with 10&nbsp;GB does not hand 10&nbsp;GB to a
          workload. Some of it cannot be addressed by the compute API at all.
          Your desktop is already using some — every window, every browser tab
          with a video in it. And a model that fits exactly with nothing to
          spare will fail the moment anything else asks for memory.
        </p>
        <p style="color:var(--text-2)">
          On the machine Nodeau was built on, the difference between the
          nameplate figure and what a workload can actually plan against is
          several hundred megabytes before the desktop is even considered. That
          gap is the difference between a model that runs and one that dies
          part-way through loading.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">So Nodeau understands both sides</h2>
        <p style="color:var(--text-2)">
          It observes the machine: which GPU, what the compute API can actually
          address, what is already in use, what Nodeau itself has committed
          elsewhere. It knows the model: measured peak memory for a specific
          configuration, plus a margin.
        </p>
        <p style="color:var(--text-2)">
          Then it decides. If the workload fits, Nodeau prepares everything it
          needs and starts it. If it does not, Nodeau refuses <em>before</em>
          scheduling it and shows the arithmetic — which is far more useful
          than a crash several seconds into loading.
        </p>
        <p style="color:var(--text-2)">
          That is the whole idea, and it is the part that makes this more than
          a wrapper around existing tools: decisions are made before scheduling,
          and every decision can be explained.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">One machine, then many</h2>
        <p style="color:var(--text-2)">
          For an individual, that turns one PC into a private AI endpoint: a
          local, OpenAI-compatible API on a machine you already own, reachable
          only from that machine by default.
        </p>
        <p style="color:var(--text-2)">
          For an organisation, the same foundation is what a fleet needs. The
          hard part of scheduling across many GPUs is knowing what each one can
          actually take — which is exactly what Nodeau already computes for
          one. Extending that across machines is the next major piece of work,
          and it is on the <a href="/roadmap/">roadmap</a> rather than in the
          product today.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">Why owned hardware</h2>
        <p style="color:var(--text-2)">
          Running on hardware you control gives you locality, predictable
          capacity, and use of machines that already exist and are frequently
          idle. Data stays on the machine unless something you connect chooses
          to send it elsewhere.
        </p>
        <p style="color:var(--text-2)">
          It is not automatically cheaper. A GPU that runs a few hours a week
          is usually more expensive than paying per request, and anyone telling
          you otherwise is selling something. The case for owned hardware is
          control and predictability — and, often, that you already bought the
          card for something else.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">Where it is today</h2>
        <p style="color:var(--text-2)">
          Nodeau is a Self-Hosted Alpha: one Linux machine, one NVIDIA GPU, one
          runtime, a small set of measured models. It works end to end on the
          hardware it was built on, and it is being published so other people
          can find out whether it works on theirs.
        </p>
        <p style="color:var(--text-2)">
          It is not production infrastructure. It has no uptime guarantee, no
          failover, and it is not hardened for hostile multi-tenancy.
        </p>
      </div>

      <div>
        <h2 style="font-size:var(--step-2)">Measured, on one machine</h2>
        <p style="color:var(--text-2)">
          Numbers from the development system — an RTX 3080. They describe that
          machine and nothing else, and your hardware will differ.
        </p>
        <div class="metrics" style="margin-top:1.5rem">
          <div class="metric"><div class="n">118</div><div class="l">tokens/sec, generation</div></div>
          <div class="metric"><div class="n">52 ms</div><div class="l">time to first token, p50</div></div>
          <div class="metric"><div class="n">81 ms</div><div class="l">Nodeau’s own decision + deploy cost</div></div>
          <div class="metric"><div class="n">0 errors</div><div class="l">across 150 requests while the control plane restarted</div></div>
        </div>
        <p style="color:var(--text-3);font-size:0.88rem;margin-top:1.25rem">
          The last figure is the point of keeping the control plane out of the
          inference path: restarting Nodeau’s own components did not interrupt
          a single request.
        </p>
      </div>
    </div>
  </section>

  <section class="tight divider cta">
    <div class="wrap">
      <h2 style="font-size:var(--step-2)">Try it, or tell us about your hardware.</h2>
      <div class="btn-row" style="margin-top:1.5rem">
        <a class="btn btn-primary" href="/alpha/">Install Alpha</a>
        <a class="btn btn-ghost" href="/contact/">Talk to us</a>
      </div>
    </div>
  </section>
'''

# ===========================================================================
# FAQ
# ===========================================================================

faq_groups = [
    ("About Nodeau", [
        ("What is Nodeau?",
         "<p>Software that turns a computer with a compatible NVIDIA GPU into local AI infrastructure. It checks the machine, works out whether a supported model can fit safely in the GPU’s memory, sets up what is needed to run it, and gives you an OpenAI-compatible API on that machine.</p>"),
        ("Who is Nodeau for?",
         "<p>Two groups. <strong>Home</strong>: an individual with a gaming PC or workstation who wants to run models locally without becoming an infrastructure engineer. <strong>Business</strong>: teams and organisations with GPU hardware they want to operate as shared infrastructure — that direction is largely <a href='/roadmap/'>roadmap</a>.</p>"),
        ("Do I need to know Kubernetes?",
         "<p>No. Nodeau uses Kubernetes underneath on a single machine, but normal use is three commands and an API. You never write YAML, and you do not need to know what a container is.</p>"),
        ("Is Nodeau open source?",
         "<p>Not at this time. The installer and the published distribution are public; the platform source is not.</p>"),
    ]),
    ("Getting started", [
        ("How do I install it?",
         "<p>Three commands, on a machine that already has a working NVIDIA driver:</p><div class='code'><pre><code>curl -fsSL https://get.nodeau.ai/install.sh | bash\nnodeau install\nnodeau quickstart</code></pre></div><p style='margin-top:.75rem'>The <a href='/alpha/'>Alpha guide</a> walks through each one.</p>"),
        ("How long does it take?",
         "<p>Roughly ten minutes of setup, plus the model download. The starter model is about 4.7&nbsp;GB, so on a slow connection that is the long part.</p>"),
        ("Does it cost anything?",
         "<p>The Self-Hosted Alpha is free and needs no account or card. See <a href='/pricing/'>pricing</a> for where this is heading.</p>"),
        ("Can I uninstall it?",
         "<p>Yes. <code>nodeau uninstall</code> prints exactly what it will remove and asks first. By default it keeps your downloaded models, your GPU driver, and anything that was on the machine before Nodeau — it records what it installed as distinct from what it found, and removes only its own work.</p>"),
    ]),
    ("Hardware", [
        ("What GPUs are supported?",
         "<p>NVIDIA only, and in the Alpha, one GPU in one machine. Nodeau has been measured on an RTX 3080. Other NVIDIA cards with a working driver are <em>untested</em> rather than known-broken: Nodeau will tell you if it has no measured profile for your configuration instead of guessing at memory figures.</p>"),
        ("Does Nodeau install my NVIDIA driver?",
         "<p>No, deliberately. A working driver is a prerequisite. Installing or changing a GPU driver affects whether your machine boots to a desktop, and Nodeau will not make that decision for you. It checks the driver, and stops with an explanation if it is not working.</p>"),
        ("What happens if nvidia-smi doesn’t work?",
         "<p>Nodeau stops before changing anything and tells you the driver is not working. Fix the driver first — through your distribution — then run <code>nodeau install</code> again.</p>"),
        ("Does Nodeau support Windows?",
         "<p>Not today. Native Windows is not planned. Support through WSL is on the roadmap and is currently <strong>Planned</strong>, not available — the GPU path through WSL is genuinely different and untested, so the installer refuses cleanly rather than half-working.</p>"),
        ("Does Nodeau support WSL?",
         "<p>Not yet. It is detected and refused rather than attempted. It is on the <a href='/roadmap/'>roadmap</a>.</p>"),
        ("Does Nodeau support AMD GPUs?",
         "<p>No. It is listed under <strong>Exploring</strong> on the roadmap — a different runtime and memory model, not a configuration flag.</p>"),
        ("Does Nodeau support macOS?",
         "<p>No. Also <strong>Exploring</strong>. Unified memory changes the fit calculation substantially.</p>"),
        ("Can Nodeau use several GPUs in one machine?",
         "<p>Not today. Nodeau currently works with one GPU per machine. Multiple GPUs per machine is a separate roadmap item from multi-node, and is marked <strong>Exploring</strong>.</p>"),
    ]),
    ("Models", [
        ("What models can I run?",
         "<p>In the Alpha, a small set with measured profiles. The starter model is <strong>Qwen3-8B Q4_K_M</strong> (Apache-2.0, about 4.7&nbsp;GB). Run <code>nodeau model list</code> to see what your installation can serve. More models are a near-term priority.</p>"),
        ("Why so few models?",
         "<p>Because Nodeau refuses to guess. A model profile is a set of measurements on real hardware, not a formula — that is what lets Nodeau say whether something fits instead of hoping. Adding a model means measuring it.</p>"),
        ("How does Nodeau know if a model will fit?",
         "<p>It compares what the GPU can actually give a workload — the memory the compute API can address, minus what is already in use outside Nodeau, minus what Nodeau has reserved for other workloads, minus a safety reserve — against the measured peak memory for that model in that configuration, plus a margin. If the result is negative it refuses and shows the arithmetic.</p>"),
        ("Why isn’t all my advertised VRAM available?",
         "<p>Three reasons. Some of the card’s memory is not addressable by the compute API at all. Your desktop is already using some of it. And a workload that fits with nothing spare will fail as soon as anything else allocates. Nodeau plans against what is actually usable rather than the number on the box.</p>"),
        ("Where do models come from?",
         "<p>From their original publisher, over HTTPS, at a pinned revision. Nodeau does not redistribute weights. Every download is checked against a known SHA-256 before it is used, and a file that fails is quarantined rather than left where a later run might trust it.</p>"),
    ]),
    ("Privacy and networking", [
        ("Does Nodeau run my model in the cloud?",
         "<p>No. The model runs on your GPU, on your machine. There is no Nodeau-hosted GPU involved.</p>"),
        ("Does Nodeau send my prompts anywhere?",
         "<p>Nodeau does not collect or transmit prompts or model output, and there is no telemetry in the Alpha. Your requests go to a model running on your own hardware over the loopback interface.</p><p>One honest caveat: if you point a third-party application at the endpoint, that application can do whatever it likes with your data. Nodeau cannot make promises about software it did not write.</p>"),
        ("Is Nodeau exposed to my local network?",
         "<p>No. The local endpoint binds <code>127.0.0.1</code> and nothing else — not <code>0.0.0.0</code>, not a LAN address — and there is no setting to change that in the Alpha. You can check with <code>ss -tlnp | grep nodeau</code>.</p>"),
        ("Is the API authenticated?",
         "<p>Yes. A key is generated locally with a cryptographic random source and stored with owner-only permissions. Requests without it, or with the wrong one, are rejected. Reveal it with <code>nodeau auth show</code>.</p>"),
        ("Is the API OpenAI-compatible?",
         "<p>Yes, including streaming. Most OpenAI clients work by pointing <code>base_url</code> at <code>http://127.0.0.1:8080/v1</code>.</p>"),
        ("Does Nodeau need internet after setup?",
         "<p>Not for inference. It needs the network to install, to download container images, and to fetch a model the first time. After that the model is cached locally and inference is entirely local.</p>"),
    ]),
    ("The Alpha", [
        ("Is Nodeau production-ready?",
         "<p>No, and please do not treat it as such. It is an experimental Alpha with no uptime guarantee, no failover and no support commitment, and it is not hardened for hostile multi-tenancy.</p>"),
        ("Has this been tested on hardware other than yours?",
         "<p>That is exactly what this release is for. Nodeau works end to end on the machine it was built on. Broad validation on other hardware has not happened yet, and the first external testers are how it will.</p>"),
        ("What happens if the installation fails?",
         "<p>It should fail safely: Nodeau stops, tells you which stage it stopped at and why, lists what it had already changed, and states what it did not touch — your driver, Secure Boot, your bootloader, your partitions and your personal files. Re-running <code>nodeau install</code> is safe.</p>"),
        ("How do I send a diagnostic report?",
         "<p>Run <code>nodeau support bundle</code>. It writes one <code>.tar.gz</code> with no API keys, no credentials, no prompts and no model output, and it uploads nothing — you attach it yourself. If the CLI will not run at all, send <code>~/.local/state/nodeau/install.log</code> instead. Email either to <a href='mailto:founders@nodeau.ai'>founders@nodeau.ai</a>.</p>"),
        ("Should I try to fix a broken install myself?",
         "<p>Please don’t. If you have to repair Kubernetes or container plumbing by hand, that is a bug we need to see. Send the bundle and let us fix Nodeau instead.</p>"),
    ]),
    ("Business", [
        ("Can Nodeau manage multiple GPU machines?",
         "<p>Not today. The Alpha is single-node and single-GPU. Multi-node discovery and placement is the next major platform capability and is marked <strong>Planned</strong> on the <a href='/roadmap/'>roadmap</a>.</p>"),
        ("Can Nodeau manage different GPU models together?",
         "<p>Heterogeneous fleet scheduling is <strong>Planned</strong>, not available. The groundwork exists — Nodeau already reasons about a specific GPU’s real capacity rather than treating cards as interchangeable — but it runs on one machine.</p>"),
        ("Can teams share GPU infrastructure?",
         "<p>That is the Business direction rather than a current capability. Today Nodeau manages one machine for one person.</p>"),
        ("Will Nodeau support quotas and policies?",
         "<p>Quotas, placement policy and organisation RBAC are <strong>Planned</strong> Business capabilities. None are in the Alpha.</p>"),
        ("Will Nodeau support audit and enterprise access controls?",
         "<p>Audit history and organisation-level access control are <strong>Planned</strong>. No dates.</p>"),
        ("Will Nodeau support cloud overflow?",
         "<p>Policy-controlled overflow to cloud capacity — owned hardware first, cloud when policy or capacity requires it — is <strong>Exploring</strong>. It does not ship today.</p>"),
        ("How do I get involved early?",
         "<p>If your team has GPU hardware sitting under desks or in a rack, we would like to hear about it. <a href='/contact/?type=business'>Become a design partner</a>.</p>"),
    ]),
]

faq_html = []
for group, items in faq_groups:
    gid = group.lower().replace(" ", "-").replace("&", "and")
    faq_html.append(f'    <div class="faq-group">\n      <h2 id="{gid}">{group}</h2>')
    for q, a in items:
        faq_html.append(qa(q, a))
    faq_html.append("    </div>")

faq_body = '''
  <section class="hero" style="padding-bottom:1.5rem">
    <div class="wrap">
      <p class="eyebrow">FAQ</p>
      <h1 style="font-size:var(--step-3)">Questions, answered plainly.</h1>
      <p class="lede" style="margin-top:1.15rem">
        Including the ones with awkward answers. Where something is roadmap
        rather than reality, it says so.
      </p>
    </div>
  </section>

  <section class="tight divider">
    <div class="wrap" style="max-width:56rem">
''' + "\n".join(faq_html) + '''
    </div>
  </section>

  <section class="tight divider cta">
    <div class="wrap">
      <h2 style="font-size:var(--step-2)">Still stuck?</h2>
      <p class="lede" style="margin:1rem auto 1.75rem;max-width:40ch">
        We would rather hear about a problem than not.
      </p>
      <div class="btn-row">
        <a class="btn btn-primary" href="/contact/">Ask us</a>
        <a class="btn btn-ghost" href="/alpha/">Alpha guide</a>
      </div>
    </div>
  </section>
'''

# ===========================================================================
# CONTACT
# ===========================================================================

contact_body = '''
  <section class="hero" style="padding-bottom:1.5rem">
    <div class="wrap">
      <p class="eyebrow">Contact</p>
      <h1 style="font-size:var(--step-3)">Talk to us.</h1>
      <p class="lede" style="margin-top:1.15rem">
        Alpha trouble, a team with GPU hardware, or something else entirely —
        it all reaches the same small group of people.
      </p>
    </div>
  </section>

  <section class="tight divider">
    <div class="wrap">
      <div class="grid grid-2" style="align-items:start;gap:clamp(2rem,5vw,4rem)">
        <div>
          <form name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/thanks/">
            <input type="hidden" name="form-name" value="contact">
            <p class="hp" aria-hidden="true">
              <label>Leave this field empty <input name="bot-field" tabindex="-1" autocomplete="off"></label>
            </p>

            <div class="field">
              <label for="name">Name <span class="req" aria-hidden="true">*</span></label>
              <input id="name" name="name" type="text" required autocomplete="name">
            </div>

            <div class="field">
              <label for="email">Email <span class="req" aria-hidden="true">*</span></label>
              <input id="email" name="email" type="email" required autocomplete="email">
            </div>

            <div class="field">
              <label for="interest">What is this about? <span class="req" aria-hidden="true">*</span></label>
              <select id="interest" name="interest" required>
                <option value="Nodeau Home">Nodeau Home</option>
                <option value="Nodeau Business">Nodeau Business</option>
                <option value="Alpha help">Alpha help</option>
                <option value="Design partner">Design partner</option>
                <option value="Partnership">Partnership</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="field">
              <label for="company">Company <span class="hint">optional</span></label>
              <input id="company" name="company" type="text" autocomplete="organization">
            </div>

            <div class="field">
              <label for="hardware">GPU or hardware <span class="hint">optional</span></label>
              <input id="hardware" name="hardware" type="text" placeholder="e.g. RTX 4090, Ubuntu 24.04">
              <span class="hint">Helpful for Alpha questions and design-partner conversations.</span>
            </div>

            <div class="field">
              <label for="message">Message <span class="req" aria-hidden="true">*</span></label>
              <textarea id="message" name="message" required></textarea>
            </div>

            <button class="btn btn-primary" type="submit">Send message</button>
            <p style="color:var(--text-3);font-size:0.85rem;margin-top:1rem">
              Fields marked <span class="req">*</span> are required. We use what
              you send here to reply to you, and nothing else.
            </p>
          </form>
        </div>

        <div class="stack-lg">
          <div class="panel panel-quiet">
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Email works too</h3>
            <p style="color:var(--text-2);font-size:0.95rem;margin-bottom:0">
              <a href="mailto:founders@nodeau.ai">founders@nodeau.ai</a>
            </p>
          </div>

          <div>
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Alpha not working?</h3>
            <p style="color:var(--text-2);font-size:0.95rem">
              Run <code>nodeau support bundle</code> and attach the file it
              writes — it contains no keys, credentials, prompts or model
              output. If the CLI will not run, send
              <code>~/.local/state/nodeau/install.log</code>.
            </p>
            <p style="color:var(--text-2);font-size:0.95rem">
              Please don’t spend an hour repairing it by hand. That hides the
              bug.
            </p>
          </div>

          <div>
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Design partners</h3>
            <p style="color:var(--text-2);font-size:0.95rem">
              If your team has GPUs — workstations, a lab server, a few racks —
              we want to hear how you would want to operate them. Design
              partners shape what gets built next.
            </p>
          </div>

          <div>
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Security</h3>
            <p style="color:var(--text-2);font-size:0.95rem">
              Please email us rather than opening a public issue. See the
              <a href="https://get.nodeau.ai/SECURITY.md">security policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
'''

# ===========================================================================
# THANKS + 404
# ===========================================================================

thanks_body = '''
  <section class="hero" style="min-height:52vh;display:flex;align-items:center">
    <div class="wrap">
      <span class="pill pill-available" style="margin-bottom:1.25rem">Message received</span>
      <h1 style="font-size:var(--step-3)">Thanks — we got it.</h1>
      <p class="lede" style="margin-top:1.15rem">
        We will follow up at the email address you gave us. If it was about the
        Alpha, attaching a support bundle to your reply speeds things up
        considerably.
      </p>
      <div class="btn-row" style="margin-top:2rem">
        <a class="btn btn-primary" href="/">Back to Nodeau</a>
        <a class="btn btn-ghost" href="/alpha/">View the Alpha guide</a>
      </div>
    </div>
  </section>
'''

notfound_body = '''
  <section class="hero" style="min-height:52vh;display:flex;align-items:center">
    <div class="wrap">
      <p class="eyebrow">404</p>
      <h1 style="font-size:var(--step-3)">That page isn’t here.</h1>
      <p class="lede" style="margin-top:1.15rem">
        It may have moved, or it may never have existed. Both happen.
      </p>
      <div class="btn-row" style="margin-top:2rem">
        <a class="btn btn-primary" href="/">Back to Nodeau</a>
        <a class="btn btn-ghost" href="/alpha/">Install Alpha</a>
      </div>
      <p style="margin-top:2rem;color:var(--text-3)">
        Looking for the installer? It lives at
        <a href="https://get.nodeau.ai/">get.nodeau.ai</a>.
      </p>
    </div>
  </section>
'''

# ===========================================================================

print("writing pages:")

page("/roadmap/", "roadmap/index.html", "roadmap",
     "Nodeau Roadmap — Single GPU Today, Fleet Intelligence Next",
     "What Nodeau does today and what is planned: Alpha hardening, more models, WSL, multi-node placement, fleet management and hybrid cloud.",
     roadmap_body)

page("/pricing/", "pricing/index.html", "pricing",
     "Nodeau Pricing — Priced for Infrastructure, Not Tokens",
     "Nodeau Home is coming soon with the Self-Hosted Alpha free today. Nodeau Business is contact-based. Nothing is metered per prompt or token.",
     pricing_body)

page("/about/", "about/index.html", None,
     "About Nodeau — Making Owned GPUs Usable Infrastructure",
     "Why owning a GPU is not the same as having AI infrastructure, how Nodeau decides whether a model fits, and where the project is today.",
     about_body)

page("/faq/", "faq/index.html", None,
     "Nodeau FAQ — Hardware, Models, Privacy and the Alpha",
     "Answers about supported GPUs, drivers, models, local networking, privacy, the experimental Alpha, and Nodeau for teams.",
     faq_body)

page("/contact/", "contact/index.html", None,
     "Contact Nodeau",
     "Get in touch about Nodeau Home, Nodeau Business, Alpha help or becoming a design partner.",
     contact_body)

page("/thanks/", "thanks/index.html", None,
     "Thanks — Nodeau",
     "Your message reached us. We will follow up by email.",
     thanks_body, robots="noindex")

page("/404.html", "404.html", None,
     "Page not found — Nodeau",
     "That page isn’t here.",
     notfound_body, robots="noindex")

print("done")
