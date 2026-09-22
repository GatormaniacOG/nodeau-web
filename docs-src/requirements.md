---
title: Platform support and requirements
heading: Platform support and requirements
nav: Platform support and requirements
description: Which operating systems, GPUs and hardware Nodeau runs on, what each support level rests on, and what it needs in disk, memory and network.
lede: A support level here is a claim about evidence, not about intent. Each row says what it rests on.
---

## Support levels

| Level | What it means |
|---|---|
| **Recommended** | What Nodeau is developed and measured on. Problems here are bugs. |
| **Qualified** | Run end to end on real hardware from the artifact a customer downloads, with named exclusions. |
| **Experimental** | Implemented, not qualified on hardware. Nothing sits here today. |
| **Unsupported** | Refused, or known not to work. Nodeau stops rather than half-working. |

## Platforms

| Platform | Level | What that rests on |
|---|---|---|
| Linux · NVIDIA — Ubuntu 24.04 LTS, x86_64 | **Recommended** | Several machines and four NVIDIA cards, through reboots, a power cut and a GPU swap between machines. |
| Apple Silicon — M-series Mac | **Qualified** | One machine, an M3 Pro, installed from the public path and serving on Metal. Earlier macOS versions are untested rather than unsupported. |
| Other Linux distributions | Unknown | `nodeau install` warns and continues. The pinned package versions are chosen for Ubuntu 24.04 and may not exist elsewhere. |
| Windows via WSL | **Unsupported** | The GPU path through WSL is genuinely different and has not been tested. `install.sh` detects and refuses. |
| Native Windows | **Unsupported** | No build is published. |
| Intel Mac | **Unsupported** | `install.sh` detects and refuses by name. Metal execution needs an M-series chip. |

:::note Untested is not unsupported
Nodeau checks no macOS version number anywhere, and the installer does not
branch on one. If you are on an earlier macOS than we have tried, the choice is
yours rather than ours — and a report from a machine we have never seen is the
most useful thing we get.
:::

## GPUs

| | Level | Notes |
|---|---|---|
| NVIDIA, on Linux | Supported | Nodeau enforces no minimum compute capability. Cards it has no measurement for are **estimated** conservatively, and the decision says so. |
| Apple Silicon integrated GPU | Supported | Through Metal, on the native execution plane. |
| AMD GPUs | **Unsupported** | A different runtime and memory story, not a configuration flag. |
| Intel GPUs | **Unsupported** | Same. |

Nodeau ships measured profiles for the cards it has run on and computes a
figure for the rest from the model's own architecture and artifact size, plus a
further margin. An estimate is never presented as a measurement — see
[admission](/docs/scheduling/#estimated-and-measured).

### How much VRAM you need

The curated catalog is arranged on a hardware ladder, and every model states
which rung it is on:

| Rung | What it runs |
|---|---|
| **8 GB** | A compact general model, an embedding model, a reranker, a compact multimodal model |
| **12 GB** | A mainstream general model, a mainstream multimodal model |
| **16 GB** | A larger, efficient mixture-of-experts model |
| **24 GB, or several smaller cards in one machine** | The flagship general model |

A rung is guidance. The decision is always made by admission, on your card, at
the moment you ask — see [models](/docs/models/#the-curated-catalog).

## The NVIDIA driver

On Linux you need a working NVIDIA driver **before** installing Nodeau.

```bash
nvidia-smi
```

If that prints a table of GPUs, you are ready.

Nodeau will never install, upgrade, replace or remove your driver, and never
touches Secure Boot, the bootloader or the kernel command line. That decision
affects whether your machine boots to a desktop, and it is yours. If the driver
is not working, Nodeau stops and tells you rather than trying to fix it.

:::note Secure Boot
Secure Boot can stay on. It means the driver has to be a kernel module your
distribution has already signed — on Ubuntu, the prebuilt `linux-modules-nvidia-*`
packages rather than a DKMS build, which would need somebody at the physical
keyboard to enrol a key at boot.
:::

## Disk

| | |
|---|---|
| The Nodeau binaries | under 100 MB |
| Container images (Linux only) | about 3 GB |
| The starter model | about 2.6 GB |
| **Recommended free space** | **20 GB** |

Model files are large and you will want more than one. Plan for the models you
intend to run rather than for the starter.

:::warning The model cache must be on a native filesystem
Nodeau refuses to put state on NTFS or on a filesystem it cannot identify, and
treats any NTFS partition — and every sibling partition on its disk — as
protected. On a dual-boot machine this is what stops Nodeau writing into the
other operating system's disk. `nodeau environment` shows the classification.
:::

## Memory

16 GB of system RAM or more is comfortable on Linux. Model files pass through
system memory on their way to the card.

On Apple Silicon, memory is **unified**: the same pool serves the system, your
applications and the GPU. Whether a model fits therefore depends on what else
is running, and it can change between one attempt and the next. A refusal today
after a success yesterday is Nodeau reading the machine correctly, not a fault —
see [Install on macOS](/docs/install-macos/#unified-memory).

## Network

Installation needs outbound HTTPS to reach the release, the container images and
the model publisher. After that, inference needs no network at all.

Nodeau opens **no** inbound ports and needs no port forwarding. The local
endpoint binds `127.0.0.1` and nothing else, and that is not a setting. If you
connect a fleet to Nodeau Cloud, your machines reach out; nothing ever connects
in. See [security and privacy](/docs/security/).

## Privileges

| | |
|---|---|
| `install.sh` | Runs as you. **Refuses to run as root.** Calls no `sudo`. |
| `nodeau install` on Linux | Needs `sudo` for the package and cluster steps. Every privileged command is printed in full before you are asked. |
| `nodeau install` on macOS | Needs **no** password at all. Everything lives in your own Library folder. |

## What each plan allows

Limits are enforced by the binary from a signed entitlement, not by a web page.

| | Home (free) | Home Pro | Business |
|---|---|---|---|
| Machines | 1 | 3 | Unlimited |
| GPUs in any one machine | 1 | 2 | Unlimited |
| Models serving at once | 2 | Unlimited | Unlimited |
| Batch jobs | — | Unlimited | Unlimited |
| Users | 1 | 1 | Unlimited |

Everything that protects you — admission, artifact verification, authentication,
every integrity check — is identical on every plan and is never withheld. See
[accounts, plans and entitlements](/docs/accounts/).
