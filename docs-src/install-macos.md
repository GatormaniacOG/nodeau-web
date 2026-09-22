---
title: Install Nodeau on an Apple Silicon Mac
heading: Install on macOS
nav: Install on macOS
description: The complete Apple Silicon install — Metal, no Kubernetes and no password, unified memory, what a Mac can and cannot do, quarantine, PATH and uninstall.
lede: On a Mac, Nodeau runs models directly on the GPU through Metal. There is no Kubernetes, no Docker, no NVIDIA tooling and nothing that needs your password.
---

:::macos
This page is the Apple Silicon path. It is not the Linux instructions with a
footnote: the execution plane underneath is different, and so is most of what
happens. The Linux path is [here](/docs/install-linux/).
:::

## What a Mac can and cannot do

Nodeau on Apple Silicon is **qualified with named exclusions**, and the
exclusions are the honest half of that word.

| | On a Mac |
|---|---|
| Run a model on the GPU, with a local OpenAI-compatible endpoint | Yes, through Metal |
| The curated catalog, downloads and SHA-256 verification | Yes |
| Admission — predicting whether a model fits before starting it | Yes |
| Bring your own model | Not qualified. It builds and passes its checks on darwin; no Mac has run it, and it needs a cluster a Mac deliberately does not have |
| Join a fleet | **No.** A Mac runs standalone. It is not a Kubernetes node, and Nodeau will not pretend otherwise |
| Batch inference | **No.** Absent on darwin, and refused by name rather than half-working |
| Several GPUs in one machine | **No.** A Mac has one integrated GPU |
| Scheduling modes, power limits, fleet health and governance | **No.** These are fleet capabilities and a Mac has no fleet |

## Requirements

- An **Apple Silicon (M-series) Mac**. Intel Macs are refused by name — Metal
  execution needs an M-series chip.
- About **20 GB free disk**. There are no container images on macOS, so the
  footprint is the binaries plus your models.
- Outbound HTTPS to install and to download a model.
- **No password.** Nothing on this path needs `sudo`.

Nodeau checks no macOS version number anywhere. If you are on an earlier
release than we have tried, that is untested rather than unsupported, and the
choice is left to you.

