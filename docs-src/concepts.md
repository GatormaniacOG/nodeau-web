---
title: Nodeau core concepts
heading: Core concepts
nav: Core concepts
description: The vocabulary Nodeau uses — machine, GPU, fleet, workload, service, endpoint, model cache, admission, reservation, qualification, entitlement, drain and control plane.
lede: Nodeau's words mean specific things, and several of them mean something narrower than they do elsewhere. Each one is defined once here.
---

## Machine, node, GPU

A **machine** is one physical computer running Nodeau. On Linux it is also a
Kubernetes **node**; the two words are used interchangeably in the CLI, and
`nodeau fleet list` shows them.

A **GPU** is one physical graphics card, identified by its **UUID** — never by
an index, which moves. A card that is moved between machines keeps its UUID, and
the newest report of it is the one Nodeau believes.

```bash
nodeau fleet list
nodeau environment       # what this machine has, read-only
```

## Fleet

Your **fleet** is the set of machines Nodeau can place work on. One machine is
a fleet of one, and everything works.

Adding a machine is two commands — `nodeau fleet invite` here, `nodeau join`
there. See [adding and operating machines](/docs/fleet/).

A **Mac is not part of a fleet.** It runs standalone on its own execution plane
and is not a Kubernetes node.

## Model, artifact, alias

A **model** is a set of weights Nodeau can serve. Two kinds:

- **Curated** — from Nodeau's catalog, downloaded from the publisher, pinned to
  an immutable revision, with a SHA-256 Nodeau checks.
- **Custom** — a GGUF file you imported yourself. See
  [bring your own model](/docs/byom/).

An **artifact** is the bytes. **A model's identity is the SHA-256 of its
contents** — not its filename, not the name you gave it, not where it came from.
Two identical byte streams are one artifact however they arrived; a different
quantisation is a different artifact.

An **alias** is the name you type to run an imported model. Re-importing
different bytes under an alias you have used before creates a **new artifact** and
says so; it never silently repoints the old one, and the previous
qualification evidence does not carry across.

## Model cache

Each machine keeps its own copy of the weights it needs, in a **model cache**.

| | |
|---|---|
| Linux | `/var/lib/nodeau/models/` |
| macOS | `~/Library/Application Support/Nodeau/state/models/` |

Nodeau does not replicate models between machines. Each machine downloads or
imports what it needs.

**Downloaded and verified are different columns**, deliberately. A file of the
right name and the right size served coherent answers for a day on one machine
while being the wrong bytes. Only a computed SHA-256 that matches counts as
verified, and only a verified copy can be placed against.

```bash
nodeau model status        # which machine holds what, and whether it verifies
nodeau model verify <id>   # re-read this machine's copy and recompute
```

## Workload, service, batch job

A **workload** is anything that holds a GPU. There are two kinds:

- a **service** (a `GPUService`) — a model serving indefinitely, with an
  endpoint;
- a **batch job** (a `BatchJob`) — a finite set of requests that runs and
  finishes.

```bash
nodeau ps     # every workload holding a GPU, of either kind
```

A GPU is held by exactly one workload at a time. Nodeau does not share a card,
time-slice it or partition it.

## Endpoint

The **local endpoint** is an HTTP reverse proxy from `127.0.0.1` to the model
server, so you can call an OpenAI-compatible API without knowing anything about
cluster addressing.

It binds loopback and nothing else, and that is not a setting. It runs as a
**user service** — systemd on Linux, launchd on macOS — so it survives closing
the terminal.

The workload and its endpoint are separate. `nodeau stop <name>` stops the
endpoint and leaves the model loaded, so starting again is instant;
`--workload` stops the model too and frees the card.

## Admission

**Admission** is the decision *can this safely run?* It happens **before**
anything is created, from a prediction of peak VRAM, and it is recorded.

**Placement** is the separate decision *where should it run?* It only gets to
choose among candidates admission has already accepted.

```bash
nodeau service explain <name>     # the admission arithmetic
nodeau placement explain <name>   # why this machine and this card
```

Both are covered in [admission, scheduling and placement](/docs/scheduling/).

## Reservation

