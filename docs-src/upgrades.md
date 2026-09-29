---
title: Plan a Nodeau fleet upgrade
heading: Planning a fleet upgrade
nav: Planning a fleet upgrade
description: See what moving your machines to a Nodeau release would involve before any of them move: which change, which already match, the order, and what it means for your workloads.
lede: Before you move a single machine, ask Nodeau what moving the whole fleet would take. You get a plan you can read, check and share, and nothing changes while you read it.
---

`nodeau fleet upgrade plan` reads two things: the release you're aiming for and
the machines in your fleet. It tells you which machines would change and from
which build to which, which already match, which aren't ready to move and why,
the order they'd go in, and what it would mean for the workloads running on
each one.

It's a planning tool. It reads the release's manifest and your machines'
reports, and that's all: no build is downloaded, nothing is installed or
restarted, and no machine is told to do anything. When you're happy with the plan, you
upgrade each machine the usual way: see [updates](/docs/updates/).

## Ask for a plan

```bash
nodeau fleet upgrade plan                          # the channel's current release
nodeau fleet upgrade plan --to v0.15.0-beta.1      # one exact version
nodeau fleet upgrade plan --machine desk           # just one machine
nodeau fleet upgrade plan --fleet-group            # the machines your fleet group names
nodeau fleet upgrade plan --json                   # for a script
```

