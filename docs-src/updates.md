---
title: Updating Nodeau and release channels
heading: Updating and release channels
nav: Updating and release channels
description: Check your version, update in place, what an upgrade preserves, how a fleet's machines relate to each other, and what Nodeau deliberately does not do automatically.
lede: Nodeau never updates itself in the background, and a machine that cannot reach the internet keeps working exactly as it is.
---

## What am I running?

```bash
nodeau version
nodeau version --json
```

```text
nodeau v0.X.Y-beta.N (commit 68fcaa1, built 2026-09-21, channel beta, go1.26.5, linux/amd64)
```

The version in that sample is a placeholder. The build this documentation
describes is {release}, read from the channel you would install from rather than
typed into the page.

The **commit is compiled in**, so two builds of the same tree from different
commits are different binaries. That is why the version string carries both.

## Is there something newer?

```bash
nodeau update
nodeau update --json
```

By default it only looks. It compares this machine's Nodeau with the published
release channel, and — if a cluster is reachable — also shows what every machine
in your fleet is running.

| Flag | Default | Meaning |
|---|---|---|
| `--download` | off | Also fetch the new build and check it against the published checksum, refusing to keep anything that does not match |
| `--channel <name>` | this build's | Which channel to check |
| `--base-url <url>` | `https://get.nodeau.ai` | Where releases are published |
| `--json` | off | Machine-readable |

:::note Machines are not expected to match
Nodeau's own components deliberately sit on different versions when one of them
did not change. A controller and an agent showing different versions is normal.

What is worth acting on is **machines disagreeing with each other** — that means
an update was applied to some of them and not the rest.
:::

## Updating

The same command that installed it:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
```

- The bootstrap replaces the binaries in place, verifying the new archive's
  SHA-256 against the published manifest first.
- `nodeau install` is idempotent: it re-checks everything, skips what is done, and
  picks up anything the new release added — a new control-plane component, a new
  driver, a schema change.

### What an upgrade preserves

| | |
|---|---|
| Your **API key** | Never regenerated |
| Your **downloaded models** | Never re-downloaded |
| Your **entitlement** | Untouched |
| Your **cluster** | Adopted components stay adopted; ownership is never re-decided |
| Your **batch inputs and results** | Untouched |
| **Running workloads** | Not restarted by the upgrade itself. A controller roll is a control-plane change |

### A replaced file is not a replaced process

Replacing a binary does not replace a process that is already running: it keeps
executing the file it started with, even after the name is gone.

The installer restarts a **fleet connector** whose binary it replaced, and
`nodeau doctor` reports what was left behind:

| Code | Meaning |
|---|---|
| `CONNECTOR_BINARY_REPLACED` | The connector is running a binary that has since been replaced on disk |
| `ENDPOINT_BINARY_REPLACED` | A local endpoint is |

The remedy is to restart the thing named. A package manager, a hand copy, or an
install that could not reach the service manager all leave the same state, and the
machine looks entirely healthy while in it.

### Order, when several machines are involved

Update one machine at a time and check it before moving on:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
nodeau doctor
nodeau update            # does this machine now agree with the others?
```

For a machine you are about to take offline for a while, drain it first —
`nodeau scheduling drain --node <machine>` — so nothing new is placed there. Then
undrain it afterwards. Draining is not eviction: what is already running keeps
running.

## Release channels

A channel is a named pointer to a version. `beta` is what
`https://get.nodeau.ai/install.sh` resolves by default.

```bash
NODEAU_CHANNEL=beta  bash install-nodeau.sh    # choose a channel
NODEAU_VERSION=v0.X.Y-beta.N bash install-nodeau.sh  # pin an exact version
```

A **channel only ever moves forward.** A version that was published and then
withdrawn is never re-advertised.

You can record which build a fleet should be on, and see which build it is on.
That is a statement of intent that you can read back — it does **not** upgrade
anything. Nodeau does not upgrade a fleet remotely, and the capability to do so is
not built.

## Downgrading and rollback

There is no `nodeau downgrade`, and rollback is not a supported operation.

Pinning an older version with `NODEAU_VERSION` fetches that version's artifacts if
they are still published, which is not guaranteed for a superseded build. A
control plane that has already applied a newer schema is not returned to an older
one by installing an older binary.

If a release causes you a problem, the useful thing is a
[support bundle](/docs/support/) and a message — not a downgrade that leaves the
machine in a state nothing has been tested against.

## Machines that are offline

An offline machine keeps working exactly as it is. It does not phone home, it does
not degrade, and its entitlement keeps verifying offline until it expires — see
[expiry and grace](/docs/accounts/#expiry-and-grace).

To update one with no internet, carry the archive to it yourself and run the
bootstrap with `NODEAU_BASE_URL` pointed at wherever you put it. The checksum
check is the same either way.

## A failed update

The bootstrap installs nothing if the checksum does not match, and says so. If
`nodeau install` stops partway through, run it again: it re-checks everything and
resumes, and the ownership ledger means it never re-decides who owns a component.

If the machine is in a state you cannot explain:

```bash
nodeau doctor
nodeau support bundle
```
