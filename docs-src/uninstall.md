---
title: Uninstalling Nodeau
heading: Uninstalling
nav: Uninstalling
description: What nodeau uninstall removes, what it keeps, how the ownership ledger decides, and what stays on the machine on purpose.
lede: Nodeau removes what Nodeau installed and keeps everything else, even if you ask it to go further. That is what the ownership ledger is for.
---

## Look first

```bash
nodeau uninstall --dry-run
```

The full plan is printed before anything happens, and each option that deletes
something is named for exactly what it deletes. There is deliberately no flag
that means "remove more" without saying what.

## The ownership ledger

When `nodeau install` runs, it records, at `/var/lib/nodeau/install-state.json` on
Linux, which components it **installed** and which it **adopted** because they
were already there.

Uninstall reads that ledger, and a component Nodeau adopted is left exactly as it
was found. That is also why running `nodeau install` again never re-decides who
owns a component: changing that record later would change what an uninstall is
allowed to touch.

The removal set comes from the **same** manifests the install applies, so every
component Nodeau installs is one it knows how to remove.

Ownership is also decided **entry by entry** in the model cache and the runtime
directory, and the rule leans toward keeping: an entry without a Nodeau manifest
stays, whatever the ledger says.

## Linux

```bash
nodeau uninstall
```

### Removed

- Nodeau's controller and node agent
- Its custom resource definitions
- Its namespaces
- Your local endpoint services
- The per-device GPU driver and the device plugin, when Nodeau installed them

### Kept by default

| | Why |
|---|---|
| Your **NVIDIA driver** | Always, under every flag. It was yours before Nodeau and stays yours |
| Your **downloaded models** | Gigabytes you chose to fetch |
| Your **batch inputs and results** | They exist nowhere else |
| **Kubernetes** | When it was here before Nodeau |
| The **NVIDIA Container Toolkit** | For the same reason |
| Your **API key** and account link | Local files you own |

### Removing more, on purpose

| Flag | What it deletes |
|---|---|
| `--remove-models` | Downloaded model weights. Gigabytes, which you would download again to use them |
| `--remove-batch-data` | Every batch job's input records and results. **These exist nowhere else**: unlike model weights, they cannot be downloaded again |
| `--remove-managed-k3s` | K3s, **when Nodeau installed it** |
| `--remove-toolkit` | The NVIDIA Container Toolkit, **when Nodeau installed it** |
| `--purge` | Every option above at once |

The other flags are `--dry-run`, `--yes`/`-y`, `--namespace`/`-n` and
`--state <path>`.

:::danger `--purge` is permanent
It deletes models you would have to download again and batch records that exist
nowhere else. Run `--dry-run --purge` first and read the plan.
:::

### Removing Kubernetes

When Nodeau installed K3s, `--remove-managed-k3s` removes it. Nodeau also
**prints** the root commands that tidy up what a K3s removal can leave behind,
such as directories under `/run`, for you to read and run yourself.

:::warning Those commands are yours to run
They are printed for you to inspect, and Nodeau leaves running them to you. Read
them first: they are root commands on your own machine. `--dry-run` does not
print them.
:::

## macOS

A Mac runs standalone, so there is no fleet membership to remove and no other
machine to tell.

```bash
nodeau uninstall --dry-run
nodeau uninstall
```

It removes what `nodeau install` put there and leaves everything else. A model
runtime you assembled yourself, a `PATH` line you wrote, or a copy of `nodeau` you
manage yourself all stay, and the plan says so.

| Flag | What it does |
|---|---|
| `--dry-run` | Show what would be removed and stop |
| `--yes`, `-y` | Skip the confirmation |
| `--models` | Also delete downloaded model weights |
| `--keep-path` | Leave the `PATH` line in your login profile |
| `--state <path>` | Path to the install ledger |

Your downloaded models are **kept** unless you pass `--models`. Uninstalling the
software and throwing away gigabytes of downloads are two different decisions.

## Your account and your fleet

`nodeau uninstall` works on this machine only. Three things are separate steps,
each done where it belongs:

```bash
nodeau logout                       # unlink this machine, locally
nodeau fleet remove <machine>       # from the machine that runs the control plane
```

- **Unlinking** from your account: `nodeau logout` here, and remove the
  installation in your account at app.nodeau.ai to free its slot.
- **Leaving a fleet**: `nodeau fleet remove`, run from another machine, because a
  machine that is gone cannot remove itself. See
  [removing a machine](/docs/fleet/#removing-a-machine).
- **Your subscription**: managed from your account at app.nodeau.ai.

## What stays, on purpose

After a plain uninstall you still have:

- `~/.local/bin/nodeau` and `nodeau-fleet`, the binaries the bootstrap put in a
  directory you own. Delete them yourself whenever you like.
- `~/.config/nodeau/`: your API key, account link and entitlement.
- `/var/lib/nodeau/models/`: your downloaded weights.
- `/var/lib/nodeau/batch/`: your batch records.
- Your NVIDIA driver, Secure Boot configuration, bootloader and partitions,
  exactly as they were.

## Checking afterwards

```bash
nodeau doctor --host-only
```

On a machine Nodeau has been removed from, `NODEAU_NOT_INSTALLED` is the right
answer.
