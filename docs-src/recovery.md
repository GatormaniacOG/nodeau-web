---
title: Recovery and model copies in a Nodeau fleet
heading: Recovery and model copies
nav: Recovery and model copies
description: Keep a verified copy of a model on another of your machines, and have Nodeau bring a workload back up there by itself when its machine stops answering.
lede: When a machine in your fleet stops answering, each workload on it does what you chose for it. Recovery off, it waits for its machine. Recovery on, Nodeau starts it on another of your machines after the delay you set, from a copy of its model that's already there.
---

:::linux Recovery is for Linux fleets
Every machine in a fleet runs Linux with an NVIDIA GPU. A Mac runs Nodeau
standalone, so its workloads start and stop with the Mac itself, and the
commands on this page say so when you run them there.
:::

:::homepro Recovery and copies come with Home Pro and Business
Both are properties of a fleet, so they're part of Home Pro and Business. The free
Home plan is one machine, and everything on it keeps working exactly as it does.
:::

## How it works {#how-it-works}

Your control-plane machine watches every machine in the fleet. A machine counts as
**stopped answering** only when both of its signals have gone quiet: its Kubernetes
agent and Nodeau's own report from that machine. Either one alone is worth a look,
and it moves nothing.

```text
  reporting      both signals fresh                                 nothing to do
  degraded       one signal quiet (an agent down, or a kubelet)     nothing moves
  unreachable    both quiet, since a moment Nodeau records          your choice applies
  upgrading      a fleet upgrade is restarting it on purpose        nothing moves
```

Once a machine has been unreachable for the delay you chose, each workload on it
that's set to recover automatically is placed again, by the same admission and
scheduling that placed it the first time: your plan, your organisation's limits
and the cards' real memory all apply. It starts on the machine Nodeau chooses,
and **its endpoint stays the same**, so a client keeps the address it already has.

The decision is made on your control-plane machine. It needs no internet
connection and no word from Nodeau Cloud, and an outage between you and Nodeau
Cloud never moves anything.

## Choose a workload's recovery {#choose}

```bash
nodeau recovery set qwen-local automatic             # recover after 3 minutes
nodeau recovery set qwen-local automatic --after 10m # recover after 10 minutes
nodeau recovery set qwen-local never                 # wait for its machine (the default)
nodeau run qwen3.5-4b-q4km --recovery automatic        # choose it when you start one
```

| Flag | Default | Meaning |
|---|---|---|
| `--after <d>` | `3m` | How long its machine must have stopped answering first, from 1m to 60m |
| `--copies <n>` | `2` with automatic | How many machines keep the model's verified files, counting the one it runs on, from 1 to 8 |

Changing a workload's recovery restarts nothing. A machine that's restarting
usually comes back well inside three minutes, and moving a workload off it would
restart a healthy model for nothing, which is why the delay exists.

See every workload's choice, its copies and its last recovery:

```bash
nodeau recovery status
```

`nodeau ps` says **held** for a workload whose machine stopped answering and that
is waiting, and **recovering** for one Nodeau is bringing up elsewhere, each with
its own sentence saying which machine, since when, and what happens next. The
local dashboard and the Playground say the same.

## Copies of a model {#copies}

A workload set to recover automatically keeps a verified copy of its model on
another machine that could run it, so a recovery starts without a download. You
can also ask a machine to keep a copy of any catalog model yourself:

```bash
nodeau models copy qwen3.5-4b-q4km --to garage          # ask garage to keep one
nodeau models copy qwen3.5-4b-q4km --to garage --wait   # and wait until it's verified
nodeau models copies                                  # every copy, its state, who asked
nodeau models copy qwen3.5-4b-q4km --to garage --remove # take the request back
```

The machine that keeps a copy fetches the files from the model's publisher into
its own model cache and checks every file's SHA-256 itself. A copy is **ready**
only once that machine has verified every file; a partial or damaged file never
counts. Each machine fetches one model at a time and keeps free disk in reserve.

Taking a request back deletes no files, and a copy a workload's recovery relies on
stays for that workload.

### A model you imported {#imported}

A model you imported has no source but your own machines, so Nodeau never fetches
it. Place the same file on the other machine, and Nodeau verifies it there by its
SHA-256 and counts it as a copy:

```bash
nodeau models import ./my-model.gguf --no-register    # run on the other machine
```

## When there's nowhere to go {#nowhere}

If no other machine can hold a workload when its machine stops answering, it's
**held**, and `nodeau recovery status` says why. When the reason is the model's
files, Nodeau fetches a verified copy to a machine that could run it, and moves
the workload once that machine has checked every file. When the reason is
capacity, it waits until a card is free. It never retries in a loop.

A drained machine is never a target, and neither is one your organisation's
limits leave out.

## When the old machine comes back {#return}

The workload stays where Nodeau brought it up. The copy that was running on the
old machine is out of the endpoint from the moment that machine stopped answering,
and its own Kubernetes agent ends it as soon as the machine is back on your
network. Nothing moves back on its own.

## What to know {#limits}

- **There's a gap.** A request in flight on a machine that stops answering fails,
  and the recovered workload answers new requests once its model has loaded on
  the new machine. Nothing is replayed. Here's one measurement on our own two
  machines, with the delay set to one minute: Nodeau saw the machine had stopped
  answering 48 seconds after it went off the network, decided a minute after
  that, and the workload was serving on the other machine 16 seconds after that
  machine's card was free, from a copy already there. Your times depend on your
  machines, your model and the delay you choose.
- **The control-plane machine is the one that decides.** A workload running on the
  control-plane machine waits for that machine, because the decision is made
  there.
- **Batch jobs are unchanged.** Recovery applies to served workloads.
- **Upgrades are not failures.** A fleet upgrade marks the machine it's restarting,
  and nothing moves while the mark holds.

## Troubleshooting {#troubleshooting}

| You see | What it means | What to do |
|---|---|---|
| `RecoveryNotIncluded` | The plan this machine holds doesn't include recovery across machines | `nodeau plan show`; on Home Pro or Business, `nodeau plan refresh` brings the machine's plan up to date |
| `RecoveryWaiting` | Its machine stopped answering, and the delay you chose hasn't passed yet | Nothing: it moves when the delay ends, unless the machine answers first |
| `RecoveryNoTarget` | No other machine can hold it yet | `nodeau recovery status` names the reason; a copy is fetched when the model's files are the reason |
| `CopyInsufficientDisk` | That machine has too little free disk for the copy | Free space on that machine, or choose another |
| `CopyImportedModel` | A model you imported is never fetched | Place the same file there with `nodeau models import <file> --no-register` |
