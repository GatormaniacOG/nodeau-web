---
title: Add and run machines in a Nodeau fleet
heading: Add and run machines
nav: Add and run machines
description: Add a machine with two commands, see the whole fleet, drain one for maintenance, remove one, and see and operate your fleet from a browser.
lede: Your fleet is the machines Nodeau can place work on. Adding one takes two commands, and Nodeau handles the cluster membership, the credential and its expiry for you.
---

:::linux Fleets are Linux machines with NVIDIA GPUs
Every machine in a fleet runs Linux with an NVIDIA GPU. A Mac runs Nodeau
standalone, as its own private endpoint, and is updated and managed on the Mac
itself.
:::

:::homepro Several machines come with Home Pro and Business
Home Pro runs up to three machines in one fleet, and Business has no fixed limit.
The free Home plan is one machine, and everything on it works on its own.
:::

## Before you start

On the **new** machine you need:

- Ubuntu 24.04 LTS on x86_64
- An NVIDIA GPU with a **working driver**
- A route to the existing machine on your own network
- About 20 GB of free disk

Nothing else has to be set up first. If the new machine already runs a cluster of
its own, Nodeau stops and says so, and leaves that cluster exactly as it is.

### Ports and connectivity

Machines talk to each other **on your own network**. Joining needs no port
forwarding and no inbound rule on your router, and nothing is opened to the
internet.

The new machine reaches the existing one at the address the invitation names,
which is that machine's LAN address unless you choose another with `--address`.

## Adding a machine

### On the machine that already runs Nodeau

```bash
nodeau fleet invite
```

```text
Add a machine to your fleet

On the new machine, install Nodeau and run:

  curl -fsSL https://get.nodeau.ai/install.sh | bash
  nodeau join nodeau-join-eyJ…

  This invitation expires at 14:32:07. Treat it as a password until then.
  The new machine needs an NVIDIA GPU with its driver already working, and must be able to reach this one on your network.
```

| Flag | Default | Meaning |
|---|---|---|
| `--expires-in <d>` | `15m` | How long the invitation stands |
| `--address <host>` | this machine's LAN address | The address the new machine should reach this one on |

:::security The code is a credential while it lives
Paste it into the other machine's terminal rather than into a chat log. It
expires on its own whether or not anyone uses it, and a machine that has joined
never needs it again. Every invitation carries an expiry: one without is refused.
:::

### On the new machine

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau join nodeau-join-eyJ…
```

| Flag | Meaning |
|---|---|
| `--dry-run` | Show what would happen and change nothing |
| `--verbose` | Print every command that would run |
| `--yes`, `-y` | Skip the confirmation |
| `--cache-dir <path>` | Where this machine keeps model files |

Joining installs **what a worker needs**: the container toolkit, a Kubernetes
agent pointed at your fleet, and the state directory. The rest arrives from the
fleet itself, including the device plugin and Nodeau's hardware agent, which the
control plane delivers.

Each machine keeps **its own model cache**, starting empty. The new machine
downloads what it is asked to run, or you can fetch a model there ahead of time
with `nodeau model install`.

Its **entitlement comes from the fleet**, so there is no second sign-in.

### Check it worked

```bash
nodeau fleet list
```

```text
MY NODEAU
  fleet     2 of 3 machines (home-pro)

  nodeau-c   online   worker
    NVIDIA GeForce RTX 3080  9,877 MiB
    nodeau-agent v0.X.Y-beta.N, reported 25s ago

  nodeforge   online   control-plane
    NVIDIA GeForce RTX 5060 Ti  15,827 MiB
    nodeau-agent v0.X.Y-beta.N, reported 26s ago

  Add a machine:  nodeau fleet invite