Run it on a machine in your fleet (the control-plane machine is the natural
place). It needs to reach the release channel to read the release, and the
cluster to read your machines. The full flag list is in the
[CLI reference](/docs/cli/#nodeau-fleet-upgrade-plan).

## Reading a plan

Here's a three-machine fleet on `v0.14.0-beta.7`, planned against the beta
channel:

```text
  target    v0.15.0-beta.1
  channel   beta
  commit    bde36a001028d9fd961f6788196fd75fdb9a25d8

  1  desk
       v0.14.0-beta.7 → v0.15.0-beta.1
       READY
       would move from v0.14.0-beta.7 to v0.15.0-beta.1.
       1 workload(s) serving here would stop and start again on this machine — downtime expected; Nodeau does not move them

  2  lab-2
       v0.14.0-beta.7 → v0.15.0-beta.1
       READY
       would move from v0.14.0-beta.7 to v0.15.0-beta.1.
       nothing is running here

  3  gpu-server
       v0.14.0-beta.7 → v0.15.0-beta.1
       READY
       would move from v0.14.0-beta.7 to v0.15.0-beta.1.
       1 workload(s) here, none serving; restarting them interrupts nothing

  3 machine(s) would move to v0.15.0-beta.1, one at a time
  · channel beta resolves to v0.15.0-beta.1 at commit bde36a00
  · no maintenance window is set, so nothing is held back for one
  · Nodeau has not checked whether the hosted service accepts this build, so this plan does not judge it
  · gpu-server runs the control plane and goes LAST: upgrading it interrupts scheduling and the cluster the other machines report through. Nodeau does not claim it stays available.
  · this plan is computed on this machine and does not include your organisation's maintenance window or channel policy

  Nothing has been changed. Nodeau does not upgrade a fleet for you yet; upgrade a machine by running `nodeau install` on it.
```

Top to bottom, that's the release it resolved, each machine in the order it
would go, a one-line summary, and a few notes. The sections below go through
each part.

Two of those notes are worth reading carefully:

- **"no maintenance window is set"** means this plan wasn't given one. A plan
  worked out on your machine doesn't read your organisation's settings yet, so
  the line tells you what this plan applied, and says nothing about what your
  organisation has set. More on that [below](#your-organisations-window-and-channel).
- **"Nodeau has not checked whether the hosted service accepts this build"**
  is about Nodeau Cloud, the service your machines report to when you've
  connected a fleet. Nodeau updates Nodeau Cloud before the machines that talk
  to it, so this line is there for your information.

## One release, pinned down {#one-release-pinned-down}

When you ask for a channel, Nodeau resolves it **once**: to a version, the
commit that version was built from, and the checksum or digest of every archive,
component image and inference runtime the release names. The plan describes that
one specific build, however the channel moves afterwards.

That makes a plan something you can hand to a colleague. Ask twice with nothing
changed and you get the same plan, with the same identity. The identity changes
when something that matters changes: the target, the machines, or the
constraints. A machine simply reporting in again leaves it exactly as it was.

## What each machine can say {#machine-states}

Every machine gets one badge.

| Badge | Meaning |
|---|---|
| `READY` | It would move to the target, and it's in the numbered order |
| `UP TO DATE` | It already runs the target, so nothing would change |
| `BLOCKED` | It would move, and something needs your attention first |
| `UNKNOWN` | It has never reported which build it runs, so there's nothing to compare yet. It appears in plans once it reports in |

A machine that isn't ready says why in a sentence, and carries a code a script
can read:

| What the plan says | Code | What to do |
|---|---|---|
| It has never reported which build it runs | `NeverReported` | Give it a moment to report in. `nodeau fleet list` shows each machine's latest report |
| It already runs a newer build than the target | `WouldMoveBackwards` | Plan against that newer release instead. Nodeau only moves machines forward |
| The release has no build for this machine's platform | `NoArtifactForPlatform` | Choose a release that publishes one. Waiting won't change this answer |
| It's draining for maintenance | `MachineDraining` | Undrain it when you want it included: `nodeau scheduling undrain --node <machine>` |
| It reports that it isn't healthy | `MachineUnhealthy` | See what's wrong with `nodeau doctor --node <machine>`. A healthy machine is one you can check again after its upgrade |
| Its last report is too old to act on | `MachineStale` | Check the machine is up and reporting |
| It's a Mac | `PlatformCannotJoinFleet` | A Mac runs Nodeau standalone, so you update it on the Mac itself. See [install on a Mac](/docs/install-macos/) |

"Too old" is measured against the freshest report anywhere in the fleet, not
against the clock on your wall, so the same inputs always give the same plan.
The threshold is ten minutes. Change it with `--max-report-age`, or set it to
`0` to skip that check.

## The order, and the control plane

Machines that would move are numbered, and they'd go one at a time: the other
machines first, in name order, and the machine running your control plane
**last**. The plan tells you why it goes last:
while it upgrades, scheduling pauses and the other machines lose the cluster
they report through. Plan for that window. The control plane isn't described as
staying available while it restarts, because it doesn't.

## What it means for your workloads

For each machine, the plan names what's running there and whether any of it is
serving:

- **"nothing is running here"**: upgrading it touches no workload.
- **"none serving"**: the workloads there would restart and nobody is waiting on
  them right now.
- **"serving here would stop and start again on this machine"**: expect a gap in
  service while that machine upgrades. Each workload restarts on its own machine,
  exactly where it was.

If a workload matters, plan the gap the way you'd plan any maintenance: pick a
quiet moment, and let the people who use it know.

## Your organisation's window and channel {#your-organisations-window-and-channel}

Setting a maintenance window and a release channel for your whole fleet, from
your account, is [in progress](/roadmap/). When it arrives, plans will take both
into account.

A plan you run with `nodeau fleet upgrade plan` is worked out on the machine you
run it on, from what that machine can see, and **organisation-wide settings
aren't part of it in this release**. The human output says so on its last note
line, so nobody reads the plan as having applied them.

If you're scripting against `--json`, treat every plan as computed without any
organisation-wide window or channel setting.

## For scripts {#for-scripts}

```bash
nodeau fleet upgrade plan --json
```

A few fields do most of the work:

| Field | What it holds |
|---|---|
| `hash` | The plan's identity. The same inputs give the same hash |
| `target` | The resolved release: its version, channel and commit, and the archives, images and runtime it names |
| `machines[]` | One entry per machine, with `state`, `from`, `to`, `order`, `reason`, `explanation` and `impact` |
| `machines[].impact` | `workloads`, `serving`, `downtime` and a one-line `summary` |
| `notes` | The same notes the human output prints |
| `error` | Present only when no plan could be worked out, for example with no network to reach the release |

`state` is `ready`, `up-to-date`, `blocked` or `unknown` for the plans this
command produces. A sensible script treats anything other than `ready` and
`up-to-date` as "a person should look at this".

The command exits `0` whenever it worked out a plan, whatever the plan says, and
`1` when it couldn't. With `--json`, a failure still arrives as JSON with an
`error` field, so your parser always has something to read.

## Then, upgrading

The plan tells you what would happen. Upgrading a machine is still the installer
followed by `nodeau install`, run on that machine, one machine at a time with
the control-plane machine last:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
nodeau doctor
```

The full routine, including what an upgrade keeps, is on
[updates and release channels](/docs/updates/).

Moving a whole fleet one machine at a time from one place is in progress, and
you can follow it on the [roadmap](/roadmap/).
