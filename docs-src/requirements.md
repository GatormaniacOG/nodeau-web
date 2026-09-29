---
title: Nodeau requirements and supported platforms
heading: Requirements and platforms
nav: Requirements and platforms
description: Where Nodeau runs, what each support level rests on, and what a machine needs in GPU, disk, memory, network and privileges.
lede: Nodeau runs on Linux (Ubuntu 24.04, x86_64, NVIDIA) and on Apple Silicon Macs. Here's what each platform does, what it needs, and the evidence behind every level.
---

## Where Nodeau runs

Two platforms, each set up in the way that suits it:

- **A Linux machine with an NVIDIA GPU.** Ubuntu 24.04 LTS on x86_64, with a
  working NVIDIA driver. Every capability runs here, from one machine to a
  fleet of them.
- **An Apple Silicon Mac.** Any M-series Mac. It runs standalone and serves chat
  models on the Mac's own GPU through Metal.

Nodeau has been run end to end on an **RTX 5070 Ti**, an **RTX 3080**, an
**RTX 5060 Ti** and an **RTX 2080** under Ubuntu 24.04, and on **M3 Pro** Macs
under macOS 26.5 and macOS 27.

## Support levels

A support level is a claim about evidence, not about intent. There are four,
and we use them literally.

| Level | What it means |
|---|---|
| **Recommended** | What Nodeau is developed and measured on every day. A problem here is a bug that blocks a release. |
| **Qualified** | Run end to end on named, real hardware, from the exact files a customer downloads, with its scope written down. |
| **Experimental** | Implemented, with its hardware qualification still to come. Nothing sits here today. |
| **Unsupported** | Nodeau makes no support claim, and stops at the start with a clear message rather than half-working. |

## Platforms

| Platform | Level | What that rests on |
|---|---|---|
| Linux with NVIDIA, Ubuntu 24.04 LTS, x86_64 | **Recommended** | Several machines and four NVIDIA cards, through reboots, a power cut and a GPU moving between machines. |
| Apple Silicon, M-series Mac | **Qualified** | M3 Pro Macs installed from the public path and serving chat on Metal. A Mac runs standalone, and the scope is in the table below. |
| Windows through WSL | **Unsupported** | The GPU path through WSL works differently. `install.sh` recognises WSL and stops before changing anything. WSL is on the roadmap as planned work. |
| Native Windows | **Unsupported** | Nodeau publishes builds for Linux and macOS. |
| Intel Macs | **Unsupported** | Metal execution needs an M-series chip, and `install.sh` names that as the reason. |

:::note Other Linux distributions
`nodeau install` warns and carries on. The package versions Nodeau pins are
chosen for Ubuntu 24.04, and no other distribution has been run end to end yet,
so Nodeau makes no support claim for one. If you try, we'd love to hear how it
went.
:::

:::note A macOS version we haven't tried
Nodeau checks no macOS version number anywhere, and the installer doesn't branch
on one. Untested and unsupported are different things, so the choice is yours.
A report from a machine we have never seen is the most useful thing we get.
:::

## What runs where {#what-runs-where}

| Capability | Linux with NVIDIA | Apple Silicon |
|---|---|---|
| Local inference with an OpenAI-compatible endpoint | Yes | Yes, through Metal |
| Chat | Yes, with streaming | Yes |
| The curated catalog, verified downloads and the model cache | Yes | Yes |
| The fit check before anything starts | Yes | Yes, against unified memory |
| `run`, `ps`, `stop`, `logs` and `doctor` | Yes | Yes |
| Accounts, plans and offline entitlements | Yes | Yes |
| Embeddings, reranking, structured output, tool calling and image input | Yes | On your Linux machines, with the Mac in progress |
| Batch inference | Yes | On your Linux machines |
| Bring your own model | Yes | On your Linux machines |
| Several GPUs in one machine | Yes | A Mac has one integrated GPU |
| One model across several GPUs | Yes, NVIDIA cards in one machine | A Mac has one integrated GPU |
| A fleet of several machines | Yes | A Mac runs standalone |
| Scheduling modes, power limits, health, and limits and policies | Yes | Part of a Linux fleet |

