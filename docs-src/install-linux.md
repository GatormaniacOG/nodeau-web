---
title: Install Nodeau on Linux with an NVIDIA GPU
heading: Install on Linux / NVIDIA
nav: Install on Linux / NVIDIA
description: The complete Linux install — driver check, the bootstrap script, what nodeau install changes and what it refuses to touch, verification, upgrade and reinstall.
lede: About ten minutes, plus the model download. Nothing here needs a source checkout, a container registry account or a licence key.
---

:::linux
This page is the Linux path. On an Apple Silicon Mac the flow is genuinely
different — no Kubernetes, no containers, no password — and it has its own page:
[Install on macOS](/docs/install-macos/).
:::

## Before you start

You need:

- **Ubuntu 24.04 LTS on x86_64**, installed natively. Other distributions produce
  a warning rather than a refusal; the pinned package versions are chosen for
  24.04.
- An **NVIDIA GPU with a working driver already installed**.
- About **20 GB free disk** on a native Linux filesystem.
- Outbound HTTPS.
- `sudo` for the system steps. Nodeau prints every privileged command before
  running it.

Full detail: [platform support and requirements](/docs/requirements/).

### Check the driver first

```bash
nvidia-smi
```

It must print a table of GPUs. If it does not, install your distribution's
NVIDIA driver and come back.

:::important Nodeau does not own your driver
Nodeau will never install, upgrade, replace or remove the NVIDIA driver, and
never touches Secure Boot, the bootloader or the kernel command line. Those
decisions affect whether your machine boots to a desktop. Nodeau checks the
driver, reports what it finds, and stops.
:::

