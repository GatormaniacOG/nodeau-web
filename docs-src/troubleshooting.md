---
title: Troubleshooting Nodeau
heading: Troubleshooting
nav: Troubleshooting
description: Symptom-based fixes for installation, NVIDIA, macOS, models, the API, fleets and batch — each with how to confirm it and what not to do.
lede: Organised by what you are seeing. Start with `nodeau doctor` — it is read-only, and it usually names the problem directly.
---

```bash
nodeau doctor
nodeau doctor --json     # the same, with codes, for a script
```

Every doctor code is listed under
[health and diagnostics](/docs/health/#doctor-codes), and every refusal code under
[admission](/docs/scheduling/#reason-codes).

---

## Installation {#installation}

### `nodeau: command not found` {#nodeau-command-not-found}

**Why.** `~/.local/bin` is not on your `PATH`. The bootstrap installs there
deliberately, because it is a directory you own and needs no privilege.

**Confirm.**

```bash
ls -l ~/.local/bin/nodeau
```

**Resolve.** On Linux:

```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

On macOS it is **`~/.zprofile`**, not `~/.zshrc`. Terminal.app runs login shells,
so a line in `.zshrc` works by hand and fails in a script, an `ssh` command or a
LaunchAgent.

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile
```

It takes effect in a **new** terminal window. `nodeau doctor` reports this as
`NOT_ON_PATH`.

### The installer says the checksum does not match

**Why.** Usually an interrupted or truncated download.

**Resolve.** Run it again. It refused to install, which is correct.

**What not to do.** Do not work around it, and do not install an archive that
failed verification. If it repeats, report it —
[founders@nodeau.ai](mailto:founders@nodeau.ai).

### The install stopped partway through

**Resolve.** Run `nodeau install` again. It re-checks everything, skips what is
done, and never re-decides who owns a component. The ownership ledger records what
happened, so a resumed install does not lose track of what it installed versus
what it adopted.

### `install.sh` refuses to run

| Message names | Why |
|---|---|
| Running as root | The bootstrap installs into a directory you own and calls no `sudo`. Run it as yourself |
| Windows Subsystem for Linux | The GPU path through WSL is genuinely different and untested. Native Linux is supported |
| An Intel Mac | Metal execution needs an M-series chip |
| Neither `sha256sum` nor `shasum` | Nodeau will not install a binary it cannot verify |

Each refusal is specific rather than a generic "unsupported platform", because
they send you to very different places. Nothing is changed on your system in any
of these cases.

### `nodeau install` warns about my distribution

**Why.** Nodeau is developed and measured on Ubuntu 24.04 LTS, and the pinned
package versions are chosen for it. Another distribution is a **warning, not a
refusal** — Nodeau tells you and continues.

**What to expect.** The pinned NVIDIA Container Toolkit package may not exist for
your distribution. `--skip-toolkit` and `--skip-k3s` let you provide those
yourself.

### Not enough disk, or an unsupported filesystem

**Why.** Nodeau refuses to put state on NTFS or a filesystem it cannot identify,
and treats any NTFS partition — and every sibling partition on its disk — as
protected.

**Confirm.**

```bash
nodeau environment        # the disk classification, read-only
df -h /var/lib
```

**Resolve.** Point the cache at a native filesystem with
`nodeau install --cache-dir <path>`.

### There is already a Kubernetes cluster here

Nodeau **adopts** it: it uses it as found, writes that down, will not install K3s
alongside it, will not reconfigure it, and will never delete it. That record is
what makes uninstall safe.

If you would rather Nodeau did not touch Kubernetes at all,
`nodeau install --skip-k3s`.

---

## NVIDIA and the GPU

### `nvidia-smi` does not work

**Why.** The driver is not installed or not loaded. This is outside Nodeau: it
will never install, upgrade, replace or remove your driver, because that decision
affects whether your machine boots to a desktop.

**Resolve.** Install your distribution's NVIDIA driver, reboot if it asks, and
confirm `nvidia-smi` prints a table before running `nodeau install`.

On a machine with Secure Boot enabled, use your distribution's **pre-signed**
modules rather than DKMS — a DKMS build needs somebody at the physical keyboard to
enrol a key at boot, on a machine whose only display may be driven by the card
that is about to stop working.

### `nvidia-smi` works but Nodeau says the GPU is unavailable

**Why.** The driver is fine and the container path is not.

**Confirm.**

```bash
nodeau doctor
```

**Resolve.** If doctor reports the NVIDIA Container Toolkit missing,
`nodeau install` installs it. If the toolkit is present but no CDI specification
exists in `/etc/cdi` or `/var/run/cdi`, a container cannot claim the GPU;
`nodeau install` generates one. The equivalent by hand is:

```bash
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
```

### `DEVICE_ALLOCATORS_OVERLAP`

**Why.** The machine is serving GPU work through **both** the count-based device
plugin and per-device claims. Two independent allocators over the same cards can
both hand out the same card.

**Resolve.** This one is a genuine fault. Run `nodeau install` on that machine,
which reconciles it, then `nodeau doctor` to confirm.

### `DEVICES_NOT_INDEPENDENT`

**Not a fault.** It is the state every machine is in until it opts in to
per-device scheduling. It means the machine has more than one GPU and allocates
them by count rather than by name.

### `DEVICE_DRIVER_MISSING`

**Why.** A machine is switched to per-device scheduling and nothing is offering
its GPUs.

**Resolve.** `nodeau install` on that machine installs the per-device driver. This
is also the repair for an installation made by a release older than the one that
began installing it.

### A card disappeared, or moved between machines

**What Nodeau does.** It believes the **newest** report of a card. The machine that
lost it stops offering it. A workload whose placement names a card its machine no
longer reports is **withdrawn**, and its service is kept so it can start again when
a placement is possible.

**What Nodeau does not do.** It does not move the workload to another machine.
There is no failover.

**Confirm.**

```bash
nodeau fleet list
nodeau service explain <name>
```

### The hardware changed after install

**Resolve.** Re-run `nodeau install`, then `nodeau doctor`. A stale hardware report
shows as `HARDWARE_REPORT_STALE` and admission fails closed for that machine until
it is fresh — which is the safe direction.

---

## macOS {#macos}

### `nodeau` prints nothing and exits 137 {#on-a-mac-nodeau-prints-nothing-and-exits-137}

**Why.** You downloaded the archive **in a browser**. macOS tags anything a
browser saves as quarantined, and because Nodeau is not signed with an Apple
Developer ID, Gatekeeper refuses to run it. From a terminal there is no dialog and
no error message — the process is killed with signal 9, so you get an empty line
and exit code 137.

**Resolve.** Clear the flag on **everything you extracted**, not just the `nodeau`
binary. The archive also contains the model runtime, and those files are
quarantined too — clearing only the one file moves the same failure to the moment
you first serve a model.

```bash
xattr -dr com.apple.quarantine /path/to/extracted/folder
```

`-d` deletes the attribute and `-r` applies it through the folder.

**What not to do.** Do not clear only the binary.

**Better.** The documented install does not have this problem: `curl` does not set
the quarantine flag.

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
```

### A model that worked yesterday is refused today

**Why.** Apple Silicon uses **unified memory**: the system, your applications and
the GPU share one pool. Whether a model fits depends on what else is running, and
it changes between one attempt and the next.

**This is Nodeau reading the machine correctly.** A refusal is the product
working — the alternative is an out-of-memory kill on a machine whose display is
driven by the same GPU.

**Resolve.** Close something, or run a smaller model or a smaller context. If you
want to accept the risk for one workload, `nodeau run --accept-estimate-risk` or
`--spend-safety-reserve`, both explicit and both recorded.

### `RUNTIME_MISSING`, `RUNTIME_CORRUPT`, `RUNTIME_UNVERIFIED`, `RUNTIME_UNMANAGED`

Four separate codes because they need different answers.

| Code | Means | Resolve |
|---|---|---|
| `RUNTIME_MISSING` | No model runtime is installed, so nothing can be executed | `nodeau install` — the macOS archive bundles one |
| `RUNTIME_CORRUPT` | The installed runtime's bytes no longer match the digests recorded when it was installed | `nodeau install` reinstalls it. Installing is verify-then-promote, so a failed install leaves the previous runtime serving |
| `RUNTIME_UNVERIFIED` | Installed, and its integrity **was not checked on this run**. Deliberately not a pass — "was not checked" and "is intact" are different claims | Run `nodeau doctor` again |
| `RUNTIME_UNMANAGED` | A runtime Nodeau did not install, so it has no version, no backend and no digests | Fine for development. `nodeau install --runtime <path>` installs a managed one |

### My Mac will not join the fleet

It cannot, by design. A Mac is a **native execution plane**, not a Kubernetes node.
It runs standalone, and Nodeau will not register it as something nothing can be
scheduled onto. See [what a Mac can and cannot do](/docs/install-macos/#what-a-mac-can-and-cannot-do).

### `nodeau batch`, `health` or `governance` refuses on my Mac

Expected. Those are fleet capabilities that read the cluster datastore, and they
refuse by name rather than failing obscurely. Batch inference is **absent** on
darwin rather than untested.

### An untested macOS version

Nodeau checks no macOS version number anywhere, and the installer does not branch
on one. Untested is not unsupported — the choice is left to you, and a report from
a machine we have never seen is the most useful thing we get.

---

## Models

### Nodeau refuses to run my model

**That is the product working.** Nodeau predicts peak VRAM before scheduling and
refuses what will not fit rather than letting it crash-loop.

**Confirm.**

```bash
nodeau service explain <name>
```

That prints the whole calculation: what the card can address, what else is using
it, the safety reserve, and what the model needs — plus a typed code and remedies.

**Resolve**, depending on the code:

| Code | Try |
|---|---|
| `GPU_TOO_SMALL` | A smaller context (`--context-size 2048`), a smaller model, or free the card |
| `GPU_ALREADY_ALLOCATED` | `nodeau ps` to see what holds it, then wait or stop it |
| `GPU_UNAVAILABLE` | `nodeau doctor` — no healthy GPU was reported at all |
| `HARDWARE_STALE` | Check the machine is reporting: `nodeau fleet list` |
| `MACHINE_DRAINING` | `nodeau scheduling undrain --node <machine>` |
| `ACCELERATOR_SET_UNSUPPORTED` | The **shape** of the request cannot be run. Not a memory problem — ask for a different set of cards |

**What not to do.** There is no `--force`, and admission cannot be bypassed. If
the only obstacle is the unmeasured-hardware margin, `--accept-estimate-risk`
removes **that margin only**, and says so.

### It says there is no validated profile for my GPU

**Why.** Nodeau has no measurement for this model, this configuration and hardware
like yours, so it computes a figure and adds a further margin — and labels the
decision **estimated**.

That is a limitation, not a failure. Nodeau will not invent numbers for hardware
nobody has measured, because a guess that is too low is an out-of-memory kill.

**Resolve.** `--accept-estimate-risk` if you want to take that risk yourself, or a
smaller configuration.

### `MODEL_UNVERIFIED` or `MODEL_VERIFICATION_PENDING`

`MODEL_VERIFICATION_PENDING` clears by itself — a hash is in progress.

`MODEL_UNVERIFIED` means the file is present, the right size, and its digest has
not been established. Only a verified copy can be placed against.

```bash
nodeau model verify <model>
nodeau model status
```

### `MODEL_ARTIFACT_INVALID` or `MODEL_CORRUPT`

**Why.** The file on disk is not what was pinned. Presence is not integrity — a
corrupted model loads, serves fluent-looking answers and reports healthy, which is
why only a computed SHA-256 counts.

**Resolve.**

```bash
nodeau model remove <model>
nodeau model install <model>
```

A file that failed verification during download was **moved aside** rather than
deleted, so the evidence survives.

**Worth knowing.** If this keeps happening on one machine, suspect its storage or
memory rather than the download. Comparing a buffered read with a direct read of
the same file is how this class of fault is localised.

### Two `model install` runs for the same model

**Why.** Both resolve the same partial file and write to it, and the download is
corrupted.

**It fails safe**: the digest catches it and the bytes are quarantined. The loser
reports a missing temporary file rather than "another install is already running",
which is confusing but harmless.

**Resolve.** Run it once and wait. A slow install and an impatient retry is an
ordinary thing to do, and this is a known rough edge.

### I imported different bytes under the same alias

Nodeau created a **new artifact and said so**. It never silently repoints the old
one. The previous qualification evidence no longer applies and is not carried
across, because it was evidence about different bytes.

Run `nodeau model qualify <alias>` again.

### Chat passed and tool calling failed

That is `Partial`, and it is a **first-class outcome**. The model stays usable for
exactly what it proved. Nodeau will not claim a capability an imported model has
not demonstrated. See [qualification outcomes](/docs/byom/#outcomes).

### An imported model is `Unsupported`

**Your file is fine.** It is a valid GGUF for an architecture this build's runtime
does not implement. A later Nodeau with a newer runtime may well run it.

### Nodeau cannot work out my imported model's memory requirement

The file declares no shape Nodeau can size. The artifact is imported and intact,
and **admission will refuse to schedule it rather than invent a figure** — because
a guess that is too low is an out-of-memory kill.

---

## The API

### The API rejects my key {#the-api-rejects-my-key}

Two causes, and the first is much more common.

**You opened the endpoint in a browser.** `http://127.0.0.1:8080/v1` is an API,
not a web page. A browser cannot attach your key, so the server correctly refuses.
Use `curl`, or point an OpenAI-compatible client at
`http://127.0.0.1:8080/v1` with your key.

**Your key changed while the model was running.** The model server reads the key
once, when it starts.

```bash
nodeau auth token qwen-local     # the token this service will actually accept
nodeau auth publish qwen-local   # make your local key the one it enforces (restarts it)
nodeau restart qwen-local        # or just restart it
```

`nodeau auth show` prints your **local** key, which is not automatically the key a
given service enforces. `nodeau auth token` checks, and refuses rather than
printing one that would be rejected.

### `404 model_not_found`, `param: model`

The request named a different model than this endpoint serves. One Nodeau endpoint
serves exactly one model, so the request was refused rather than answered by a
different one.

Set `model` to what this endpoint serves, omit it, or run the other model to get
its own endpoint on its own port.

### `404 model_not_found`, `param: path`

This endpoint's **task** does not answer that route. An embedding workload does not
answer `/v1/chat/completions`.

The model server underneath would have replied with fluent-looking nonsense rather
than an error, so Nodeau refused it instead.

```bash
nodeau run <model> --task chat --port 8083
```

### The reply is empty, with `"finish_reason": "length"`

**Why.** The model ran out of tokens while thinking. Several curated models reason
before they answer, and both come out of the same budget — so asking for a short
answer by asking for few tokens is exactly backwards.

**Resolve.** Raise `max_tokens`. Nodeau's own default when Nodeau chooses is 2048;
below 512 it will tell you the budget is too small to be an answer.

**Why Nodeau does not just fix it.** A client that asked for 160 asked for 160, and
silently raising it would make the `usage` block a lie. Nodeau names an inadequate
budget and runs it anyway.

To see only the reply:

```bash
... | python3 -c 'import json,sys; print(json.load(sys.stdin)["choices"][0]["message"]["content"])'
```

### Port 8080 is already in use

**What happens.** Nodeau checks the port **before** installing anything and refuses
with the port named, rather than letting the failure arrive later from the service
manager.

```text
127.0.0.1:8080 is already in use by something on this machine.
Choose another port with --port, or find the holder with:
  ss -tlnp 'sport = :8080'
```

**Resolve.**

```bash
nodeau run qwen-local --port 8123
```

:::note Changing the port restarts the workload
`--port` sets the loopback port **and** the in-cluster service port, and the
service port is part of the workload's identity. Expect a short gap while the
weights reload.
:::

### The endpoint disappeared after I logged out

**Expected.** The endpoint runs as a **user** service, which stops when your
session ends. Log back in and `nodeau run <name>`.

To keep it running across logout and at boot, on Linux:

```bash
sudo loginctl enable-linger "$USER"
```

Nodeau does not do this for you: it changes session semantics for the whole
account and usually needs privilege.

### `ENDPOINT_UPSTREAM_LOST`

The endpoint answers and cannot reach the model behind it.

```bash
nodeau status        # is the workload serving?
nodeau ps
nodeau logs <name>
```

### `ENDPOINT_ORPHANED` / `ENDPOINT_UNRECORDED` / `ENDPOINT_BINARY_REPLACED`

| Code | Means | Resolve |
|---|---|---|
| `ENDPOINT_ORPHANED` | Endpoint units exist for workloads that do not | The doctor line names the remedy; it waits holding no port |
| `ENDPOINT_UNRECORDED` | An endpoint is running and Nodeau has no record of it, so `nodeau status` does not list it | Re-run `nodeau run <name>`, which adopts a running unit's port |
| `ENDPOINT_BINARY_REPLACED` | It is running a program that has since been replaced on disk | Restart it. A replaced file is not a replaced process |

### Checking the endpoint is not exposed to my network

```bash
ss -tlnp | grep nodeau
```

The address must be `127.0.0.1:<port>`. If you ever see `0.0.0.0`, that is worth
reporting immediately. `nodeau doctor` reports `NETWORK_EXPOSURE` if anything on
the machine makes a model reachable from off it.

---

## Fleets

### `nodeau fleet invite` refuses

**Why.** Your plan's machine limit is reached. It refuses **before minting
anything**: *"this installation cannot add another machine … Nothing has been
created, and every machine you already have keeps working."*

**Resolve.** Remove a machine you no longer use
(`nodeau fleet remove <machine>`), or change plan and `nodeau plan refresh`.

### `nodeau join` refuses

| Message | Why | Resolve |
|---|---|---|
| The invitation expired | Invitations last 15 minutes by design | Mint a new one |
| The code is damaged | It is one token; a line break in the middle breaks it | Copy it again in one piece |
| Not a Nodeau enrollment code | Refused by shape | Check what you pasted |
| The code is version *N* and this Nodeau reads up to *M* | The machines are on different releases | Update the joining machine |
| The invitation names no address, or carries no credential | It cannot work | Mint a new one |
| This machine already runs a cluster | Nodeau will not destroy it | Remove it yourself, or use that cluster |
| A required program is missing | Refused up front rather than at step four | Install what it names |

### A machine is offline

Work already on it keeps running until the machine goes; nothing new is placed
there. **Nodeau does not move it.**

When the machine comes back it reconnects on its own — **no new invitation is
needed**. Reconnection is authenticated by the machine's own stored credential.

```bash
nodeau fleet list
nodeau doctor --node <machine>
```

### `nodeau fleet remove` refuses

Workloads placed on the machine block removal, because a workload on a machine you
are about to delete is work somebody expects to still be running.

```bash
nodeau ps -A                       # what is on it
nodeau stop <name> --workload      # stop each one
nodeau fleet remove <machine>
```

Or `--force`, if the machine is already gone and they can never come back.

### A model is missing on one machine

Nodeau does not replicate weights between machines. Download it there:

```bash
nodeau model install <model>       # on that machine
nodeau model status                # which machine holds what, verified or not
```

### The machines are on different versions

Nodeau's own components deliberately sit on different versions when one of them
did not change. What is worth acting on is **machines disagreeing with each
other**, which means an update reached some of them and not the rest.

```bash
nodeau update
```

### `FLEET_NOT_REPORTING`, `FLEET_REPORT_STALE`, `FLEET_PROTOCOL_MISMATCH`

All are warnings at worst — a Nodeau Cloud outage costs you nothing, and inference
does not depend on it.

`FLEET_PROTOCOL_MISMATCH` is the one that needs action: this build and Nodeau
Cloud cannot exchange fleet state, and **an update fixes it while a network never
will**.

---

## Batch

### It refuses my file before uploading

| Message | Why |
|---|---|
| "looks like a JSON array" | Nodeau reads **JSONL**: one JSON object per line, no brackets, no commas between them |
| "line *N* is not valid JSON" | Exactly that |
| "no record … has a `custom_id`" | Every record needs one — it is how each result is matched back to its request |
| "has no records in it" | The file is empty |

It also **notes** records with a small completion budget without refusing them.
That is advice: the budget in your record is your decision.

### The job sits without starting

| Code | Means |
|---|---|
| `QUEUED` | Correct, and waiting for a card to free. **Not a failure** — it starts by itself |
| `BATCH_QUOTA_EXHAUSTED` | Your organisation's batch allowance is spent. Ask a colleague, not a plan |
| `FEATURE_NOT_ENTITLED` | Batch needs Home Pro or Business |

A batch job takes a whole GPU, exactly as a service does. Nothing is preempted to
make room.

### Workers are waiting

A worker count is a **request**. Workers that cannot get a card wait, and the job
still completes with the workers it got.

### `BATCH_WORKER_UNAVAILABLE`

The worker was placed and its container never started, so nothing ran and there is
nothing to read.

```bash
nodeau logs <job>
nodeau doctor
```

A worker that cannot start does **not** hold its GPU indefinitely: Nodeau
suspends, waits until nothing holds the device, and only then goes terminal.

### The job failed after running

`BATCH_FAILED` — an attempt failed for an infrastructure reason and no attempts
remain. `--max-attempts` is attempts at the **whole job**, and a retry starts from
the beginning: this version does not resume a partial batch.

### I cancelled it and the GPU is still held

Nodeau waits for the model server to actually exit before releasing the card, so a
cancelled job takes a few seconds to finish stopping. Results already produced are
kept.

### The results are missing a record

Every record you submitted has exactly one line in the results, in the order you
sent them. A result whose `custom_id` cannot be resolved is reported **by line
number** and says so, rather than being dropped or attributed to the wrong request.

### A control plane restart killed an in-flight attempt

The batch content endpoint lives inside the controller, and the runner retries the
transport for two minutes. A control plane down for longer than that fails the
attempt. No inference traffic crosses that boundary, but a batch worker depends on
control-plane availability in a way a serving model does not.

---

## Still stuck

```bash
nodeau doctor --json > doctor.json
nodeau support bundle
```

Then [contact us](/contact/?type=install) or email
[founders@nodeau.ai](mailto:founders@nodeau.ai). The bundle contains no keys, no
credentials, no prompts and no model output, and it is a plain `.tar.gz` — see
[support bundles](/docs/support/).
