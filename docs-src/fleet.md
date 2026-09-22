---
title: Adding and operating Nodeau machines
heading: Adding and operating machines
nav: Adding and operating machines
description: Add a second machine with two commands, see the whole fleet, drain for maintenance, remove a machine, and connect the fleet to a browser — with every edge case.
lede: Your fleet is the machines Nodeau can place work on. Adding one is two commands, and Nodeau handles the cluster membership, the credential and its expiry.
---

:::linux
Everything on this page is Linux with NVIDIA GPUs. **A Mac runs standalone**: it
is a native execution plane, not a Kubernetes node, and it does not join a fleet.
Nodeau will not pretend otherwise — a machine listed as capacity that nothing can
schedule onto reads as capacity and is not.
:::

Adding a machine needs `FeatureMultiNode` — **Home Pro** (up to 3 machines) or
**Business** (unlimited). The free Home plan is one machine, and everything works
on it.

## Before you start

On the **new** machine you need:

- Ubuntu 24.04 LTS on x86_64
- An NVIDIA GPU with a **working driver**
- Network reachability to the existing machine, on your own LAN
- About 20 GB free disk

Nothing else has to be set up first. If the new machine already runs a cluster of
its own, Nodeau **stops and says so** rather than destroying it.

### Ports and connectivity

Machines talk to each other **on your own network**. Nodeau opens nothing to the
internet, and joining needs no port forwarding and no inbound rule on your router.

The new machine reaches the existing one at the address the invitation names —
by default that machine's LAN address, overridable with `--address`.

## Adding a machine

### On the machine that already runs Nodeau

```bash
nodeau fleet invite
```

```text
Add a machine to your fleet

On the new machine, install Nodeau and run:

  curl -fsSL https://get.nodeau.ai/install.sh | bash
  nodeau join NDJ1.eyJ…

This code expires in 15m0s.
```

| Flag | Default | Meaning |
|---|---|---|
| `--expires-in <d>` | `15m` | How long the invitation stands |
| `--address <host>` | this machine's LAN address | The address the new machine should reach this one on |

:::security The code is a credential while it lives
Paste it into the other machine's terminal, not into a chat log. It expires on
its own whether or not anyone uses it, and an already-joined machine never needs
it again. An invitation with no expiry is refused outright.
:::

### On the new machine

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau join NDJ1.eyJ…
```

| Flag | Meaning |
|---|---|
| `--dry-run` | Show what would happen and change nothing |
| `--verbose` | Print every command that would run |
| `--yes`, `-y` | Do not ask for confirmation |
| `--cache-dir <path>` | Where this machine keeps model files |

Joining installs **what a worker needs** and nothing a control plane needs: the
container toolkit, a Kubernetes agent pointed at the invited fleet, and the state
directory. Everything else arrives from the cluster it joins — the device plugin
and Nodeau's hardware agent are delivered by the control plane, not installed by
hand.

The new machine's **model cache starts empty**. Nodeau does not replicate weights
between machines; the new machine downloads what it is asked to run, or you
download it there explicitly with `nodeau model install`.

Its **entitlement comes from the fleet**, not from a second login.

### Check it worked

```bash
nodeau fleet list
```

```text
MY NODEAU
  nodeau-c   online   worker
    NVIDIA GeForce RTX 3080  9,877 MiB
    nodeau-agent v0.X.Y-beta.N, reported 35s ago

  nodeforge   online   control-plane
    NVIDIA GeForce RTX 5060 Ti  15,827 MiB
    nodeau-agent v0.X.Y-beta.N, reported 29s ago
