---
title: Install Nodeau on an Apple Silicon Mac
heading: Install on a Mac
nav: Install on a Mac
description: The Apple Silicon install: Metal, no containers and no password, running your first model, unified memory, the PATH line, upgrading and uninstalling.
lede: On a Mac, Nodeau runs models directly on the GPU through Metal. No Kubernetes, no Docker, no NVIDIA tooling, and nothing that needs your password.
---

:::macos
This is the Apple Silicon path, and it's genuinely its own thing: the execution
plane underneath is different, and so is most of what happens. The Linux path
is [here](/docs/install-linux/).
:::

## What a Mac does {#what-a-mac-can-and-cannot-do}

A Mac makes a lovely private AI endpoint. Nodeau serves chat, embedding,
reranking and vision models on the Mac's own GPU, several at once, and the whole
install needs no password. Nodeau on Apple Silicon is **qualified**, and this is
its scope:

| | On a Mac |
|---|---|
| Chat, with streaming, on the GPU behind a local OpenAI-compatible endpoint | Yes, through Metal |
| Embeddings, reranking and image input (vision) | Yes, through Metal |
| Several models serving at once, each on its own port | Yes, as unified memory allows |
| The curated catalog, downloads and SHA-256 verification | Yes |
| The fit check before anything starts | Yes, against unified memory |
| `run`, `ps`, `stop`, `logs`, `doctor` and `uninstall` | Yes |
| Fleets, batch inference and bringing your own model | On your Linux machines with NVIDIA GPUs. A Mac runs standalone |
| Structured output and tool calling | On your Linux machines with NVIDIA GPUs |
| Several GPUs, scheduling modes, power limits, health, limits and policies | Part of a Linux fleet. A Mac has one integrated GPU |

## Requirements

- An **Apple Silicon (M-series) Mac**. Metal execution needs an M-series chip,
  so on an Intel Mac the installer stops and names that as the reason.
- About **20 GB free disk**. A Mac needs no container images, so it's the
  binaries plus your models.
- Outbound HTTPS, to install and to download a model.
- **No password.** Nothing on this path uses `sudo`.

Nodeau has been run on M3 Pro Macs under macOS 26.5 and macOS 27. It checks no
macOS version number anywhere, so if you're on another release you're welcome to
try it: untested isn't the same as unsupported, and we'd love to hear how it
goes.

## Step 1: get the CLI

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
```

Or read it first:

```bash
curl -fsSL https://get.nodeau.ai/install.sh -o install-nodeau.sh
less install-nodeau.sh
bash install-nodeau.sh
```

This downloads `nodeau-darwin-arm64.tar.gz`, **checks its SHA-256 against the
published manifest**, and puts `nodeau` into `~/.local/bin`. It runs as you and
calls no `sudo`.

The macOS archive also carries a **Metal model runtime**, which the script
places beside the binary so `nodeau install` can find it. There's nothing for
you to build or supply.

:::warning Install with the command rather than a browser download
macOS marks anything a browser saves as quarantined. Nodeau isn't signed with
an Apple Developer ID, so Gatekeeper won't run a quarantined copy, and from a
terminal that looks like an empty line and **exit code 137** (the process is
stopped with signal 9).

`curl` doesn't set the quarantine flag, so the command above has nothing to
clear. If you already fetched the archive another way,
[here's the fix](/docs/troubleshooting/#on-a-mac-nodeau-prints-nothing-and-exits-137).
:::

## Step 2: look at the machine

```bash
nodeau doctor
```

This only looks. It reports the chip, the Metal accelerator, memory, the state
directory, whether a model runtime is installed and verified, and what's
running.

## Step 3: set it up

```bash
nodeau install --dry-run     # what would change
nodeau install               # the same, then it asks
```

It checks four things, then gets to work:

| Check | What it looks for |
|---|---|
| **Apple Silicon** | The machine reports `arm64` |
| **Metal accelerator** | A usable GPU is present |
| **Model runtime** | A prepared runtime is available, bundled or named with `--runtime` |
| **Storage safety** | The state directory lands on a writable, native filesystem |

All four need to pass. Then Nodeau creates its directories, installs the model
runtime, copies the `nodeau` binary into its own directory, warms the Metal
shader cache ahead of your first model run, and offers to add one line to your
login profile.

Everything lives in your own Library folder. There's no Kubernetes, no container
runtime, no virtual machine and no privileged step.

### Options

| Flag | What it does |
|---|---|
| `--dry-run` | Show what would change and stop |
| `--yes`, `-y` | Answer yes to every question |
| `--runtime <path>` | Install a prepared model runtime from a directory or a `.tar.gz`. A path you give always wins over the bundled runtime |
| `--skip-path` | Leave your shell `PATH` as it is |
| `--skip-binary` | Leave the Nodeau binary where the bootstrap put it |
| `--state <path>` | Path to the install ledger |
| `--json` | Machine-readable output. A pipeline still says yes with `--yes` |

### The PATH line

macOS has no user-writable directory on the default `PATH`, so one line has to
go into your login profile. Nodeau shows you the exact text and asks before
appending it. If you'd rather not, the line is printed for you, and `nodeau`
still works by its full path.

It goes in **`~/.zprofile`** rather than `~/.zshrc`. Terminal.app runs login
shells, so a `PATH` line in `.zshrc` works by hand and then goes missing in a
script, an `ssh` command or a LaunchAgent.

It takes effect in a **new** terminal window.

## Step 4: run a model

```bash
nodeau model list                # what you can run
nodeau run qwen3.5-4b-q4km       # download it, check the fit, serve it
nodeau ps                        # what's running
```

`nodeau run` resolves the model from the catalog, asks before downloading
anything, checks that it fits, starts it on the Mac's GPU and brings up the
loopback endpoint. When it's ready you'll see:

```text
──────────────────────────────────────
Nodeau is ready.
──────────────────────────────────────

