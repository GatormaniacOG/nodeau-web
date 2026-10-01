---
title: Nodeau documentation
heading: What is Nodeau?
nav: What is Nodeau?
description: Nodeau turns the GPUs you already own into a private AI cloud. Install it, run a model, add machines, and call it from any OpenAI-compatible client.
lede: Nodeau turns the GPUs you already own into one private AI cloud. A couple of commands get you a model running on your own hardware, behind an OpenAI-compatible endpoint.
---

Nodeau is software you install on your own computer. It finds your graphics
cards, works out what each one can hold, downloads and verifies model weights,
starts a model server, and hands you a local endpoint that any
OpenAI-compatible client can call.

Your prompts and answers stay on your hardware. The model runs on your card,
the request goes to `127.0.0.1`, and the reply comes straight back.

## The shape of it

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash   # get the CLI
nodeau install                                       # set the machine up
nodeau quickstart                                    # download a model and serve it
```

On a Mac the last step is `nodeau run <model>`. See
[Install on a Mac](/docs/install-macos/) for that path.

Then send it a request:

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $(nodeau auth show --quiet)" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hello."}],"max_tokens":2048}'
```

That's it. Your model is live, on your machine.

## It checks the fit before it starts anything

Every model needs GPU memory for its weights, for its context and for the
runtime around it. Nodeau works that out **before** it starts the model, and
compares it with what your card can really give: the memory the card can
address, minus what your desktop and other programs already use, minus a
safety reserve.

You can ask it for any model, on every machine you have:

```bash
nodeau model status qwen3.5-4b-q4km
```

```text
Will it fit? (judged as if the card were free of Nodeau workloads)
  NODE       GPU                         VERDICT          NEEDS      AVAILABLE   HEADROOM
  nodeau-c   NVIDIA GeForce RTX 3080     yes (estimated)  4,406 MiB  9,365 MiB   4,959 MiB
  nodeforge  NVIDIA GeForce RTX 5060 Ti  yes              3,512 MiB  15,315 MiB  11,803 MiB
```

When a model fits, you're told how much room is left. When it doesn't, Nodeau
says so before anything loads, shows the arithmetic, and suggests what would
change the answer, such as a shorter context or a smaller model. A clear answer
with the numbers beats a crash a minute into loading.

Notice the word *estimated* on the first row. Where Nodeau has measured a
configuration on hardware like yours, it uses the measurement. Where it hasn't,
it works out a careful figure from the model's own shape, adds a margin, and
tells you so. See [measured and estimated](/docs/scheduling/#estimated-and-measured).

Every decision is recorded, so you can always ask why:

```bash
nodeau service explain qwen-local     # the memory arithmetic behind the decision
nodeau placement explain qwen-local   # why this machine and this card
```

## One machine, or a fleet

Start with one machine. When you're ready for more, adding another is two
commands: `nodeau fleet invite` on the machine you have, and `nodeau join` on the
new one. From then on Nodeau chooses where each workload runs from what every
machine reports about itself.

With more than one machine you can:

- see every machine, card and workload in one place, in a terminal or from your
  account on the web ([add and run machines](/docs/fleet/))
- keep an eye on how each machine is doing, with alerts when something needs
  attention ([health and alerts](/docs/health/))
- set your organisation's own limits on what the fleet may run
  ([limits and policies](/docs/governance/))
- see what your hardware has been doing, in accelerator-hours, and who changed
  what ([usage and audit](/docs/usage/))
- update the whole fleet from one place: preview the rollout with
  `nodeau fleet upgrade plan`, then approve it with `nodeau fleet upgrade apply`
  ([upgrading a fleet](/docs/upgrades/))

## Where Nodeau runs

- **Linux with NVIDIA GPUs.** Nodeau sets up and looks after a small Kubernetes
  cluster for you, and runs each model on your cards through CUDA. This is the
  whole product: several machines, several cards in each, batch inference, your
  own models, and every task from chat to image input.
- **Apple Silicon Macs.** Nodeau runs chat, embedding, reranking and vision
  models natively on the Mac's GPU through Metal, several at once, with no
  containers and no password. A Mac runs standalone, which makes it a lovely
  private endpoint on a laptop.

The catalog, the fit checks, entitlements and the CLI are the same on both. The
full matrix is in [requirements and platforms](/docs/requirements/).

## How Nodeau keeps things predictable

A few design choices are worth knowing before you build on Nodeau. Each one is
there so the machine does what you expect.

- **Running work stays where Nodeau put it.** A healthy workload is never
  restarted to chase a better score. If a machine goes offline, what it was
  running stops with it, and Nodeau keeps the service itself, so there is
  nothing to recreate.
- **Memory is counted card by card.** When one model is split across several
  GPUs in one machine, each card holds its own share, and the smaller card fills
  first. Splitting adds capacity for a model too big for one card. For more
  throughput, run separate copies. See [several GPUs in one machine](/docs/multi-gpu/).
- **A GPU belongs to one workload at a time.** Nothing else competes for its
  memory, so a model that fits keeps fitting.
- **Your driver, boot setup and disks stay yours.** Nodeau checks the NVIDIA
  driver and leaves it, Secure Boot, the bootloader and your partitions exactly
  as they are.
- **Your prompts stay on your hardware.** Requests go to `127.0.0.1` and to the
  model on your card. If you connect a fleet to your account, what travels is
  the state of your machines, and what you compute stays home. See
  [security and privacy](/docs/security/).

## Accounts are optional

Nodeau runs completely without an account. Local inference, the model catalog,
the dashboard, artifact verification and the fit checks all work with no
connection to Nodeau Cloud.

Signing in registers the installation and gives it a signed entitlement, which
is how a paid plan reaches a machine, and it lets you see your machines from a
browser. See [accounts and plans](/docs/accounts/).

## What's in these docs

| If you want to | Start at |
|---|---|
| Check your hardware | [Requirements and platforms](/docs/requirements/) |
| Set up a Linux machine with an NVIDIA GPU | [Install on Linux](/docs/install-linux/) |
| Set up an Apple Silicon Mac | [Install on a Mac](/docs/install-macos/) |
| Get a model running | [Your first model](/docs/quickstart/) |
| Call it from code | [The OpenAI-compatible API](/docs/api/) |
| Use embeddings, reranking, tools or images | [Embeddings, reranking, tools and vision](/docs/tasks/) |
| Choose a model | [The model catalog](/docs/models/) |
| Run a GGUF file of your own | [Bring your own model](/docs/byom/) |
| Work through a file of requests | [Batch inference](/docs/batch/) |
| Add a second machine | [Add and run machines](/docs/fleet/) |
| Understand a decision | [How Nodeau decides](/docs/scheduling/) |
| Upgrade the whole fleet | [Upgrading a fleet](/docs/upgrades/) |
| Look up a command | [CLI reference](/docs/cli/) |
| Fix something | [Troubleshooting](/docs/troubleshooting/) |
