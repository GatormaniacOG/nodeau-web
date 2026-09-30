---
title: Nodeau glossary
heading: Glossary
nav: Glossary
description: The words Nodeau uses, each defined once: machine, GPU, fleet, model, workload, endpoint, admission, placement, qualification, upgrade plan, release channel and more.
lede: A few of Nodeau's words mean something narrower than they do elsewhere. Here's each one, defined once, with the command that shows it to you.
---

## Machine, node, GPU

A **machine** is one physical computer running Nodeau. On Linux it's also a
Kubernetes **node**, and the CLI uses the two words for the same thing.
`nodeau fleet list` shows them.

A **GPU** is one physical graphics card, identified by its **UUID**, because an
index can change when hardware does. A card that moves between machines keeps
its UUID, and Nodeau believes the newest report of it.

```bash
nodeau fleet list
nodeau environment       # what this machine has, read-only
```

## Fleet

Your **fleet** is the set of machines Nodeau can place work on. One machine is a
fleet of one, and everything works.

Adding a machine takes two commands: `nodeau fleet invite` here and
`nodeau join` there. See [add and run machines](/docs/fleet/).

A **Mac runs standalone**, on its own native execution plane, rather than as a
member of a fleet.

## Model, artifact, alias

A **model** is a set of weights Nodeau can serve. There are two kinds:

- **Curated**: from Nodeau's catalog, downloaded from the publisher, pinned to
  an immutable revision, with a SHA-256 Nodeau checks.
- **Custom**: a GGUF file you imported yourself. See
  [bring your own model](/docs/byom/).

An **artifact** is the bytes themselves. **A model's identity is the SHA-256 of
its contents**, whatever its filename, whatever you named it and wherever it came
from. Two identical byte streams are one artifact however they arrived, and a
different quantisation is a different artifact.

An **alias** is the name you type to run an imported model. Importing different
bytes under an alias you've used before creates a **new artifact** and tells you
so. The old one is never quietly repointed, and qualification evidence stays with
the bytes it was about.

## Model cache

Each machine keeps its own copy of the weights it needs, in a **model cache**.

| | |
|---|---|
| Linux | `/var/lib/nodeau/models/` |
| macOS | `~/Library/Application Support/Nodeau/state/models/` |

Each machine downloads or imports the models it needs for itself.

**Downloaded and verified are separate columns**, on purpose. A file with the
right name and the right size once served coherent answers for a day while
holding the wrong bytes. Only a computed SHA-256 that matches counts as
verified, and only a verified copy is used for placement.

```bash
nodeau model status        # which machine holds what, and whether it verifies
nodeau model verify <id>   # re-read this machine's copy and recompute
```

## Workload, service, batch job

A **workload** is anything that holds a GPU. There are two kinds:

- a **service** (a `GPUService`): a model serving until you stop it, with an
  endpoint;
- a **batch job** (a `BatchJob`): a finite set of requests that runs and
  finishes.

```bash
nodeau ps     # every workload holding a GPU, of either kind
```

A GPU belongs to exactly one workload at a time, so nothing competes for its
memory.

## Endpoint

The **local endpoint** is an HTTP reverse proxy from `127.0.0.1` to the model
server, so you can call an OpenAI-compatible API without knowing anything about
cluster addressing.

It binds loopback, always: it isn't a setting. It runs as a **user service**
(systemd on Linux, launchd on macOS), so it keeps running after you close the
terminal.

The workload and its endpoint are separate. `nodeau stop <name>` stops the
endpoint and leaves the model loaded, so starting again is instant, and
`--workload` stops the model too and frees the card.

## Admission and placement

**Admission** is the decision *can this safely run?* It happens **before**
anything is created, from a prediction of peak VRAM, and it's recorded.

**Placement** is the separate decision *where should it run?* It chooses among
the candidates admission has already accepted.

```bash
nodeau service explain <name>     # the admission arithmetic
nodeau placement explain <name>   # why this machine and this card
```

Both are covered in [how Nodeau decides](/docs/scheduling/).

## Reservation

When Nodeau admits a workload it records a **reservation**: this workload holds
this much memory on this card. That record is how Nodeau accounts for memory,
rather than a reading taken off the card, because a workload still pulling its
image holds nothing yet, and crediting it would hide real use by something else.

## Estimated and measured

When a configuration has been **measured** on hardware like yours, Nodeau uses
the measurement. When it hasn't, Nodeau works out a figure from the model's own
architecture and file size, adds a further margin, and labels the decision
**estimated**.

You can always tell which one you got. `nodeau model info <model>` lists the
configurations that have actually been measured, and an empty list is a real
answer.

