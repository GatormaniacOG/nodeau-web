---
title: Install Nodeau on Linux with an NVIDIA GPU
heading: Install on Linux
nav: Install on Linux
description: The complete Linux install: the driver check, the bootstrap script, what nodeau install sets up and what it leaves alone, checking it worked, upgrading and reinstalling.
lede: About ten minutes, plus the model download. You won't need a source checkout, a container registry account or a licence key.
---

:::linux
This is the Linux path. On an Apple Silicon Mac the flow is different, with no
Kubernetes, no containers and no password, and it has its own page:
[Install on a Mac](/docs/install-macos/). A Mac runs standalone.
:::

## Before you start

You'll need:

- **Ubuntu 24.04 LTS on x86_64**, installed natively. Other distributions get a
  warning rather than a stop, and the pinned package versions are chosen for
  24.04.
- An **NVIDIA GPU with a working driver already installed**.
- About **20 GB free disk** on a native Linux filesystem.
- Outbound HTTPS.
- `sudo` for the system steps. Nodeau prints every privileged command before it
  runs it.

Full detail: [requirements and platforms](/docs/requirements/).

### Check the driver first

```bash
nvidia-smi
```

It should print a table of your GPUs. If it doesn't, install your
distribution's NVIDIA driver and come back.

:::important The driver stays yours
Nodeau checks the NVIDIA driver and reports what it finds, and it leaves the
driver, Secure Boot, the bootloader and the kernel command line exactly as they
are. Those decide whether your machine boots to a desktop, so they're your call.
If the driver isn't working, Nodeau stops and says so.
:::

