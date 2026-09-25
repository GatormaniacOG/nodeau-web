---
title: Upgrading a fleet
heading: Upgrading a fleet
nav: Upgrading a fleet
description: Plan and authorise a Nodeau upgrade across your machines — one at a time, the control plane last — and what is checked, interrupted, and not done.
lede: Nodeau can move the machines you own to a new Nodeau release, one at a time, and it tells you what that will cost before anything moves. It upgrades Nodeau itself — never Kubernetes, the NVIDIA driver or the kernel.
---

:::linux
Fleet upgrades are for Linux machines in a fleet. A Mac runs Nodeau standalone
and is not part of a fleet: a plan names it and says so, and you update it on the
machine itself with `nodeau update`.
:::

Rollouts need **Nodeau v0.15.0-beta.6 or later** on every machine — the release
that carries them. A fleet with an older fleet connector anywhere is refused
rather than left waiting; update that machine the ordinary way first
([Updating](/docs/updates/)).

## 1. Plan

```bash
nodeau fleet upgrade plan
nodeau fleet upgrade plan --json
nodeau fleet upgrade plan --to v0.15.0-beta.6     # one version the channel serves
```

A plan changes nothing. It says, for every machine:

- whether it **would change**, and from which build to which;
- whether it **already matches**, and is left alone;
- whether it **cannot be changed**, and why — a machine that has never said which
  build it runs, one that last reported too long ago, one draining for
  maintenance, one that is not healthy, a release with no build for its platform,
  a target older than what it runs (Nodeau never moves a machine backwards), or a
  Mac;
- the **order** it would go in — workers first, **the control-plane machine
  last**;
- which **workloads** run there, and that they would stop and start again on that
  machine.

A release is resolved **once** — to a version, a commit, and the checksum or
digest of every archive and image it names — so a plan describes one specific
build, not whatever the channel points at later.

`--json` carries the same facts. When a plan **cannot be made** (no network, no
cluster), the command **exits non-zero in both forms**; `--json` still prints the
reason in `error`.

:::note A machine's `key` is its identity, not its name
In `--json`, each machine's `key` is its stable identity — the Kubernetes node's
UID — so a plan made here and one made in Nodeau Cloud name a machine the same
way, and a machine removed and joined again under the same name is a different
machine. Its name is `name`. **Before v0.15.0-beta.6, `key` carried the name**: a
script that read `key` as the machine's name should read `name`.
:::

## 2. Authorise

```bash
nodeau fleet upgrade apply            # prints the plan, asks, then authorises it
nodeau fleet upgrade apply --yes      # for scripts: the plan is still printed
```

or **Fleet → Upgrade** in your account at `app.nodeau.ai`.

You authorise **the plan you were shown**, and only that plan. If anything
changed since you looked — a machine reported in, the channel moved, a policy
changed — it is refused and you are asked to look again.

Authorising needs a subscription that includes remote management, and, in an
organisation, the `fleet.upgrade` permission.

## 3. Follow

```bash
nodeau fleet upgrade status
nodeau fleet upgrade status --json
```

Each machine's step and what the machine itself last reported. Machines move
**one at a time**. On each one Nodeau:

1. downloads the release from `get.nodeau.ai` and checks every archive against
   the release's published checksum **and** the digest recorded when you
   authorised it — a mismatch refuses the step;
2. replaces **only Nodeau's own components** on that machine;
3. checks itself, and the step is **complete only when the machine reports the
   new build** — not when a download finished or a command returned.

### What is interrupted

| Machine | Workloads |
|---|---|
| **A worker** | Keep running while Nodeau's own components are replaced. If one of them restarted, the step counts as **failed** and the machine is put back |
| **The control-plane machine** | Scheduling and reporting pause until it returns, and workloads on that machine may restart. **Expect downtime there** |

Nodeau does **not** move a workload to another machine to keep it available.

## Maintenance windows and channel policy

If your organisation sets a **maintenance window** ([Organisation
limits](/docs/governance/)), a machine **waits** for it: an authorised rollout
starts a machine only inside the window. **Fleet → Upgrade** in the console says
why a machine is waiting and when the window next opens; `nodeau fleet upgrade
status` shows that machine as pending. A
release from a channel your **channel policy** does not follow is refused, naming
both channels.

When Nodeau **cannot see** your organisation's settings — the fleet connector is
not connected, or has not heard from Nodeau Cloud for a while — it treats the
policy as **unknown**, not as absent: a plan marks every machine that would move
as blocked, and a rollout's machines wait. It clears once the policy reaches the
machine again.

## When a step fails

- **A worker** is put back onto **exactly the versions it was running before** —
  the ones its own pods ran — and the rollout **holds**: nothing else moves.
- **The control-plane machine** is **not** rolled back automatically. The rollout
  holds and says where the previous version was kept and how to restore it.

```bash
nodeau fleet upgrade resume     # checks everything again, then retries the held machine
```

## Stopping a rollout

```bash
nodeau fleet upgrade cancel
```

It stops the rollout **before its next machine**. A machine **already in the
middle of its step is not interrupted** — it finishes or fails first, and the
rollout then ends **canceled**, never complete. A machine that had been handed
its step but had not begun it is never started, and says so.

Authorising a new rollout while one is unfinished is refused. Cancel the
unfinished one first; the next plan you authorise then starts fresh.

## What Nodeau does not do

- upgrade Kubernetes (K3s), the NVIDIA driver, the kernel, firmware or the OS;
- move a machine to an older release;
- move workloads between machines, or promise zero downtime;
- roll the control plane back automatically;
- upgrade a Mac from a fleet;
- choose a version, check for one, or act on a plan, on its own.