## Step 1 — get the CLI

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
```

Or read it first:

```bash
curl -fsSL https://get.nodeau.ai/install.sh -o install-nodeau.sh
less install-nodeau.sh
bash install-nodeau.sh
```

This downloads `nodeau-darwin-arm64.tar.gz`, **verifies its SHA-256 against the
published manifest**, and puts `nodeau` into `~/.local/bin`. It refuses to run as
root and calls no `sudo`.

The macOS archive also carries a **Metal model runtime**, which the script
stages beside the binary so `nodeau install` can find it. There is nothing for
you to build or supply.

:::warning Use the install command, not a browser download
macOS tags anything a browser saves as quarantined. Nodeau is not signed with an
Apple Developer ID, so Gatekeeper refuses to run a quarantined copy — and from a
terminal there is no dialog and no message: the process is killed with signal 9
and you see an empty line and **exit code 137**.

`curl` does not set the quarantine flag, so the command above has nothing to
clear. If you already fetched the archive another way, see
[the fix](/docs/troubleshooting/#on-a-mac-nodeau-prints-nothing-and-exits-137).
:::

## Step 2 — look at the machine

```bash
nodeau doctor
```

Read-only. It reports the chip, the Metal accelerator, memory, the state
directory, whether a model runtime is installed and verified, and what is
running.

## Step 3 — set it up

```bash
nodeau install --dry-run     # what would change
nodeau install               # the same, then asks
```

It checks four things and then acts:

| Check | Blocking? |
|---|---|
| **Apple Silicon** — the machine reports `arm64` | Yes |
| **Metal accelerator** — a usable GPU is present | Yes |
| **Model runtime** — a prepared runtime is available, bundled or named | Yes, if none can be found |
| **Storage safety** — the state directory lands on a writable, native filesystem | Yes |

Then it creates its directories, installs the model runtime, copies the `nodeau`
binary into Nodeau's own directory, warms the Metal shader cache so the first
model run is not mistaken for a hang, and offers to add one line to your login
profile.

There is no Kubernetes, no container runtime, no virtual machine and no
privileged step. Everything lives in your own Library folder.

### Options

| Flag | What it does |
|---|---|
| `--dry-run` | Show what would change and stop |
| `--yes`, `-y` | Do not ask anything |
| `--runtime <path>` | Install a prepared model runtime from a directory or `.tar.gz`. An explicit path always wins over the bundled one |
| `--skip-path` | Do not offer to add Nodeau to your shell `PATH` |
| `--skip-binary` | Do not copy the Nodeau binary into Nodeau's own directory |
| `--state <path>` | Path to the install ledger |
| `--json` | Machine-readable output. It does **not** imply consent — a pipeline says yes with `--yes` |

### The PATH line

macOS has no user-writable directory on the default `PATH`, so one line has to
go into your login profile. Nodeau shows you the exact text and asks before
appending it. Declining costs nothing: the line is printed, and `nodeau` still
works by full path.

It goes in **`~/.zprofile`**, not `~/.zshrc`. Terminal.app runs login shells, so
a `PATH` line in `.zshrc` works by hand and fails in a script, an `ssh` command
or a LaunchAgent.

It takes effect in a **new** terminal window.

## Step 4 — run a model

```bash
nodeau model list          # what you can run
nodeau run <model>         # download it, admit it, serve it
nodeau ps                  # what is running
```

`nodeau run` is the supported vocabulary on both platforms. It resolves the
model from the catalog, asks before downloading, runs admission, starts the
model on the Mac's GPU and brings up the loopback endpoint. Then call it exactly
as on Linux — see [the API](/docs/api/).

The endpoint runs as a **launchd user agent** in `~/Library/LaunchAgents`, so it
survives closing the terminal.

:::note `nodeau quickstart` is the Linux flow
Quickstart creates a Kubernetes `GPUService`. On a Mac, `nodeau run <model>`
does the equivalent job through the native plane.
:::

## Unified memory {#unified-memory}

This is the one thing about a Mac that surprises people, and it is worth
understanding rather than working around.

On Apple Silicon the system, your applications and the GPU share **one** pool of
memory. So "will this model fit" is not a fixed property of the machine — it
depends on what else is open.

Nodeau reads two separate numbers:

- a **static ceiling**, the most the GPU is allowed to hold. This is a property
  of the device and does not move, even when free memory swings by gigabytes.
- a **live figure** for what is actually free right now.

Admission uses the smaller, minus a system reserve. The consequence is real and
correct:

> A model that started yesterday can be refused today, because you now have a
> browser and a video call open. Close something and try again.

That is Nodeau reading the machine honestly. Nodeau will never quietly reduce
its own safety margin to make something fit — an out-of-memory kill on a
machine whose display is driven by the same GPU is worse than a refusal.

If you want to accept that risk for one workload, `nodeau run` takes
`--accept-estimate-risk` and `--spend-safety-reserve`. Both are explicit, both
are per-workload, and both are recorded.

## Where things live

| Path | What |
|---|---|
| `~/.local/bin/nodeau` | The CLI, as the bootstrap installed it |
| `~/Library/Application Support/Nodeau/` | Nodeau's own directory |
| `~/Library/Application Support/Nodeau/state/models/` | Model cache |
| `~/Library/Application Support/Nodeau/state/runtimes/` | The Metal model runtime |
| `~/Library/Application Support/Nodeau/api-key` | Your local API key, mode `0600` |
| `~/Library/LaunchAgents/` | The endpoint's user agent |

`XDG_CONFIG_HOME` and `XDG_STATE_HOME` are honoured when explicitly set.

:::note Never `~/Library/Caches`
Nodeau does not put the model cache there. macOS may purge that directory, and a
cache the operating system can silently delete would break the guarantee that a
verified artifact stays verified.
:::

## The model runtime

On Linux a runtime is a container image with a digest, which answers for itself.
A directory does not, so on macOS the runtime carries a manifest — version,
engine, backend, os/arch, a SHA-256 for every file, and the upstream commit — and
**fails closed** if it does not verify.

Installing one is verify-then-promote: a failed install leaves the previous
runtime serving. `nodeau doctor` reports `RUNTIME_MISSING`, `RUNTIME_CORRUPT`,
`RUNTIME_UNVERIFIED` and `RUNTIME_UNMANAGED` separately, because they need
different answers.

## Upgrading

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
```

`nodeau update` checks first. See
[updating and release channels](/docs/updates/).

## Uninstalling

```bash
nodeau uninstall --dry-run
nodeau uninstall
```

It removes what `nodeau install` put here and nothing else. A model runtime you
assembled yourself, a `PATH` line you wrote, or a copy of `nodeau` you manage
are all left alone, and the plan says so.

| Flag | What it does |
|---|---|
| `--dry-run` | Show what would be removed and stop |
| `--yes`, `-y` | Do not ask anything |
| `--models` | Also delete downloaded model weights |
| `--keep-path` | Leave the `PATH` line in your login profile |
| `--state <path>` | Path to the install ledger |

Your downloaded models are **kept** unless you pass `--models`. Uninstalling the
software and throwing away gigabytes of downloads are different decisions.

## If something went wrong

[Troubleshooting has a macOS section](/docs/troubleshooting/#macos).
