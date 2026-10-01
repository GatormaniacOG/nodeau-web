---
title: Upgrade a Nodeau fleet
heading: Upgrading a fleet
nav: Upgrading a fleet
description: Preview an upgrade, approve it, and let Nodeau move your machines one at a time, workers first and the control plane last, checking each one before the next.
lede: Ready to update the fleet? Preview the rollout first, then Nodeau moves through your machines one at a time and checks each one before the next.
---

An upgrade has three steps, and each has one command:

```bash
nodeau fleet upgrade plan      # preview: what would change, in what order, at what cost
nodeau fleet upgrade apply     # approve that exact plan; Nodeau moves the fleet
nodeau fleet upgrade status    # follow it, machine by machine
```

Nodeau checks the target release, your policy and every machine's state before
anything changes. If something needs attention along the way, the rollout holds
right there so you can take a look.

## Before you start {#before-you-start}

- **A Linux fleet.** A Mac runs Nodeau standalone, so you update it on the Mac
  itself with `nodeau update`. A plan names it and says so.
- **Home Pro or Business.** Rollouts are part of remote management. On Home, a
  plan still shows you everything, and you update the machine with the
  installer.
- **The fleet connected to your account**, with its connector running
  (`nodeau fleet status` tells you). Nodeau Cloud keeps the record of who
  approved what and sequences the machines, and your machines still start every
  connection. See [seeing the fleet from a browser](/docs/fleet/#seeing-the-fleet-from-a-browser).
- **Nodeau v0.15.0-beta.7 or later on the machine that runs your control
  plane**, because its fleet connector is what carries out a rollout. If that
  machine runs an earlier release, update it once the usual way
  ([updating one machine](/docs/updates/)), and every upgrade after that can be
  a rollout.

## 1. Plan {#plan}

```bash
nodeau fleet upgrade plan                          # the channel's current release
nodeau fleet upgrade plan --to v0.15.0-beta.7      # one exact version
nodeau fleet upgrade plan --machine garage         # just one machine
nodeau fleet upgrade plan --fleet-group            # the machines your fleet group names
nodeau fleet upgrade plan --json                   # for a script
```

Run it on the machine that runs your control plane. It reads the release's
manifest and your machines' reports, and that's all: nothing is downloaded,
installed or restarted while you read it. The full flag list is in the
[CLI reference](/docs/cli/#nodeau-fleet-upgrade-plan).

Here's a two-machine fleet on `v0.15.0-beta.7`, planned against the next release (its
version and commit are shown as placeholders), with a maintenance window set for
Sunday mornings:

```text
  target    v0.X.Y-beta.N
  channel   beta
  commit    <commit>

  1  garage
       v0.15.0-beta.7 → v0.X.Y-beta.N
       WAITING
       your organisation's maintenance window is not open, and Nodeau only acts on your machines by itself inside it. It next opens at 2026-10-04T07:00:00Z.
       1 workload(s) serving here would stop and start again on this machine — downtime expected; Nodeau does not move them

  2  studio
       v0.15.0-beta.7 → v0.X.Y-beta.N
       WAITING
       your organisation's maintenance window is not open, and Nodeau only acts on your machines by itself inside it. It next opens at 2026-10-04T07:00:00Z.
       1 workload(s) serving here would stop and start again on this machine — downtime expected; Nodeau does not move them

  2 machine(s) would move to v0.X.Y-beta.N, and none may act yet
  · channel beta resolves to v0.X.Y-beta.N at commit <commit>
  · this release does not say which inference runtime it pins, so Nodeau cannot tell you whether upgrading changes it
  · maintenance window: 03:00 for 60 minutes (America/New_York), Sunday (delivered by Nodeau Cloud, confirmed 2026-09-30T18:03:20Z)
  · channel policy: none is set (delivered by Nodeau Cloud, confirmed 2026-09-30T18:03:20Z)
  · Nodeau has not checked whether the hosted service accepts this build, so this plan does not judge it

  Nothing has been changed. To roll this plan out one machine at a time, run `nodeau fleet upgrade apply`; it shows you the plan again and asks first.
```

Top to bottom: the release it resolved, each machine in the order it would go,
a one-line summary, and a few notes. The last line tells you what to do next.

### One release, pinned down {#one-release-pinned-down}

When you ask for a channel, Nodeau resolves it **once**: to a version, the
commit that version was built from, and the checksum or digest of every archive,
component image and inference runtime the release names. The plan describes that
one specific build, however the channel moves afterwards.

That makes a plan something you can hand to a colleague. Ask twice with nothing
changed and you get the same plan, with the same identity. The identity changes
when something that matters changes: the target, the machines, or the
constraints. A machine simply reporting in again leaves it exactly as it was.

### What each machine can say {#machine-states}

Every machine gets one badge.

| Badge | Meaning |
|---|---|
| `READY` | It would move to the target, and it's in the numbered order |
| `WAITING` | It would move, and it's waiting for your maintenance window to open. The plan says when that is |
| `UP TO DATE` | It already runs the target, so nothing would change |
| `BLOCKED` | It would move, and something needs your attention first |
| `UNKNOWN` | It has never reported which build it runs, so there's nothing to compare yet. It appears in plans once it reports in |

A machine that isn't ready says why in a sentence, and carries a code a script
can read:

| What the plan says | Code | What to do |
|---|---|---|
| Your maintenance window is shut right now | `MaintenanceWindowShut` | Nothing: it moves when the window opens. `apply --override-window` lets it go now, recorded as your decision |
| Your channel policy doesn't follow this release's channel | `ChannelNotPermitted` | Plan against a release from the channel your fleet follows |
| This plan couldn't see your organisation's window or channel policy | `PolicyUnknown` | Check the fleet connector is connected (`nodeau fleet status`). It clears once the policy reaches the machine again |
| It has never reported which build it runs | `NeverReported` | Give it a moment to report in. `nodeau fleet list` shows each machine's latest report |
| It already runs a newer build than the target | `WouldMoveBackwards` | Plan against that newer release instead. Nodeau only moves machines forward |
| The release has no build for this machine's platform | `NoArtifactForPlatform` | Choose a release that publishes one. Waiting won't change this answer |
| It's draining for maintenance | `MachineDraining` | Undrain it when you want it included: `nodeau scheduling undrain --node <machine>` |
| It reports that it isn't healthy | `MachineUnhealthy` | See what's wrong with `nodeau doctor --node <machine>`. Nodeau upgrades a machine it can check again afterwards |
| Its last report is too old to act on | `MachineStale` | Check the machine is up and reporting |
| Nodeau Cloud can't yet accept the connector this release ships | `ServerFloorTooHigh` | Wait for Nodeau Cloud to be updated. It always moves before the machines that talk to it |
| It's a Mac | `PlatformCannotJoinFleet` | A Mac runs Nodeau standalone, so you update it on the Mac itself. See [install on a Mac](/docs/install-macos/) |

"Too old" is measured against the freshest report anywhere in the fleet, not
against the clock on your wall, so the same inputs always give the same plan.
The threshold is ten minutes. Change it with `--max-report-age`, or set it to
`0` to skip that check.

### The order, and the control plane {#order}

Machines that would move are numbered, and they go one at a time: the other
machines first, in name order, and the machine running your control plane
**last**. While it upgrades, scheduling pauses and the other machines lose the
cluster they report through until it's back, so pick a quiet moment for it.

### What it means for your workloads {#workloads}

For each machine, the plan names what's running there and whether any of it is
serving:

| Machine | Workloads |
|---|---|
| **A worker** | Keep running while Nodeau's own components on that machine are replaced. Nodeau checks that they did: if one of them restarted, the step counts as failed and the machine is put back |
| **The control-plane machine** | Scheduling and reporting pause until it's back, and workloads on that machine may restart there. Expect a gap in service on that machine |

Each workload stays on its own machine, exactly where it was. If one matters,
plan the gap the way you'd plan any maintenance: pick a quiet moment, and let
the people who use it know.

## 2. Apply {#apply}

```bash
nodeau fleet upgrade apply            # prints the plan, asks, then authorises it
nodeau fleet upgrade apply --yes      # for scripts: the plan is still printed
```

Or open **Fleet, then Upgrade** in your account at
[app.nodeau.ai](https://app.nodeau.ai/).

You approve **the plan you were shown**, and only that plan. Nodeau Cloud works
out its own plan and compares the two: if anything changed since you looked (a
machine reported in, the channel moved, a policy changed), it says so and asks
you to look again.

Here's `nodeau fleet upgrade apply --yes` moving the same two machines from
`v0.15.0-beta.1` to `v0.15.0-beta.7`, with no maintenance window set. Without
`--yes`, it asks before it authorises anything.

```text

  target    v0.15.0-beta.7
  channel   beta
  commit    ff39c042e40f496eddee03f81f1322fa09337168

  1  garage
       v0.15.0-beta.1 → v0.15.0-beta.7
       READY
       would move from v0.15.0-beta.1 to v0.15.0-beta.7.
       1 workload(s) serving here would stop and start again on this machine — downtime expected; Nodeau does not move them

  2  studio
       v0.15.0-beta.1 → v0.15.0-beta.7
       READY
       would move from v0.15.0-beta.1 to v0.15.0-beta.7.
       1 workload(s) serving here would stop and start again on this machine — downtime expected; Nodeau does not move them

  2 machine(s) would move to v0.15.0-beta.7, one at a time
  · channel beta resolves to v0.15.0-beta.7 at commit ff39c042
  · this release does not say which inference runtime it pins, so Nodeau cannot tell you whether upgrading changes it
  · maintenance window: none is set (delivered by Nodeau Cloud, confirmed 2026-09-30T07:26:45Z), so nothing is held back for one
  · channel policy: none is set (delivered by Nodeau Cloud, confirmed 2026-09-30T07:26:45Z)
  · Nodeau has not checked whether the hosted service accepts this build, so this plan does not judge it
  · studio runs the control plane and goes LAST: upgrading it interrupts scheduling and the cluster the other machines report through. Nodeau does not claim it stays available.

  Authorised. Rollout 3d7cb738-b563-44f5-b94b-a3cb974240bc moves 2 machine(s) to v0.15.0-beta.7, one at a time.
  Follow it with `nodeau fleet upgrade status`.
```

One rollout runs at a time. To approve a different plan while one is
unfinished, cancel the current rollout first.

## 3. Follow it {#status}

```bash
nodeau fleet upgrade status
nodeau fleet upgrade status --json
```

It shows each machine's step and what the machine itself last reported. On each
machine, in turn, Nodeau:

1. downloads the release from `get.nodeau.ai` and checks every archive against
   the release's published checksum **and** the digest recorded when you
   approved it;
2. replaces **Nodeau's own components** on that machine;
3. counts the step as complete **only when the machine reports the new build**
   after checking itself, never just because a download finished or a command
   returned.

Here's a rollout part-way through: the worker has finished, and the
control-plane machine is next.

```text
  Rollout 28a26246-52ed-4022-8ae8-d05748e5c61f — AUTHORIZED — to v0.15.0-beta.7 (ff39c042)
  as Nodeau Cloud described it at 2026-09-30T07:29:18Z
  authorised by machine operator alex@studio

  1. studio      control plane v0.15.0-beta.1 -> v0.15.0-beta.7   PENDING

  This installation's last step: rollout 3d7cb738-b563-44f5-b94b-a3cb974240bc, step 1 (garage), attempt 1 — COMPLETE
  log: ~/.local/state/nodeau/lifecycle/logs/3d7cb738-b563-44f5-b94b-a3cb974240bc-1-1.log
```

## When a step needs attention {#when-a-step-fails}

- **A worker** whose step fails goes back to **exactly the versions it was
  running before**, and the rollout **holds**: nothing else moves until you
  decide.
- **The control-plane machine** is handled by hand if its step fails: the
  rollout holds and tells you where the previous version was kept and how to
  restore it.

Here's a worker whose step failed because it couldn't reach the image registry.
It was put back and checked, and the rollout is holding:

```text
  Rollout 4f45680e-21c1-4ad1-b053-623d82968b64 — HELD — to v0.15.0-beta.7 (ff39c042)
  as Nodeau Cloud described it at 2026-09-30T07:25:54Z
  authorised by alex@example.com
  HELD (RollFailed): step 1 (garage): nodeau-devices/nodeau-dra-plugin on garage did not become Ready on its new template within 6m0s: nodeau-dra-plugin-h9kq4 is not Ready (Pending). Rolled back: garage reports v0.15.0-beta.1 again, on its previous pods, verified. The rollout is held.
  Resume it with `nodeau fleet upgrade resume`, or cancel it.

  1. garage       worker        v0.15.0-beta.1 -> v0.15.0-beta.7   FAILED (rolling-back)
       RollFailed: nodeau-devices/nodeau-dra-plugin on garage did not become Ready on its new template within 6m0s: nodeau-dra-plugin-h9kq4 is not Ready (Pending). Rolled back: garage reports v0.15.0-beta.1 again, on its previous pods, verified. The rollout is held.
  2. studio      control plane v0.15.0-beta.1 -> v0.15.0-beta.7   PENDING

  This installation's last step: rollout 4f45680e-21c1-4ad1-b053-623d82968b64, step 1 (garage), attempt 1 — FAILED
  RollFailed: nodeau-devices/nodeau-dra-plugin on garage did not become Ready on its new template within 6m0s: nodeau-dra-plugin-h9kq4 is not Ready (Pending). Rolled back: garage reports v0.15.0-beta.1 again, on its previous pods, verified. The rollout is held.
  log: ~/.local/state/nodeau/lifecycle/logs/4f45680e-21c1-4ad1-b053-623d82968b64-1-1.log
```

```bash
nodeau fleet upgrade resume     # checks everything again, then retries the held machine
nodeau fleet upgrade cancel     # ends the rollout before its next machine
```

Resuming is permission to try again: every check a machine passes before it
starts is run again first.

## Stopping a rollout {#cancel}

```bash
nodeau fleet upgrade cancel
```

It stops the rollout **before its next machine**. A machine already in the
middle of its step finishes (or fails) first, because stopping an upgrade
half-way would leave that machine in a state nobody chose. The rollout then ends
**canceled**. A machine that was handed its step and hadn't begun it never
starts, and says so.

## Maintenance windows and channel policy {#window-and-channel}

When Nodeau Cloud holds a **maintenance window** for your fleet, an approved
rollout starts a machine only inside it. Until then the machine shows as
`WAITING`, the plan says when the window next opens, and **Fleet, then Upgrade**
in your account says the same. `apply --override-window` lets machines go
outside the window, and that choice is recorded as yours.

When it holds a **channel policy**, a release from a channel your fleet doesn't
follow is refused, naming both channels.

A plan says which of these it could see, in its notes:

- **"none is set (delivered by Nodeau Cloud, confirmed …)"**: Nodeau Cloud sent
  your organisation's settings, and there's no window or channel policy.
- **"UNKNOWN to this plan"**: the fleet connector isn't connected, or hasn't
  heard from Nodeau Cloud in the last 15 minutes. Nodeau treats the policy as
  unknown rather than absent, so every machine that would move is held as
  `BLOCKED` with `PolicyUnknown`. It clears once the connector hears from Nodeau
  Cloud again.
- An installation that isn't linked to an account has no organisation policy,
  and the plan says that too.

Setting a window or a channel policy from your account is
[in progress](/roadmap/).

## For scripts {#for-scripts}

```bash
nodeau fleet upgrade plan --json
nodeau fleet upgrade status --json
```

A few plan fields do most of the work:

| Field | What it holds |
|---|---|
| `hash` | The plan's identity. The same inputs give the same hash |
| `target` | The resolved release: its version, channel and commit, and the archives, images and runtime it names |
| `constraints` | What the plan knew about your maintenance window and channel policy, each with a `state` of `set`, `none` or `unknown` |
| `machines[]` | One entry per machine, with `key`, `name`, `state`, `from`, `to`, `order`, `reason`, `explanation` and `impact` |
| `machines[].key` | The machine's stable identity: the identifier Kubernetes gave it when it joined (its node UID). A machine Kubernetes has no record of is keyed by its name |
| `machines[].name` | The machine's name, as `nodeau fleet list` shows it |
| `machines[].impact` | `workloads`, `serving`, `downtime` and a one-line `summary` |
| `notes` | The same notes the human output prints, word for word |
| `error` | Present only when no plan could be worked out, for example with no network to reach the release |

:::note `key` became the machine's identity in v0.15.0-beta.7
Earlier releases put the machine's name in `key`. From v0.15.0-beta.7 it's the
node UID, so an upgrade step can only ever reach the machine that was planned,
even if another machine later takes the same name. A script that read `key` as
the name should read `name`.
:::

`state` is `ready`, `waiting`, `up-to-date`, `blocked` or `unknown`. A sensible
script treats anything other than `ready` and `up-to-date` as "a person should
look at this".

The plan command exits `0` whenever it worked out a plan, whatever the plan
says, and `1` when it couldn't, in both forms. With `--json`, a failure still
arrives as JSON with an `error` field, so your parser always has something to
read.

## What an upgrade covers {#scope}

Nodeau upgrades **its own software**: the command line and fleet connector on
the control-plane machine, the controller, and each machine's Nodeau agent.
Kubernetes (K3s), the NVIDIA driver, the kernel and the operating system stay
exactly as they are, and a machine only ever moves **forward** to a newer
release.