On Apple Silicon the GPU shares one pool of memory with everything else on the
Mac, so whether a model fits depends on what else is running. See
[unified memory](/docs/install-macos/#unified-memory).

## GPUs

| GPU | Level | Notes |
|---|---|---|
| NVIDIA, on Linux | Recommended | Nodeau enforces no minimum compute capability. On a card it has no measurement for, it works out a careful estimate and says so on the decision. |
| Apple Silicon integrated GPU | Qualified | Through Metal, on the Mac's native execution plane. |
| AMD GPUs | **Unsupported** | A different runtime and a different memory story, so it's more than a configuration flag. It's on the roadmap under exploring. |
| Intel GPUs | **Unsupported** | The same. |

Nodeau ships measured profiles for the cards it has run on, and computes a
figure for everything else from the model's own architecture and file size, plus
a further margin. An estimate is always labelled as one. See
[measured and estimated](/docs/scheduling/#estimated-and-measured).

### How much GPU memory you need

The curated catalog sits on a hardware ladder, and every model says which rung
it's on:

| Rung | What it runs |
|---|---|
| **8 GB** | A compact general model, an embedding model, a reranker and a compact multimodal model |
| **12 GB** | A mainstream general model and a mainstream multimodal model |
| **16 GB** | A larger, efficient mixture-of-experts model |
| **24 GB, or several smaller cards in one machine** | The flagship general model |

A rung is guidance. The decision is always made by the fit check, on your card,
at the moment you ask, and a model can fit a smaller card than its label
suggests. See [the model catalog](/docs/models/#the-curated-catalog).

## The NVIDIA driver

On Linux, have a working NVIDIA driver in place **before** you install Nodeau.

```bash
nvidia-smi
```

If that prints a table of GPUs, you're ready.

The driver is yours. Nodeau checks it and reports what it finds, and it leaves
the driver, Secure Boot, the bootloader and the kernel command line exactly as
they are, because those decide whether your machine boots to a desktop. If the
driver isn't working, Nodeau stops and tells you what it saw.

:::note Secure Boot can stay on
With Secure Boot on, the driver has to be a kernel module your distribution has
already signed. On Ubuntu that means the prebuilt `linux-modules-nvidia-*`
packages rather than a DKMS build, which would need somebody at the keyboard to
enrol a key at boot.
:::

## Disk

| | |
|---|---|
| The Nodeau binaries | under 100 MB |
| Container images (Linux) | about 3 GB |
| The starter model | about 2.6 GB |
| **Recommended free space** | **20 GB** |

Model files are large, and you'll probably want more than one. Plan for the
models you intend to run rather than for the starter.

:::warning Keep the model cache on a native filesystem
Nodeau puts its state only on a filesystem it can identify as native, and treats
any NTFS partition, and every sibling partition on the same disk, as protected.
On a dual-boot machine, that's what keeps Nodeau well away from the other
operating system's disk. `nodeau environment` shows how each disk is classified.
:::

## Memory

On Linux, 16 GB of system RAM or more is comfortable. Model files pass through
system memory on their way to the card.

On Apple Silicon, memory is **unified**: one pool serves the system, your
applications and the GPU. Whether a model fits therefore depends on what else is
running, and it can change from one attempt to the next. If a model that
started yesterday doesn't fit today, Nodeau is reading the machine correctly:
close something and try again. See
[Install on a Mac](/docs/install-macos/#unified-memory).

## Network

Installing needs outbound HTTPS to reach the release, the container images and
the model publisher. After that, inference needs no network at all.

The local endpoint binds `127.0.0.1` and nothing else, and that isn't a setting.
Nodeau opens no inbound ports and needs no port forwarding. When you connect a
fleet to your account, your machines make the connection outward to Nodeau
Cloud. See [security and privacy](/docs/security/).

## Privileges

| | |
|---|---|
| `install.sh` | Runs as you, installs into a directory you own, and calls no `sudo`. It stops if you run it as root. |
| `nodeau install` on Linux | Uses `sudo` for the package and cluster steps. Every privileged command is printed in full before you're asked. |
| `nodeau install` on a Mac | Needs **no** password. Everything lives in your own Library folder. |

## What each plan allows

Limits are enforced by the binary, from a signed entitlement it checks locally.

| | Home (free) | Home Pro | Business |
|---|---|---|---|
| Machines | 1 | 3 | Unlimited |
| GPUs in any one machine | 1 | 2 | Unlimited |
| Workloads running at once | 2 | Unlimited | Unlimited |
| Batch inference | From Home Pro | Unlimited jobs | Unlimited jobs |
| Seeing your machines at `app.nodeau.ai` | Yes | Yes | Yes |
| Operating them from `app.nodeau.ai` | From Home Pro | Yes | Yes |

Each GPU runs one workload at a time, so the GPUs you have also set how many
workloads run at once.

Everything that keeps you safe, meaning the fit check, artifact verification,
authentication and every integrity check, is the same on every plan. See
[accounts and plans](/docs/accounts/).
