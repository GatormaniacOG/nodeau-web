---
title: Uninstalling Nodeau
heading: Uninstalling
nav: Uninstalling
description: What nodeau uninstall removes, what it deliberately keeps, how the ownership ledger decides, and what is left behind on purpose.
lede: Nodeau removes only what Nodeau installed, and refuses to remove anything else even if you ask. That is what the ownership ledger is for.
---

## Look first

```bash
nodeau uninstall --dry-run
```

The full plan is printed before anything happens, and each destructive option is
named for exactly what it destroys. There is deliberately **no flag that means
"remove more" without saying what**.

## The ownership ledger

When `nodeau install` runs, it records — at `/var/lib/nodeau/install-state.json`
on Linux — which components it **installed** and which it **adopted** because they
were already there.

Uninstall reads that ledger. A component Nodeau adopted is left exactly as it was
found. This is why `nodeau install` never re-decides who owns a component when you
run it again: changing that record retroactively would change what a later
uninstall is allowed to touch.

The removal set is derived from the **same** manifests the install applies, so a
component Nodeau installs and does not know how to remove fails the build rather
than being left behind silently.

Ownership is also resolved **per entry** in the model cache and the runtime
directory, and the policy is conservative toward **keep**: an entry with no
manifest is never removed, whatever the ledger says.

## Linux

```bash
nodeau uninstall
```

### Removed

- Nodeau's controller and node agent
- Its custom resource definitions
- Its namespaces
- Your local endpoint services
- The per-device GPU driver and device plugin, if Nodeau installed them

### Kept by default

| | Why |
|---|---|
| Your **NVIDIA driver** | Always, under every flag. Nodeau never owned it |
| Your **downloaded models** | Gigabytes you chose to fetch |
| Your **batch inputs and results** | They exist nowhere else |
| **Kubernetes** | If it was here before Nodeau |
| The **NVIDIA Container Toolkit** | For the same reason |
| Your **API key** and account link | Local files you own |

### Removing more, explicitly

| Flag | What it destroys |
|---|---|
| `--remove-models` | Downloaded model weights. Gigabytes; you will re-download them |
| `--remove-batch-data` | Every batch job's input records and results. **These exist nowhere else** — unlike model weights they cannot be downloaded again |
| `--remove-managed-k3s` | K3s, **and only if Nodeau installed it** |
| `--remove-toolkit` | The NVIDIA Container Toolkit, **and only if Nodeau installed it** |
| `--purge` | Every option above at once |

Other flags: `--dry-run`, `--yes`/`-y`, `--namespace`/`-n`, `--state <path>`.

:::danger `--purge` is not reversible
It removes models you will have to download again and batch records that exist
nowhere else. Run `--dry-run --purge` first and read the plan.
:::

### Removing Kubernetes

If Nodeau installed K3s, `--remove-managed-k3s` removes it. Nodeau also **prints**
the root commands that clean up what a K3s removal can leave behind — for example
directories under `/run` — for you to run yourself.

:::warning Those printed commands have not been executed for you
They are printed for you to inspect and run. `--dry-run` does not print them.
Read them before running them: they are root commands on your own machine.
:::

## macOS

A Mac runs standalone — it never joined a fleet, so there is no membership to
remove and no other machine to tell.

```bash
nodeau uninstall --dry-run
nodeau uninstall
```

It removes what `nodeau install` put here and nothing else. A model runtime you
assembled yourself, a `PATH` line you wrote, or a copy of `nodeau` you manage are
all left alone, and the plan says so.

| Flag | What it does |
|---|---|
| `--dry-run` | Show what would be removed and stop |
| `--yes`, `-y` | Do not ask anything |
| `--models` | Also delete downloaded model weights |
| `--keep-path` | Leave the `PATH` line in your login profile |
| `--state <path>` | Path to the install ledger |

Your downloaded models are **kept** unless you pass `--models`. Uninstalling the
software and throwing away gigabytes of downloads are different decisions.

## Your account and your fleet

`nodeau uninstall` is a **local** operation. It does not:

- remove the installation from your Nodeau account,
- remove the machine from a fleet,
- cancel a subscription.

Do those separately:

```bash
nodeau logout                       # unlink this machine locally
nodeau fleet remove <machine>       # from the machine that runs the control plane
```

Removing a machine from a fleet is done from another machine, because a machine
that is gone cannot do it for itself. See
[removing a machine](/docs/fleet/#removing-a-machine).

## What is left behind, on purpose

After a plain uninstall you will still have:

- `~/.local/bin/nodeau` and `nodeau-fleet` — the binaries the bootstrap installed
  into a directory you own. Delete them yourself if you want them gone.
- `~/.config/nodeau/` — your API key, account link and entitlement.
- `/var/lib/nodeau/models/` — your downloaded weights.
- `/var/lib/nodeau/batch/` — your batch records.
- Your NVIDIA driver, Secure Boot configuration, bootloader and partitions,
  untouched.

## Checking afterwards

```bash
nodeau doctor --host-only
```

On a machine Nodeau has been removed from, `NODEAU_NOT_INSTALLED` is the correct
answer rather than a fault.