## Step 1: get the CLI

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
```

Like to read a script before you run it? Good habit, and this one is short:

```bash
curl -fsSL https://get.nodeau.ai/install.sh -o install-nodeau.sh
less install-nodeau.sh
bash install-nodeau.sh
```

### What the bootstrap does

It's a **bootstrapper**, not the installer. Its whole job is to get a verified
binary onto the machine. Everything else (packages, Kubernetes, the container
runtime) happens afterwards, from that binary, where you can see the plan first.

- It resolves the release channel, downloads `nodeau-linux-amd64.tar.gz`, and
  **checks its SHA-256 against the published manifest**. If the checksum
  doesn't match, it installs nothing.
- It installs `nodeau` and `nodeau-fleet` into `~/.local/bin`, a directory you
  own.
- It runs as you and calls no `sudo`. Run it as root and it stops and tells you
  why.
- On WSL, or on an Intel Mac, it stops and names the reason.
- It changes nothing else on the machine.

| Option | Environment variable | Meaning |
|---|---|---|
| `--version <v>` | `NODEAU_VERSION` | Pin an exact version instead of what the channel offers |
| `--dir <path>` | `NODEAU_INSTALL_DIR` | Install somewhere other than `~/.local/bin` |
|  | `NODEAU_CHANNEL` | Which channel to resolve (default `beta`) |
|  | `NODEAU_BASE_URL` | Where to download from, for testing |

:::note If `nodeau` isn't found afterwards
`~/.local/bin` isn't on your `PATH` yet. The installer prints the exact lines to
add, and [troubleshooting](/docs/troubleshooting/#nodeau-command-not-found) has
them too. Opening a new terminal is often enough.
:::

## Step 2: look at the machine

```bash
nodeau doctor
```

This only looks. It reports the operating system, processor, memory, disk
safety, Secure Boot, the GPU and driver, the container runtime, Kubernetes, and
what Nodeau itself is doing, and it changes nothing.

Anything that isn't a pass comes with a typed code, an explanation and something
to do about it. `nodeau doctor --json` gives you all of that in a stable shape
for scripts.

## Step 3: set the machine up

```bash
nodeau install --dry-run     # the full plan and every command, changing nothing
nodeau install               # the same plan, then it asks before acting
```

The plan names every component, whether it's already there, and what Nodeau
intends to do about it. Every command that needs `sudo` is printed in full
before you're asked, so nothing surprises you halfway through. Ubuntu will ask
for your password once or twice.

### What it sets up when it's missing

| Component | |
|---|---|
| **NVIDIA Container Toolkit** | A pinned version from NVIDIA's official repository. The signing key is checked against a known fingerprint before it's trusted, and the package transaction is simulated and screened first. |
| **K3s** | A pinned version. The release binary is downloaded and checked against a SHA-256 compiled into Nodeau before anything runs it. No install script is piped into a shell. |
| **NVIDIA device plugin** | What makes a GPU something Kubernetes can hand to a workload, on a machine that allocates cards by count. |
| **The per-device GPU driver** | What lets Nodeau name an exact card. It's installed everywhere and stays idle until a machine opts in. |
| **Nodeau's control plane** | Its custom resources, namespaces, access rules, controller and node agent. |
| **Model cache and batch storage** | Where weights and batch records live on this machine. |

Every Kubernetes manifest is compiled into the `nodeau` binary, so there's no
checkout to clone, no `kubectl` to run, and nothing to fetch from a source
repository. `nodeau install --print-manifests` prints all of them and changes
nothing.

### What it adopts instead

If any of those is already on the machine, Nodeau **uses it as it found it** and
writes that down in an ownership ledger at `/var/lib/nodeau/install-state.json`.

That record is what makes uninstalling safe: Nodeau removes what it installed,
and leaves everything it found. If a Kubernetes cluster is already reachable,
Nodeau adopts it as it is. It doesn't install K3s beside it, reconfigure it, or
ever delete it.

### What stays exactly as you left it

- Your **NVIDIA driver**
- **Secure Boot** and its keys
- Your **bootloader** and kernel command line
- Your **partitions**, and any NTFS volume
- Any **Kubernetes cluster Nodeau didn't create**
- Your **network**: the endpoint listens on `127.0.0.1` and nothing else

### Options

| Flag | What it does |
|---|---|
| `--dry-run` | Show the plan, including every command, and stop |
| `--server-dry-run` | Send every manifest to the Kubernetes API server for full validation and admission, then discard it |
| `--print-manifests` | Print every manifest compiled into the binary and exit |
| `--yes`, `-y` | Skip the confirmation |
| `--verbose`, `-v` | Show the full technical plan instead of the plain-language summary |
| `--skip-k3s` | Leave Kubernetes to you, for when you'll provide a cluster yourself |
| `--skip-toolkit` | Leave the NVIDIA Container Toolkit to you |
| `--cache-dir <path>` | Model cache directory (default `/var/lib/nodeau/models`) |
| `--state <path>` | Path to the install ledger |
| `--scheduling-mode <mode>` | Record `efficiency`, `balanced` or `performance`. Unset means balanced |
| `--channel <name>` | The release channel to record for this installation |

:::note What a dry run can tell you
`--server-dry-run` validates every manifest against a live API server, which is
a strong check. One step happens only during a real install: reading the
schema back from the API server between applying the custom resources and
rolling the controller. A clean dry run speaks for the steps it ran, and that
one isn't among them.
:::

### Running it again is safe

`nodeau install` is idempotent. It re-checks everything, skips what's done,
keeps your API key and your models, and never re-decides who owns a component.
If an install is interrupted, run it again and it picks up where it stopped.

Running it again is also how an older installation picks up components that a
newer release added.

## Step 4: check it worked

```bash
nodeau doctor
```

Everything should pass, or carry only warnings. Then:

```bash
nodeau fleet list      # this machine and the cards in it
nodeau model list      # what you can run
```

## Step 5: run something

```bash
nodeau quickstart
```

[Your first model](/docs/quickstart/) walks through what each step does. When
you're ready for a second machine, see [add and run machines](/docs/fleet/).

## Where things live

| Path | What |
|---|---|
| `~/.local/bin/nodeau` | The CLI |
| `~/.local/bin/nodeau-fleet` | The fleet connector, installed beside it and started only when you connect a fleet |
| `~/.config/nodeau/api-key` | Your local API key, mode `0600` |
| `~/.config/nodeau/account.json` | Your account link, if you signed in |
| `~/.config/nodeau/entitlement.token` | The signed entitlement, if you have one |
| `~/.local/state/nodeau/` | Endpoint state and install logs |
| `~/.config/systemd/user/` | The local endpoint's user service |
| `/var/lib/nodeau/models/` | Model cache |
| `/var/lib/nodeau/batch/` | Batch inputs and results |
| `/var/lib/nodeau/install-state.json` | The ownership ledger |

`XDG_CONFIG_HOME` and `XDG_STATE_HOME` are honoured when set.

## Upgrading

Run the same bootstrap command. It replaces the binaries in place and leaves
your cluster, models, key and entitlement where they are:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install          # picks up anything the new release adds
```

`nodeau update` tells you whether there's something newer first. Full detail:
[updates and release channels](/docs/updates/).

:::note A replaced file isn't a replaced process
A program that's already running keeps executing the file it started with, even
after that file is replaced. The installer restarts a fleet connector whose
binary it replaced, and `nodeau doctor` names anything else still running an
older copy (`CONNECTOR_BINARY_REPLACED`, `ENDPOINT_BINARY_REPLACED`), so you
know what to restart.
:::

## Uninstalling

```bash
nodeau uninstall --dry-run
```

[Uninstalling](/docs/uninstall/) lists exactly what's removed and what's kept.

## If something went wrong

Start with `nodeau doctor`, then
[troubleshooting](/docs/troubleshooting/#installation). If you'd like us to
look, `nodeau support bundle` collects what somebody would need and nothing
else. See [support bundles](/docs/support/).