```

Then `nodeau doctor`, which checks every machine's agent and whether each GPU
report is fresh enough to schedule against.

## When joining needs another go

| What happened | What to do |
|---|---|
| **The invitation expired** | Invitations last 15 minutes by design. Run `nodeau fleet invite` again for a fresh code |
| **The code is damaged** | It is one token, and a line break in the middle breaks it. Copy it again in one piece |
| **It is not a Nodeau code** | Nodeau checks the shape before doing anything. Paste the code `nodeau fleet invite` printed |
| **The code is from a newer Nodeau** | The message names both versions. Update the joining machine first |
| **The invitation names no address or no credential** | It could not work, so it was refused before anything changed. Mint a new one |
| **The plan's machine limit is reached** | `nodeau fleet invite` says so **before creating anything**, and every machine you have keeps working. Remove a machine you no longer use, or move to a larger plan |
| **The new machine already runs a cluster** | Nodeau stops and says so, and leaves that cluster alone |
| **The new machine has no working NVIDIA driver** | Install your distribution's driver, check `nvidia-smi`, and join again |
| **A required program is missing** | Refused up front, naming the programs and the command that installs them |
| **The join was interrupted** | Run `nodeau join` again with a fresh invitation. The ledger records what was done |

### After it has joined

| What happens | What you see |
|---|---|
| **The machine goes offline** | It shows as not reporting, and nothing new is placed there |
| **It comes back after a reboot** | It reconnects on its own with the credential it already holds. No new invitation is needed |
| **A GPU moves between machines** | Nodeau believes the **newest** report of a card, and the machine that lost it stops offering it. A workload whose placement names a card its machine no longer reports is withdrawn, and its service is kept so it can start again |
| **Machines run different versions** | Expected within one machine's components. What is worth acting on is machines disagreeing with each other, and `nodeau update` shows the fleet |

## Seeing the fleet

```bash
nodeau fleet list                 # machines, GPUs, agent versions, freshness
nodeau ps -A                      # every workload, everywhere
nodeau status                     # workloads and local endpoints
nodeau model status               # which machine holds which weights, verified or not
nodeau health                     # processor, memory, storage, network, alerts
nodeau doctor                     # is everything working, and what to do if not
nodeau placement explain <name>   # why a workload is where it is
nodeau update                     # what each machine is running
```

## Draining for maintenance

```bash
nodeau scheduling drain --node nodeau-c
```

Nodeau stops choosing that machine for anything new, and says so when it explains
a placement. **Everything already running on it carries on untouched**, so
draining is a gentle first step. To empty the machine as well:

```bash
nodeau ps -A                       # see what is on it
nodeau stop <name> --workload      # stop each one you want gone
```

Batch jobs already running on a drained machine run to completion, and new ones
go elsewhere.

```bash
nodeau scheduling undrain --node nodeau-c
```

Undraining puts the machine back into service. Work that went elsewhere while it
was drained stays where it is, because a healthy workload is never restarted just
to land somewhere Nodeau now likes better.

## Removing a machine

```bash
nodeau fleet remove nodeau-c --dry-run
nodeau fleet remove nodeau-c
```

For a machine that is gone for good: retired, failed or sold. Nodeau removes its
cluster membership, the storage and identity it generated for it, and the
credential that let it reconnect, then frees the plan slot it was using.

| Flag | Meaning |
|---|---|
| `--dry-run` | Show what would be removed and change nothing |
| `--force` | Remove it even though workloads are placed on it |
| `--yes` | Skip the confirmation |
| `--json` | Machine-readable |

**Workloads placed on the machine hold up removal**, because a workload on a
machine you are about to delete is work somebody expects to be running. Stop them
first, or pass `--force` when the machine is already gone and they can never come
back.

The machine's own installation stays as it is: run `nodeau uninstall` there if
you still can.

Rejoining afterwards takes a fresh `nodeau fleet invite`. That is the point: a
removed machine can only come back because you invited it.

## How work stays put

Nodeau is careful about moving things, and these rules are worth knowing before
you build on a fleet.

- **Running workloads stay where Nodeau placed them.** A healthy workload is never
  restarted somewhere else for a better score.
- **A machine that stops reporting keeps its work.** If the workloads on it are
  still running, Nodeau holds them where they are for as long as it takes, rather
  than guessing.
- **A machine that goes offline takes its workloads with it until it comes back.**
  Nodeau keeps each service, and starts it again when a placement is possible.
  Plan for a machine being offline the way you would for any single computer.
- **Each workload runs within one machine.** One model can use several cards in
  the same machine; see [several GPUs in one machine](/docs/multi-gpu/).
- **Each machine keeps its own model cache**, and verifies its own copy of every
  model by hash.
- **The console asks, and your machines decide.** Operating a machine from the
  browser works through a fixed set of operations your machines pick up on their
  own schedule. There is no remote shell and no way to run an arbitrary command.

## Seeing the fleet from a browser {#seeing-the-fleet-from-a-browser}

```bash
nodeau login            # link this installation to an account
nodeau fleet connect    # start reporting
nodeau fleet status     # is it reporting?
nodeau fleet disconnect # stop reporting
```

Run these on the machine that runs your fleet's control plane. It reports for the
whole fleet.

Your machines reach **out** to Nodeau Cloud, and every connection starts on your
side: there is no inbound port, no callback and no remote shell, and
`fleet connect` opens none.

What travels is what a person running machines needs: which machines exist, what
is plugged into them, what is running, and whether anything needs attention.
**What you compute stays on your hardware**: prompts, completions, embeddings,
images and batch records never leave it.

Inference carries on regardless. If Nodeau Cloud is unreachable, or you
disconnect, your models keep serving and your scheduler keeps scheduling.

**Seeing** your machines from the browser is part of every plan. **Operating**
them from there comes with Home Pro and Business:

- run and stop workloads,
- set scheduling policy,
- drain a machine for maintenance,
- read bounded logs,
- recover a workload stranded on a machine that has gone.

Two things stay on the machine itself: power limits, which you set with
`nodeau power set` on the machine that holds the card, and upgrades, which run on
each machine with the installer. Preview an upgrade first with
`nodeau fleet upgrade plan`; see [planning a fleet upgrade](/docs/upgrades/).

:::note A stop from the browser is a standing order for one copy
Stopping a workload from the browser records what you want, and it is re-applied
on every sync to **that copy** of the workload. Each copy is identified by more
than its name, so a workload you later create locally with the same name starts
normally.
:::

## Disconnecting and logging out

They do different things, and mixing them up is easy to put right.

| | What it does |
|---|---|
| `nodeau fleet disconnect` | Stops reporting to Nodeau Cloud. The machine **stays linked** to your account for its entitlement |
| `nodeau logout` | Removes the account link. Everything keeps running, on the free Home plan |

## Updating the machines in a fleet

Update one machine at a time, workers first and the control-plane machine last,
after previewing the move with `nodeau fleet upgrade plan`. The whole routine is
in [updates and release channels](/docs/updates/), and the planner is described in
[planning a fleet upgrade](/docs/upgrades/).