```

Then `nodeau doctor`, which checks every machine's agent and whether each one's
GPU report is fresh enough to schedule against.

## Edge cases

| What happened | What you see |
|---|---|
| **The invitation expired** | *"This invitation expired at …. Invitations last 15m0s by design"*. Mint a new one |
| **The code is damaged** | *"The enrollment code is damaged; copy it again in one piece."* It is one token — a line break in the middle breaks it |
| **It is not a Nodeau code** | Refused by shape, before anything is attempted |
| **The code is from a newer Nodeau** | Refused by version, naming the version it is |
| **The invitation names no address, or no credential** | Refused. An invitation that cannot work is refused rather than half-applied |
| **The plan machine limit is reached** | `nodeau fleet invite` refuses **before minting anything**: *"this installation cannot add another machine … Nothing has been created, and every machine you already have keeps working"* |
| **The new machine already runs a cluster** | Nodeau stops and says so. It will not reconfigure or delete a cluster it did not create |
| **The new machine has no NVIDIA driver** | Refused. Nodeau does not install drivers |
| **A required program is missing** | Refused up front, naming the programs and the command that installs them — rather than failing at step four |
| **The join is interrupted** | Run `nodeau join` again with a fresh invitation. The ledger records what was done |
| **The machine is offline afterwards** | It shows as not reporting. Work already on it keeps running; nothing new is placed there |
| **The machine comes back after a reboot** | It reconnects on its own. **No new invitation is needed** — reconnection is authenticated by the machine's own stored credential |
| **A GPU is moved between machines** | Nodeau believes the **newest** report of a card. The machine that lost it stops offering it; a workload whose placement names a card its machine no longer reports is withdrawn, and its service is kept so it can start again |
| **Versions differ between machines** | Expected. Nodeau's components deliberately sit on different versions when one of them did not change. What is worth acting on is **machines disagreeing with each other** — `nodeau update` shows the fleet |

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
a placement.

**Nothing running on it is stopped, moved or disturbed.** Draining is not
eviction. To empty the machine:

```bash
nodeau scheduling drain --node nodeau-c
nodeau ps -A                       # see what is on it
nodeau stop <name> --workload      # stop each one you want gone
```

Batch jobs already running on a drained machine run to completion; new ones are
not placed there.

```bash
nodeau scheduling undrain --node nodeau-c
```

Undraining puts the machine back into service. It does **not** move anything
back: a healthy workload is never restarted for a better score, and undrain must
not become a back door around that rule.

## Removing a machine

```bash
nodeau fleet remove nodeau-c --dry-run
nodeau fleet remove nodeau-c
```

For a machine that is gone for good — retired, failed or sold. Nodeau removes its
cluster membership, the storage and identity it generated for it, and the
credential that let it reconnect, then frees the plan slot it was using.

| Flag | Meaning |
|---|---|
| `--dry-run` | Show what would be removed and change nothing |
| `--force` | Remove it even though workloads are placed on it |
| `--yes` | Do not ask for confirmation |
| `--json` | Machine-readable |

**Workloads placed on the machine block removal**, because a workload on a
machine you are about to delete is work somebody expects to still be running.
Stop them first, or pass `--force` if the machine is already gone and they can
never come back.

The machine's own installation is **not** touched — run `nodeau uninstall` there
if you still can.

Rejoining afterwards needs a fresh `nodeau fleet invite`. That is the point: a
removed machine must not be able to reappear on its own.

## What Nodeau does not do across machines

- **No failover.** If a machine goes away, what was on it stops. Nodeau does not
  move it, restart it elsewhere or recover it on its own.
- **No migration**, no live repartitioning, no rebalancing.
- **No model replication.** Each machine holds what it holds.
- **No sharding a model across machines.** Several cards in *one* machine, yes —
  see [several GPUs in one machine](/docs/multi-gpu/).
- **No remote shell or arbitrary remote command**, ever.

A workload on a machine whose telemetry has gone stale is **held**, not moved,
and that hold has no timeout.

## Seeing the fleet from a browser

```bash
nodeau login            # link this installation to an account
nodeau fleet connect    # start reporting
nodeau fleet status     # is it reporting?
nodeau fleet disconnect # stop
```

Your machines reach **out** to Nodeau Cloud. **Nothing ever connects in**: no
inbound port, no callback, no remote shell, and `fleet connect` opens none.

What leaves is what a person operating machines needs — which machines exist,
what is plugged into them, what is running, and whether anything is wrong. **What
you compute never does**: prompts, completions, embeddings, images and batch
records stay on your hardware.

Nothing about inference depends on it. If Nodeau Cloud is unreachable, or you
disconnect, your models keep serving and your scheduler keeps scheduling.

**Seeing** your machines is free on every plan. **Changing** one from the browser
needs `FeatureRemoteManagement` — Home Pro or Business.

From the browser you can run and stop workloads, set scheduling policy, drain a
machine for maintenance, read bounded logs and recover a stranded workload.

You cannot set a physical power limit or upgrade a fleet remotely. Those are not
built, and the command that would do them does not exist.

:::note A stop recorded in the cloud is a standing order
Stopping a workload from the browser records desired state. It is re-applied on
every sync to that **copy** of that workload — identified by more than its name,
so a later workload you create locally with the same name is not caught by an old
stop.
:::

## Disconnecting versus logging out

They are different, and doing the wrong one is an inconvenience rather than a
disaster.

| | What it does |
|---|---|
| `nodeau fleet disconnect` | Stops reporting to Nodeau Cloud. The machine **stays linked** to your account for entitlements |
| `nodeau logout` | Removes the account link. Everything keeps running, on the free Home plan |
