---
title: Nodeau documentation
heading: What is Nodeau?
nav: What is Nodeau?
description: Nodeau turns a GPU you already own into a private, OpenAI-compatible AI endpoint. Installation, the CLI, models, fleets, batch inference and troubleshooting.
lede: Nodeau turns GPUs you already own into a private AI service. Two commands get you a running model and an OpenAI-compatible endpoint on your own hardware.
---

Nodeau is software you install on your own computer. It finds your graphics
cards, works out what they can hold, downloads and verifies model weights,
starts a model server, and gives you a local endpoint that any
OpenAI-compatible client can call.

Nothing you compute leaves the machine. The model runs on your card, the
request goes to `127.0.0.1`, and the answer comes back without crossing your
network.

## The shape of it

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash   # get the CLI
nodeau install                                       # set the machine up
nodeau quickstart                                    # download a model, serve it
```

Then:

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $(nodeau auth show --quiet)" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hello."}]}'
```

## What makes it more than a wrapper

Nodeau predicts how much GPU memory a workload will need **before** starting
it, and refuses the ones that will not fit — with the arithmetic, and with
something to do about it.

```text
Refused   GPU_TOO_SMALL
  needs   11,240 MiB   weights 8,590 + KV cache 2,048 + runtime overhead 602
  free     9,365 MiB   15,827 addressable − 5,950 in use − 512 reserve

  Try a smaller context: --context-size 2048 brings it to 9,192 MiB
```

That refusal is the product working. The alternative — starting it anyway and
letting the kernel kill it — is a crash loop with no explanation, and it is
what Nodeau exists to avoid.

Every decision is recorded and can be replayed:

```bash
nodeau service explain qwen-local     # the VRAM arithmetic behind the decision
nodeau placement explain qwen-local   # why this machine and this card won
```

## What is in these docs

| If you want to | Start at |
|---|---|
| Check your hardware is suitable | [Platform support and requirements](/docs/requirements/) |
| Set up a Linux machine with an NVIDIA GPU | [Install on Linux](/docs/install-linux/) |
| Set up an Apple Silicon Mac | [Install on macOS](/docs/install-macos/) |
| Get a model running in about ten minutes | [Quickstart](/docs/quickstart/) |
| Call the model from code | [The API and your first request](/docs/api/) |
| Learn the vocabulary | [Core concepts](/docs/concepts/) |
| Look up a command | [CLI reference](/docs/cli/) |
| Run a model file of your own | [Bring your own model](/docs/byom/) |
| Add a second machine | [Adding and operating machines](/docs/fleet/) |
| Understand a refusal | [Admission, scheduling and placement](/docs/scheduling/) |
| Fix something | [Troubleshooting](/docs/troubleshooting/) |

## Where Nodeau runs

Two platforms, and they are genuinely different underneath.

- **Linux with an NVIDIA GPU.** Nodeau runs workloads through Kubernetes and
  CUDA. This is the full product: several machines, several cards in one
  machine, batch inference.
- **Apple Silicon.** Nodeau runs models natively through Metal, with no
  Kubernetes, no containers and no password. A Mac runs standalone: it does not
  join a fleet, and batch inference is Linux-only.

The catalog, admission, the planner, entitlements and the CLI are the same on
both. See [platform support](/docs/requirements/) for the full matrix.

## What Nodeau does not do

Documented as first-class information, because finding out later is worse.

- It does not **move a running workload**. Placement decides once and then
  holds. There is no failover, no migration and no automatic rescheduling — if
  a machine goes away, the workload on it stops, and Nodeau tells you.
- It does not **pool GPU memory**. Two 8 GB cards are not a 16 GB card. One
  model can be split across several cards in one machine, which buys capacity
  and costs speed.
- It does not **share a card between workloads**. A GPU is held by one workload
  at a time. No time-slicing, no MIG, no preemption.
- It does not **manage your NVIDIA driver**, your bootloader, Secure Boot or
  your partitions.
- It does not **send your prompts anywhere**. See
  [security and privacy](/docs/security/) for what does and does not cross each
  boundary.

## Accounts are optional

Nodeau runs completely without an account. Local inference, the model catalog,
the dashboard, artifact verification and admission all work with no connection
to Nodeau Cloud, and none of them will ask for one.

Signing in adds an account association, a registered installation and a signed
entitlement — which is how a paid plan reaches the machine. See
[accounts, plans and entitlements](/docs/accounts/).