## Qualification

**Qualification** is for imported models. It's the real run that establishes
what a model can do on your hardware: Nodeau starts it, watches how much memory
it really takes, and tries each capability with a probe designed to fail if the
model can't do it.

**Importing comes before qualifying, and loading isn't qualifying either.** A
model is described by a capability only after it has proved it. See
[bring your own model](/docs/byom/#qualification).

## Task and capability

A **task** is what a workload is started to do: `chat`, `embed` or `rerank`. It
decides which API routes the endpoint answers.

A **capability** is finer-grained: `chat`, `embed`, `rerank`, `tools`,
`structured-output` or `vision-input`. A model can have some and not others,
and qualification reports each one separately. A model whose chat passed and
whose tool calling failed is described for chat, and only chat.

## Scheduling mode

How Nodeau chooses between candidates. It's one choice, for the whole fleet or
for one machine:

| Mode | Means |
|---|---|
| `efficiency` | The most work per unit of energy, and never much slower |
| `balanced` | Fastest, while staying close to the best efficiency. **The default** |
| `performance` | Fastest, whatever it costs |

A mode change affects **new placements only**, and everything running stays
where it is.

## Drain

**Draining** a machine stops Nodeau choosing it for anything new, while
everything already running there carries on untouched.

```bash
nodeau scheduling drain --node <machine>
nodeau scheduling undrain --node <machine>
```

Undraining leaves every workload where it is now. A healthy workload is never
restarted for a better score, and undraining keeps to that rule too.

## Limit and quota

Two different things, and each points you to a different person.

| | What it is | Who changes it |
|---|---|---|
| **Limit** | What your plan grants: machines, GPUs in any one machine, workloads at once | A plan change |
| **Quota** | Your organisation's own number, set *inside* the limit | Whoever manages your organisation's policy, straight away |

Every refusal says which one it was, with its own reason code. See
[limits and policies](/docs/governance/).

## Entitlement

An **entitlement** is a signed statement of what an installation may do. It's
verified **offline**, against keys compiled into the binary, so a network outage
never changes what your hardware is allowed to do.

With no entitlement, or one that can't be accepted, an installation runs the free
Home plan. Everything that protects you comes with every plan: admission,
artifact verification, authentication and every integrity check.

## Release channel

A **release channel** is a named pointer to a published release. `beta` is the
one the installer follows by default, and a channel only ever moves forward.
When Nodeau resolves a channel, it pins it to a version, the commit it was built
from and the digest of every artifact it names. See
[updates and release channels](/docs/updates/).

## Upgrade plan

An **upgrade plan** is what `nodeau fleet upgrade plan` gives you: one resolved
release, and for each machine what would change, in what order, and what it
would mean for the workloads running there. It changes nothing.

A **rollout** is what `nodeau fleet upgrade apply` starts once you approve a
plan: Nodeau moves your machines one at a time, workers first and the
control-plane machine last, and checks each one on what it reports before the
next. See [upgrading a fleet](/docs/upgrades/).

## Maintenance window

A **maintenance window** is when your organisation lets Nodeau act on your
machines on its own, in your own time zone. An approved rollout starts a machine
only inside it. Work you ask for always starts straight away, and nothing
running is touched when a window opens or closes. Setting one from your account
is [in progress](/roadmap/); see [updates and release channels](/docs/updates/).

## Control plane

On Linux, Nodeau's **control plane** is a controller and a node agent running in
your own Kubernetes cluster, in the `nodeau-system` namespace. The controller
makes the decisions, and the agent on each machine reports that machine's
hardware.

Inference traffic goes straight to the model and never passes through the
control plane, so a model that's already serving keeps serving while the control
plane restarts. New decisions wait until it's back, and batch workers read their
records through it.

On a Mac, the same decisions are made in-process by Nodeau's native execution
plane, with no cluster involved.

## The local dashboard

```bash
nodeau dashboard
```

A read-only view of hardware, models, running services, alerts and your plan,
bound to loopback and protected by a token. The page is compiled into the
binary, so there's nothing to install or download, and it works with no internet
connection. It's read-only apart from one action: it can stop a batch job.

## Nodeau Cloud

`app.nodeau.ai` and `api.nodeau.ai`. It's optional, and inference never depends
on it.

Signing in gives you an account, a registered installation and a signed
entitlement. Connecting a fleet also lets you see your machines from a browser,
and with Home Pro or Business, operate them from there.

**Your machines reach out, and every connection starts on your side.** There's
no inbound port to open, no callback and no remote shell. What you compute stays
on your hardware: prompts, completions, embeddings, images and batch records
never leave it. See [security and privacy](/docs/security/).