## Step 1 — get the CLI

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
```

Prefer to read it first? That is the better habit, and the script is short:

```bash
curl -fsSL https://get.nodeau.ai/install.sh -o install-nodeau.sh
less install-nodeau.sh
bash install-nodeau.sh
```

### What the bootstrap does, and what it does not

It is a **bootstrapper**, not the installer. Its whole job is to get a verified
binary onto the machine. Everything else — packages, Kubernetes, the container
runtime — happens afterwards, from the binary, where you can see the plan first.

- Resolves the release channel, downloads `nodeau-linux-amd64.tar.gz`, and
  **verifies its SHA-256 against the published manifest**. A mismatch installs
  nothing.
- Installs `nodeau` and `nodeau-fleet` into `~/.local/bin` — a directory you own.
- **Refuses to run as root.** It calls no `sudo`.
- Refuses on WSL, and on an Intel Mac, by name rather than with a generic
  "unsupported platform".
- Changes nothing else on the machine.

| Option | Environment variable | Meaning |
|---|---|---|
| `--version <v>` | `NODEAU_VERSION` | Pin an exact version instead of what the channel offers |
| `--dir <path>` | `NODEAU_INSTALL_DIR` | Install somewhere other than `~/.local/bin` |
| — | `NODEAU_CHANNEL` | Which channel to resolve (default `beta`) |
| — | `NODEAU_BASE_URL` | Where to download from (for testing) |

:::note If `nodeau` is not found afterwards
`~/.local/bin` is not on your `PATH`. The installer prints the exact lines; see
[troubleshooting](/docs/troubleshooting/#nodeau-command-not-found).
:::

## Step 2 — look at the machine

```bash
nodeau doctor
```

Read-only. It never installs, configures, mounts, starts or stops anything —
it only looks. It reports the operating system, processor, memory, disk safety,
Secure Boot, the GPU and driver, the container runtime, Kubernetes, and what
Nodeau itself is doing.

Every result that is not a pass carries a typed code, an explanation and
something to do about it. `nodeau doctor --json` gives all of that in a stable
shape for a script.

## Step 3 — set the machine up

```bash
nodeau install --dry-run     # the full plan, every command, changes nothing
nodeau install               # the same plan, then asks before acting
```

The plan names every component, whether it is already present, what Nodeau
intends to do about it, and what it will not touch. Every command that needs
`sudo` is printed in full before you are asked, so nothing surprises you
halfway through.

### What it installs when it is missing

| Component | |
|---|---|
| **NVIDIA Container Toolkit** | A pinned version, from NVIDIA's official repository. The signing key is verified against a known fingerprint before it is trusted, and the package transaction is simulated and screened first. |
| **K3s** | A pinned version. The release binary is downloaded and checked against a SHA-256 compiled into the Nodeau binary before anything runs it — no install script is fetched and piped into a shell. |
| **NVIDIA device plugin** | What makes a GPU an allocatable Kubernetes resource on a machine that allocates by count. |
| **The per-device GPU driver** | What lets Nodeau name an exact card. Installed everywhere, idle until a machine opts in. |
| **Nodeau's control plane** | Its custom resources, namespaces, RBAC, controller and node agent. |
| **Model cache and batch storage** | Where weights and batch records live on this machine. |

Every Kubernetes manifest is compiled into the `nodeau` binary. There is no
checkout to clone, no `kubectl` to run, and nothing to fetch from a source
repository. `nodeau install --print-manifests` prints all of them and changes
nothing.

### What it adopts instead of installing

If any of those is already on the machine, Nodeau **uses it as it found it** and
writes that down in an ownership ledger at
`/var/lib/nodeau/install-state.json`.

That record is what makes uninstall safe: Nodeau removes only what Nodeau
installed, and refuses to remove anything else even if you ask. If a Kubernetes
cluster is already reachable, Nodeau adopts it — it will not install K3s
alongside it, will not reconfigure it, and will never delete it.

### What it will never do

- Install, upgrade, replace or remove your **NVIDIA driver**
- Disable **Secure Boot** or enrol keys
- Modify your **bootloader** or kernel command line
- Touch a partition, or mount NTFS
- Delete a **Kubernetes cluster it did not create**
- Open any port beyond `127.0.0.1`

### Options

| Flag | What it does |
|---|---|
| `--dry-run` | Show the plan, including every command, and stop |
| `--server-dry-run` | Send every manifest to the Kubernetes API server for full validation and admission, then discard it |
| `--print-manifests` | Print every manifest compiled into the binary and exit |
| `--yes`, `-y` | Skip the confirmation |
| `--verbose`, `-v` | The full technical plan instead of the plain-language summary |
| `--skip-k3s` | Do not install Kubernetes; you will provide a cluster |
| `--skip-toolkit` | Do not install the NVIDIA Container Toolkit |
| `--cache-dir <path>` | Model cache directory (default `/var/lib/nodeau/models`) |
| `--state <path>` | Path to the install ledger |
| `--scheduling-mode <mode>` | Record `efficiency`, `balanced` or `performance`; unset is balanced |
| `--channel <name>` | Release channel to record for this installation |

:::warning A dry run cannot see everything
`--server-dry-run` validates the manifests against a live API server, which is a
strong check. One step it structurally cannot evaluate is the schema read-back
that a real install performs between applying the custom resources and rolling
the controller. A dry run's silence about a step is not evidence about that step.
:::

### Running it again is safe

`nodeau install` is idempotent. It re-checks everything, skips what is done,
does not regenerate your API key, does not re-download models, and never
re-decides who owns a component. An interrupted install is recovered by running
it again.

Re-running it is also how an older installation picks up components a newer
release added.

## Step 4 — check it worked

```bash
nodeau doctor
```

Everything should pass, or carry only warnings. Then:

```bash
nodeau fleet list      # the machine and the cards in it
nodeau model list      # what you can run
```

## Step 5 — run something

```bash
nodeau quickstart
```

See [Quickstart](/docs/quickstart/) for what each step of that does.

## Where things live

| Path | What |
|---|---|
| `~/.local/bin/nodeau` | The CLI |
| `~/.local/bin/nodeau-fleet` | The fleet connector, installed beside it and started by nothing |
| `~/.config/nodeau/api-key` | Your local API key, mode `0600` |
| `~/.config/nodeau/account.json` | Account link, if you signed in |
| `~/.config/nodeau/entitlement.token` | The signed entitlement, if you have one |
| `~/.local/state/nodeau/` | Endpoint state and install logs |
| `~/.config/systemd/user/` | The local endpoint's user service |
| `/var/lib/nodeau/models/` | Model cache |
| `/var/lib/nodeau/batch/` | Batch inputs and results |
| `/var/lib/nodeau/install-state.json` | The ownership ledger |

`XDG_CONFIG_HOME` and `XDG_STATE_HOME` are honoured when set.

## Upgrading

The same bootstrap command. It replaces the binaries in place and leaves your
cluster, models, key and entitlement alone:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
nodeau install          # picks up anything the new release adds
```

`nodeau update` tells you whether there is something newer first. Full detail:
[updating and release channels](/docs/updates/).

:::note A replaced file is not a replaced process
Replacing a binary does not replace a process that is already running: it keeps
executing the file it started with. The installer restarts a fleet connector
whose binary it replaced, and `nodeau doctor` reports the condition
(`CONNECTOR_BINARY_REPLACED`, `ENDPOINT_BINARY_REPLACED`) when something was
left behind.
:::

## Uninstalling

```bash
nodeau uninstall --dry-run
```

See [uninstalling](/docs/uninstall/) for exactly what is removed and what is
deliberately kept.

## If something went wrong

Start with `nodeau doctor`, then
[troubleshooting](/docs/troubleshooting/#installation). If you want us to look,
`nodeau support bundle` collects what somebody would need and nothing else —
see [support bundles](/docs/support/).