Model
  qwen3.5-4b-q4km

Local API
  http://127.0.0.1:8080/v1

  Only this computer can reach it. It is not on your network.
```

Below that it prints a `curl` command you can paste as it is. From here, call it
exactly as you would on Linux: see [the OpenAI-compatible API](/docs/api/).

The endpoint runs as a **launchd user agent** in `~/Library/LaunchAgents`, so
it keeps serving after you close the terminal.

:::note On a Mac, `nodeau run` is your quickstart
`nodeau quickstart` creates a Kubernetes workload, which is the Linux flow. On a
Mac, `nodeau run <model>` does the same job through the native plane.
:::

## Several models at once {#several-models}

Each `nodeau run` starts its own endpoint, so give each model a port of its own:

```bash
nodeau run qwen3.5-4b-q4km                          # chat on 8080
nodeau run qwen3-embedding-0.6b-q8_0 --port 8081    # embeddings
nodeau run bge-reranker-v2-m3-q8_0 --port 8082      # reranking
nodeau ps
```

Every endpoint answers as its own model, and stopping one leaves the others
serving. Before `nodeau run` gives you an address, it checks that the model
answering there is the one it started: if another program already holds the port
you asked for, it tells you what holds it and prints no address, so you never
get a working-looking endpoint for the wrong model.

Vision models, such as `gemma-4-e4b-qat-q4-0`, bring a second file with them (the image
projector). Nodeau downloads and verifies both, and the request shape is the one
in [image input](/docs/tasks/#image-input).

## Unified memory {#unified-memory}

This is the one thing about a Mac that surprises people, and it's worth a
minute to understand.

On Apple Silicon the system, your applications and the GPU share **one** pool of
memory. So "will this model fit?" isn't a fixed property of the machine. It
depends on what else is open.

Nodeau reads two separate numbers:

- a **static ceiling**, the most the GPU is allowed to hold. It's a property of
  the device, and it stays put even when free memory swings by gigabytes.
- a **live figure** for what's actually free right now.

The fit check uses the smaller of the two, minus a system reserve. That has a
real, correct consequence:

> A model that started yesterday can be turned away today, because you now have
> a browser and a video call open. Close something and try again.

That's Nodeau reading the machine honestly. It keeps its safety margin whole,
because an out-of-memory kill on a machine whose display runs on the same GPU
is much worse than a clear "not right now".

If you want to accept that risk for one workload, `nodeau run` takes
`--accept-estimate-risk` and `--spend-safety-reserve`. Both are explicit, both
apply to one workload, and both are recorded. See
[accepting the risk yourself](/docs/scheduling/#accepting-the-risk-yourself).

## Where things live

| Path | What |
|---|---|
| `~/.local/bin/nodeau` | The CLI, as the bootstrap installed it |
| `~/Library/Application Support/Nodeau/` | Nodeau's own directory |
| `~/Library/Application Support/Nodeau/state/models/` | Model cache |
| `~/Library/Application Support/Nodeau/state/runtimes/` | The Metal model runtime |
| `~/Library/Application Support/Nodeau/api-key` | Your local API key, mode `0600` |
| `~/Library/LaunchAgents/` | The endpoint's user agent |

`XDG_CONFIG_HOME` and `XDG_STATE_HOME` are honoured when you set them
explicitly.

:::note Why Application Support rather than Caches
macOS may purge `~/Library/Caches` on its own, and a verified model should stay
verified. So the model cache lives in Application Support, where only you and
Nodeau decide what goes.
:::

## The model runtime

On Linux a runtime is a container image with a digest, which vouches for itself.
A directory can't do that, so on macOS the runtime carries a manifest (version,
engine, backend, OS and architecture, a SHA-256 for every file, and the upstream
commit) and **fails closed** if it doesn't verify.

Installing one is verify-then-promote: if a new runtime fails its checks, the
previous one keeps serving. `nodeau doctor` reports `RUNTIME_MISSING`,
`RUNTIME_CORRUPT`, `RUNTIME_UNVERIFIED` and `RUNTIME_UNMANAGED` separately,
because each needs a different answer.

## Upgrading

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install
```

`nodeau update` checks whether there's something newer first. See
[updates and release channels](/docs/updates/).

## Uninstalling

```bash
nodeau uninstall --dry-run
nodeau uninstall
```

It removes what `nodeau install` put here and leaves everything else. A model
runtime you assembled yourself, a `PATH` line you wrote, or a copy of `nodeau`
you manage all stay, and the plan says so.

| Flag | What it does |
|---|---|
| `--dry-run` | Show what would be removed and stop |
| `--yes`, `-y` | Answer yes to every question |
| `--models` | Also delete downloaded model weights |
| `--keep-path` | Leave the `PATH` line in your login profile |
| `--state <path>` | Path to the install ledger |

Your downloaded models are **kept** unless you pass `--models`. Removing the
software and throwing away gigabytes of downloads are different decisions, so
they're different flags.

## If something went wrong

[Troubleshooting has a section for Macs](/docs/troubleshooting/#macos).
