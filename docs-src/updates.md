---
title: Updating Nodeau and release channels
heading: Updates and release channels
nav: Updates and release channels
description: Check your version, update a machine in place, update a fleet one machine at a time, and understand release channels and maintenance windows.
lede: Updating is the same command that installed Nodeau, on each machine, when you choose. Nodeau keeps working exactly as it is until you do, online or offline.
---

## What am I running?

```bash
nodeau version
nodeau version --json
```

```text
nodeau v0.X.Y-beta.N (commit 1a2b3c4d, built 2026-09-22T22:50:18-04:00, channel beta, go1.26.5, linux/amd64)
```

The version in that sample is a placeholder. The build this documentation
describes is {release}, read from the channel you would install from.

The **commit is compiled in**, so two builds of the same source from different
commits are different binaries. That is why the version string carries both.

## Is there something newer?

```bash
nodeau update
nodeau update --json
```

By default it only looks. It compares this machine's Nodeau with the published
release channel and, if a cluster is reachable, shows what every machine in your
fleet is running.

| Flag | Default | Meaning |
|---|---|---|
| `--download` | off | Also fetch the new build and check it against the published checksum, keeping it only if it matches |
| `--channel <name>` | this build's | Which channel to check |
| `--base-url <url>` | `https://get.nodeau.ai` | Where releases are published |
| `--json` | off | Machine-readable |

With `--download`, it finishes by telling you the one command that installs what
it fetched.

:::note Machines are expected to differ a little
Nodeau's own components deliberately sit on different versions when one of them
did not change, so a controller and an agent showing different versions is
normal. What is worth acting on is **machines disagreeing with each other**, which
means an update reached some of them and not the rest.
:::

## Updating a machine

The same command that installed it, then `nodeau install`:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
```

- The bootstrap replaces the binaries in place, after checking the new archive's
  SHA-256 against the published manifest.
- `nodeau install` re-checks everything, skips what is done, and picks up anything
  the new release added: a new control-plane component, a new driver, a schema
  change. Running it again is always safe.

### What an update keeps

| | |
|---|---|
| Your **API key** | Kept as it is |
| Your **downloaded models** | Kept, with nothing downloaded again |
| Your **entitlement** | Kept as it is |
| Your **cluster** | Adopted components stay adopted, and ownership is never re-decided |
| Your **batch inputs and results** | Kept as they are |
| **Running workloads** | The update does not stop them itself. A release can restart a workload on its own machine to pick up a change, so plan for a short gap |

### A replaced file and a running process

Replacing a binary on disk leaves a process that is already running on the file
it started with. So the installer restarts a **fleet connector** whose binary it
replaced, and `nodeau doctor` names anything still running an older copy:

| Code | Meaning | Do this |
|---|---|---|
| `CONNECTOR_BINARY_REPLACED` | The fleet connector is running a binary that has since been replaced on disk | Restart the connector |
| `ENDPOINT_BINARY_REPLACED` | A local endpoint is | `nodeau run <name>` brings it back on the new binary |

A package manager, a hand copy, or an install that could not reach the service
manager all leave this state behind while the machine looks perfectly healthy,
which is why doctor checks for it.

## Updating several machines

Start by looking at what the move would involve, without changing anything:

```bash
nodeau fleet upgrade plan
```

It resolves the release once, says which machines would change and which already
match, explains any machine it would hold back and why, puts the machines in
order, and says what each move would cost the workloads on it. See
[planning a fleet upgrade](/docs/upgrades/).

Then update **one machine at a time**, checking each before you move on. Take the
worker machines first and the **control-plane machine last**: while the control
plane updates, scheduling and the reports your other machines send through it
pause until it is back.

For each machine, first on the machine that runs the control plane:

```bash
nodeau scheduling drain --node <machine>    # no new work lands there meanwhile
```

Then on the machine you are updating:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
```

And back on the control-plane machine:

```bash
nodeau doctor --node <machine>              # is it healthy and reporting?
nodeau scheduling undrain --node <machine>
nodeau update                               # do the machines now agree?
```

Draining keeps new work away while you are busy with a machine, and leaves what
is already running exactly as it is. Plan for the workloads on a machine you
update to stop and start again on that same machine: the upgrade plan lists them
for exactly this reason, so you can choose a quiet moment.

## Release channels

A channel is a named pointer to a version. `beta` is what
`https://get.nodeau.ai/install.sh` resolves by default.

```bash
NODEAU_CHANNEL=beta bash install-nodeau.sh              # choose a channel
NODEAU_VERSION=v0.X.Y-beta.N bash install-nodeau.sh     # pin an exact version
```

**A channel only ever moves forward.** A version that was published and then
withdrawn is never advertised again, so the channel always points at a build that
went through the whole release process.

### Seeing which build each installation runs

Your account at [app.nodeau.ai](https://app.nodeau.ai/) shows the Nodeau version
each connected installation reports, and `nodeau update` compares every machine
in a fleet with the published release. Machines that disagree with each other
are the signal worth acting on.

### Maintenance windows and a release for the whole fleet

Setting a maintenance window, and the release your whole fleet should be on,
from your account is [in progress](/roadmap/). Here's what a window will mean
when it lands, so you can plan around it:

- A window marks the hours when Nodeau may do things **on its own** that could
  interrupt work, such as recovering a workload automatically.
- Work you ask for runs straight away, inside or outside a window: running a
  model, submitting a batch job, a placement you requested.
- Nothing already running is touched when a window opens or closes.
- A window is a boundary for Nodeau's own actions rather than a job scheduler.

:::important The upgrade planner works from what this machine knows
`nodeau fleet upgrade plan` is worked out on the machine you run it on, from what
that machine knows. Organisation-wide settings such as a maintenance window are
not part of the plan in this release, and the plan's human output ends with a
line saying so. If you script against `--json`, keep that in mind.
:::

## Staying on a build

Moving forward is the supported direction, and there are good reasons to stay
where you are for a while:

- Pin an exact version with `NODEAU_VERSION` when you install, and a machine stays
  on it until you choose otherwise. Nodeau never updates itself in the
  background.
- `nodeau fleet upgrade plan` holds back any machine whose target is older than
  what it runs, and names the direction, so a plan never quietly moves a machine
  backwards.

Installing an older binary is not a way back. A control plane that has applied a
newer schema keeps it, and an older binary on top of it is a combination nothing
has been tested against. Pinning a superseded version also depends on its
artifacts still being published. If a release gives you trouble, the fastest
route to a fix is a [support bundle](/docs/support/) and a message.

## Machines that are offline

An offline machine keeps working exactly as it is, and its entitlement keeps
verifying offline until it expires (see
[expiry and grace](/docs/accounts/#expiry-and-grace)).

To update one with no internet, carry the archive to it yourself and run the
bootstrap with `NODEAU_BASE_URL` pointed at wherever you put it. The checksum check
is the same either way.

## If an update stops partway

The bootstrap installs nothing when the checksum does not match, and says so.
If `nodeau install` stops partway through, run it again: it re-checks everything
and carries on, and the ownership ledger means it never re-decides who owns a
component.

For anything you cannot explain:

```bash
nodeau doctor
nodeau support bundle
```