When Nodeau admits a workload it records a **reservation**: this workload holds
this much memory on this card. That ledger — not a reading taken from the card —
is how Nodeau attributes memory, because a workload still pulling its image
genuinely holds nothing yet, and crediting it would hide real usage by something
else.

## Estimated and measured

Where a configuration has been **measured** on hardware like yours, Nodeau uses
the measurement. Where it has not, it computes a figure from the model's own
architecture and artifact size, adds a further margin, and labels the decision
**estimated**.

An estimate is never presented as a measurement. `nodeau model info <model>`
lists which configurations have actually been measured, and an empty list is a
real answer.

## Qualification

**Qualification** applies to imported models. It is the physical run that
establishes what a model can actually do on your hardware: Nodeau starts it,
watches how much memory it really takes, and exercises each capability with a
probe designed to fail if the model cannot do it.

**Importing is not qualifying, and loading is not qualified.** A model claims a
capability only after it has proved it. See
[bring your own model](/docs/byom/#qualification).

## Task and capability

A **task** is what a workload is started to do: `chat`, `embed`, `rerank`. It
decides which API routes the endpoint answers.

A **capability** is finer: `chat`, `embed`, `rerank`, `tools`,
`structured-output`, `vision-input`. A model may have some and not others, and
qualification reports them one at a time — a model whose chat passed and whose
tool calling failed is claimed for chat and for nothing else.

## Scheduling policy

How Nodeau chooses between candidates. One choice, fleet-wide or per machine:

| Mode | Means |
|---|---|
| `efficiency` | The most work per unit of energy, never much slower |
| `balanced` | Fastest, while staying near the best efficiency — **the default** |
| `performance` | Fastest, whatever it costs |

A change to the mode affects **new placements only**. Nothing already running
moves.

## Drain

**Draining** a machine stops Nodeau choosing it for anything new. Nothing
running on it is stopped, moved or disturbed.

```bash
nodeau scheduling drain --node <machine>
nodeau scheduling undrain --node <machine>
```

Undraining does not move anything back, deliberately: a healthy workload is
never restarted for a better score, and undrain must not become a back door
around that rule.

## Limit, quota, permission

Three different things, and sending somebody to the wrong one wastes their day.

| | What it is | Who changes it |
|---|---|---|
| **Limit** | What your plan grants — machines, GPUs per machine, services at once | A purchase |
| **Quota** | Your organisation's own number, set *inside* the limit | A colleague, this minute |
| **Permission** | What a principal in your organisation may do | An administrator |

Every refusal says which of the three it was, with its own reason code. See
[organisation limits](/docs/governance/).

## Entitlement

An **entitlement** is a signed statement of what an installation may do. It is
verified **offline**, against keys compiled into the binary, so a network outage
cannot change what your hardware is allowed to do.

No entitlement, or one that cannot be accepted, means the free Home plan. Nothing
that protects you is ever withheld: admission, artifact verification,
authentication and every integrity check are identical on every plan.

## Control plane

On Linux, Nodeau's **control plane** is a controller and a node agent running in
your own Kubernetes cluster, in the `nodeau-system` namespace. The controller
makes the decisions; the agent on each machine reports that machine's hardware.

Inference traffic never crosses the control plane. A control plane that is down
does not stop a model that is already serving — though it does stop new
decisions being made, and a batch job's records are read through it.

On macOS there is no control plane. The same decisions are made in-process by
the native execution plane.

## The local dashboard

```bash
nodeau dashboard
```

A read-only view of hardware, models, running services, alerts and plan, bound to
loopback and protected by a token. The page is compiled into the binary: nothing
to install, nothing to download, works with no internet connection. It is
read-only apart from one action — it can stop a batch job.

## Nodeau Cloud

`app.nodeau.ai` and `api.nodeau.ai`. Optional, and nothing about inference
depends on it.

Signing in gives you an account association, a registered installation and a
signed entitlement. Connecting a fleet additionally lets you see and operate your
machines from a browser.

**Your machines reach out. Nothing ever connects in.** There is no inbound port,
no callback and no remote shell. What you compute never leaves: prompts,
completions, embeddings, images and batch records stay on your hardware. See
[security and privacy](/docs/security/).
