---
title: Troubleshooting Nodeau
heading: Troubleshooting
nav: Troubleshooting
description: Fixes organised by what you are seeing: installation, NVIDIA, macOS, models, the API, fleets, upgrade plans and batch, each with how to confirm it.
lede: Organised by what you are seeing, with the fix first. Start with `nodeau doctor`, which is read-only and usually names the problem for you.
---

```bash
nodeau doctor
nodeau doctor --json     # the same, with codes, for a script
```

Every doctor code is listed under
[health and alerts](/docs/health/#doctor-codes), and every refusal code under
[how Nodeau decides](/docs/scheduling/#reason-codes).

---

## Installation {#installation}

### `nodeau: command not found` {#nodeau-command-not-found}

**Fix.** Put `~/.local/bin` on your `PATH`. On Linux:

```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

On a Mac the line belongs in **`~/.zprofile`**, because Terminal.app starts login
shells, and a line in `.zshrc` works by hand and then goes missing in a script,
an `ssh` command or a LaunchAgent:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zprofile
```

Open a **new** terminal window and it is there.

**Why.** The bootstrap installs into `~/.local/bin` on purpose: it is a directory
you own and needs no privilege. `ls -l ~/.local/bin/nodeau` confirms the binary is
there, and `nodeau doctor` reports this case as `NOT_ON_PATH`.

### The installer reports a checksum mismatch

**Fix.** Run it again. A mismatch is almost always an interrupted or truncated
download, and the installer refused to install it, which is exactly right.

If it happens twice, tell us at [founders@nodeau.ai](mailto:founders@nodeau.ai),
and keep to the verified path: an archive that failed its checksum is never worth
installing by hand.

### The install stopped partway through

**Fix.** Run `nodeau install` again. It re-checks everything, skips what is done,
and never re-decides who owns a component. The ownership ledger keeps track of
what it installed and what it adopted, so a resumed install picks up cleanly.

### `install.sh` stops with a message

| The message names | What to do |
|---|---|
| Running as root | Run it as yourself. It installs into a directory you own and calls no `sudo` |
| Windows Subsystem for Linux | Install on a native Linux machine or an Apple Silicon Mac. The GPU path through WSL is different, and it is on the [roadmap](/roadmap/) |
| An Intel Mac | Use an Apple Silicon (M-series) Mac, which runs models on its GPU through Metal |
| Neither `sha256sum` nor `shasum` | Install one of them, so the download can be verified |

Each message is specific because each one sends you somewhere different. Nothing
on your system has changed in any of these cases.

### `nodeau install` warns about my distribution

**What to expect.** Nodeau is developed and measured on Ubuntu 24.04 LTS, and its
pinned package versions are chosen for it. On another distribution it tells you
and carries on.

**If a package is missing.** The pinned NVIDIA Container Toolkit may not exist for
your distribution. `--skip-toolkit` and `--skip-k3s` let you provide those pieces
yourself.

### Disk space, or a filesystem Nodeau keeps clear of

**Fix.** Point the model cache at a native Linux filesystem with room to spare:

```bash
nodeau install --cache-dir <path>
```

**Why.** Nodeau keeps its state on native filesystems and treats any NTFS
partition, and every other partition on the same disk, as protected. On a
dual-boot machine that is what keeps Nodeau clear of the other operating system.
`nodeau environment` shows how each disk was classified, and `df -h /var/lib`
shows the room left.

### There is already a Kubernetes cluster here

**Nothing to fix.** Nodeau **adopts** it: it uses the cluster as it found it,
writes that down, and leaves it installed, configured and owned exactly as before.
That record is what makes uninstalling safe.

If you would rather Nodeau left Kubernetes to you entirely, use
`nodeau install --skip-k3s`.

---

## NVIDIA and the GPU

### `nvidia-smi` does not work

**Fix.** Install your distribution's NVIDIA driver, reboot if it asks, and check
that `nvidia-smi` prints a table of GPUs. Then run `nodeau install`.

With Secure Boot on, use your distribution's **pre-signed** kernel modules. A DKMS
build needs somebody at the physical keyboard to enrol a key at boot, on a machine
whose display may be driven by the very card that is about to need it.

**Why it is your step.** The driver decides whether your machine boots to a
desktop, so Nodeau leaves it to you and checks it rather than changing it.

### `nvidia-smi` works but Nodeau says the GPU is unavailable

**Fix.** Run `nodeau doctor`. If it reports the NVIDIA Container Toolkit missing,
`nodeau install` installs it. If the toolkit is present and no CDI specification
exists in `/etc/cdi` or `/var/run/cdi`, `nodeau install` generates one. By hand,
the equivalent is:

```bash
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
```

**Why.** The driver is fine and the container path is the missing link.

### `DEVICE_ALLOCATORS_OVERLAP`

**Fix.** Run `nodeau install` on that machine, which reconciles it, then
`nodeau doctor` to confirm.

**Why it matters.** The machine is serving GPU work through **both** the
count-based device plugin and per-device claims, and two allocators over the same
cards can hand out the same card twice. This one deserves prompt attention.

### `DEVICES_NOT_INDEPENDENT`

**Nothing to fix.** It is the normal state of a machine with more than one GPU
until it opts in to scheduling each card by name. Until then it allocates its
cards by count.

### `DEVICE_DRIVER_MISSING`

**Fix.** `nodeau install` on that machine installs the per-device driver. It is
also the repair for an installation made by an older release, before the driver
was part of every install.

**Why.** The machine is set to schedule each card by name, and nothing is offering
its GPUs yet.

### A card disappeared, or moved between machines

**What happens.** Nodeau believes the **newest** report of a card, and the machine
that lost it stops offering it. A workload whose placement names a card its
machine no longer reports is **withdrawn**, and its service is kept, so it starts
again when a placement is possible.

**Check it.**

```bash
nodeau fleet list
nodeau service explain <name>
```

### The hardware changed after install

**Fix.** Re-run `nodeau install`, then `nodeau doctor`. Until the machine's report
is fresh you will see `HARDWARE_REPORT_STALE`, and admission waits for a fresh
report on that machine before placing anything there.

---

## macOS {#macos}

### `nodeau` prints nothing and exits 137 {#on-a-mac-nodeau-prints-nothing-and-exits-137}

**Fix.** Clear the quarantine flag on **everything you extracted**, not only the
`nodeau` binary:

```bash
xattr -dr com.apple.quarantine /path/to/extracted/folder
```

`-d` deletes the attribute and `-r` applies it through the folder. The archive
also holds the model runtime, and clearing only the binary just moves the same
stop to the first time you serve a model.

**Easier still.** Install with the documented command, because `curl` never sets
the quarantine flag:

```bash
curl -fsSL https://get.nodeau.ai/install.sh | bash
```

**Why.** An archive downloaded **in a browser** is tagged as quarantined, and
Gatekeeper stops a binary that is not signed with an Apple Developer ID. From a
terminal there is no dialog: the process simply ends with signal 9, which shows
up as an empty line and exit code 137.

### A model that worked yesterday is refused today

**Fix.** Close something memory-hungry, or choose a smaller model or a smaller
context. To take the risk for one workload yourself,
`nodeau run --accept-estimate-risk` or `--spend-safety-reserve` do it explicitly,
and both are recorded.

**Why.** Apple Silicon uses **unified memory**: the system, your applications and
the GPU share one pool, so what fits depends on what else is running at that
moment. The refusal is Nodeau reading the machine correctly and keeping it clear
of an out-of-memory kill. See [unified memory](/docs/install-macos/#unified-memory).

### `RUNTIME_MISSING`, `RUNTIME_CORRUPT`, `RUNTIME_UNVERIFIED`, `RUNTIME_UNMANAGED`

Four codes, because each needs a different answer.

| Code | Means | Fix |
|---|---|---|
| `RUNTIME_MISSING` | No model runtime is installed yet | `nodeau install`: the macOS archive bundles one |
| `RUNTIME_CORRUPT` | The runtime's bytes no longer match the digests recorded at install | `nodeau install` reinstalls it. It verifies before it switches over, so the previous runtime keeps serving if anything goes wrong |
| `RUNTIME_UNVERIFIED` | Installed, and its integrity was **not checked on this run** | Run `nodeau doctor` again. "Not checked" and "intact" are different answers, so this is deliberately not a pass |
| `RUNTIME_UNMANAGED` | A runtime Nodeau did not install, so it carries no version, backend or digests | Fine for development. `nodeau install --runtime <path>` installs a managed one |

### Using a Mac alongside a fleet

A Mac runs Nodeau **standalone**, as its own private endpoint on the Mac, and
that is where it shines. Your Linux machines with NVIDIA GPUs form the fleet. The
two run happily side by side, each with its own endpoint and its own `nodeau`
commands. See [install on a Mac](/docs/install-macos/).

### `nodeau batch`, `health` or `governance` on a Mac

These are fleet commands, so on a Mac each one explains that and exits. Batch
jobs, machine health and organisation policies all run on the Linux machines in a
fleet.

### A macOS version we have not tried

Nodeau checks no macOS version number, and the installer leaves the choice to
you. Go ahead, and if something looks off, a report from a machine we have never
seen is the most useful thing we get.

---

## Models

### Nodeau refused to start my model

**Fix.** Ask for the reasoning, then change the one thing it names:

```bash
nodeau service explain <name>
```

It prints the whole calculation: what the card can address, what else is using
it, the safety reserve and what the model needs, plus a typed code and remedies.

| Code | Try |
|---|---|
| `GPU_TOO_SMALL` | A smaller context (`--context-size 2048`), a smaller model, or free the card |
| `GPU_ALREADY_ALLOCATED` | `nodeau ps` to see what holds it, then wait or stop it |
| `GPU_UNAVAILABLE` | `nodeau doctor`: no healthy GPU was reported |
| `HARDWARE_STALE` | Check the machine is reporting with `nodeau fleet list` |
| `MACHINE_DRAINING` | `nodeau scheduling undrain --node <machine>` |
| `ACCELERATOR_SET_UNSUPPORTED` | The **shape** of the request is the problem rather than memory: ask for a different set of cards |

**Good to know.** A refusal is the product doing its job: the alternative is a
model that loads, runs out of memory and crashes. Admission has no bypass. When
the only thing in the way is the extra margin for hardware nobody has measured,
`--accept-estimate-risk` removes **that margin alone**, and says so.

### It says there is no validated profile for my GPU

**Fix.** Either take the risk yourself with `--accept-estimate-risk`, or choose a
smaller configuration.

**Why.** Nodeau has no measurement for this model and configuration on hardware
like yours, so it computes a figure from the model's own shape, adds a further
margin, and labels the decision **estimated**. A guess that came out too low would
be an out-of-memory kill, so the estimate leans cautious.

### `MODEL_UNVERIFIED` or `MODEL_VERIFICATION_PENDING`

`MODEL_VERIFICATION_PENDING` clears by itself while a hash finishes.

`MODEL_UNVERIFIED` means the file is present and the right size, and its digest has
not been established yet. Only a verified copy can be placed against:

```bash
nodeau model verify <model>
nodeau model status
```

### `MODEL_ARTIFACT_INVALID` or `MODEL_CORRUPT`

**Fix.** Remove this machine's copy and fetch it again:

```bash
nodeau model remove <model>
nodeau model install <model>
```

**Why.** The file on disk is not what was pinned. A corrupted model can load,
serve fluent-looking answers and report healthy, which is why only a computed
SHA-256 counts. A file that failed verification during download was **moved
aside** rather than deleted, so the evidence is still there.

**Worth knowing.** If this keeps happening on one machine, suspect its storage or
memory rather than the download: comparing a buffered read with a direct read of
the same file is how this kind of fault is pinned down.

### Two `model install` runs for the same model

**Fix.** Run one install and let it finish.

**Why.** Two runs write to the same partial file and the result fails its
checksum. It fails safe, because the digest catches it and the bytes are
quarantined. The second run reports a missing temporary file rather than "another
install is already running", which reads oddly and is harmless.

### I imported different bytes under the same alias

Nodeau created a **new artifact and said so**; the alias now points at the new
bytes, and the old artifact is untouched. Qualification evidence belongs to the
bytes it was gathered on, so run it again for the new ones:

```bash
nodeau model qualify <alias>
```

### Chat passed and tool calling failed

That is `Partial`, and it is a first-class outcome: the model stays usable for
exactly what it proved. See [qualification outcomes](/docs/byom/#qualification).

### An imported model is `Unsupported`

**Your file is fine.** It is a valid GGUF for an architecture this build's runtime
does not implement, and a later Nodeau with a newer runtime may well run it.

### Nodeau cannot work out my imported model's memory requirement

The file declares no shape Nodeau can size. The artifact is imported and intact,
and admission holds off scheduling it rather than inventing a figure, because a
guess that is too low is an out-of-memory kill.

---

## The API

### The API rejects my key {#the-api-rejects-my-key}

Two causes, and the first is far more common.

**You opened the endpoint in a browser.** `http://127.0.0.1:8080/v1` is an API
rather than a web page, and a browser has no way to attach your key, so the server
correctly refuses. Use `curl`, or point an OpenAI-compatible client at
`http://127.0.0.1:8080/v1` with your key.

**Your key changed while the model was running.** The model server reads the key
once, when it starts:

```bash
nodeau auth token qwen-local     # the token this service will actually accept
nodeau auth publish qwen-local   # make your local key the one it enforces (restarts it)
nodeau restart qwen-local        # or simply restart it
```

`nodeau auth show` prints your **local** key, which is not automatically the key a
given service enforces. `nodeau auth token` checks, and refuses rather than
printing a key that would be rejected.

### `404 model_not_found`, `param: model`

**Fix.** Set `model` to what this endpoint serves, leave it out, or run the other
model to get its own endpoint on its own port.

**Why.** One Nodeau endpoint serves exactly one model, so a request naming a
different model is refused rather than answered by the wrong one.

### `404 model_not_found`, `param: path`

**Fix.** Send the request to an endpoint whose task answers that route, or run one:

```bash
nodeau run <model> --task chat --port 8083
```

**Why.** An endpoint answers the routes of its own task: an embedding workload
answers `/v1/embeddings`, and turns `/v1/chat/completions` away. The model server
underneath would have replied with fluent-looking nonsense, so Nodeau refuses the
request instead. See [embeddings, reranking, tools and vision](/docs/tasks/).

### The reply is empty, with `"finish_reason": "length"`

**Fix.** Raise `max_tokens`. When Nodeau chooses a budget itself it uses 2048, and
below 512 it tells you the budget is too small to be an answer.

**Why.** The model ran out of tokens while thinking. Several curated models reason
before they answer, and both come out of the same budget, so asking for a short
answer by asking for few tokens works backwards.

**Why Nodeau leaves your budget alone.** A client that asked for 160 tokens asked
for 160, and quietly raising it would make the `usage` block untrue. Nodeau names
a small budget and runs it anyway.

To print only the reply:

```bash
... | python3 -c 'import json,sys; print(json.load(sys.stdin)["choices"][0]["message"]["content"])'
```

### Port 8080 is already in use

**Fix.** Choose another port:

```bash
nodeau run qwen-local --port 8123
```

Nodeau checks the port **before** starting anything and names the port it found
taken, with a command to see what holds it:

```text
127.0.0.1:8080 is already in use by something on this machine.
Choose another port with --port, or find the holder with:
  ss -tlnp 'sport = :8080'
```

:::note Changing the port restarts the workload
`--port` sets the loopback port **and** the in-cluster service port, and the
service port is part of the workload's identity. Expect a short gap while the
weights reload.
:::

### The endpoint stopped after I logged out

**Fix.** Log back in and run `nodeau run <name>`. To keep the endpoint running
across logout and at boot on Linux:

```bash
sudo loginctl enable-linger "$USER"
```

**Why.** The endpoint runs as a **user** service, which stops when your session
ends. Lingering changes session behaviour for your whole account and usually needs
privilege, so Nodeau leaves that decision to you.

### `ENDPOINT_UPSTREAM_LOST`

The endpoint answers and cannot reach the model behind it. Check that the
workload is serving:

```bash
nodeau status
nodeau ps
nodeau logs <name>
```

### `ENDPOINT_ORPHANED`, `ENDPOINT_UNRECORDED`, `ENDPOINT_BINARY_REPLACED`

| Code | Means | Fix |
|---|---|---|
| `ENDPOINT_ORPHANED` | Endpoint units exist for workloads that are gone | Follow the remedy on the doctor line. Meanwhile the unit waits without holding a port |
| `ENDPOINT_UNRECORDED` | An endpoint is running that Nodeau has no record of, so `nodeau status` leaves it out | Run `nodeau run <name>` again, which adopts the running unit and its port |
| `ENDPOINT_BINARY_REPLACED` | It is running a program that has since been replaced on disk | Restart it with `nodeau run <name>`. A replaced file leaves a running process on the old copy |

### Checking the endpoint stays on this machine

```bash
ss -tlnp | grep nodeau
```

The address must be `127.0.0.1:<port>`. If you ever see `0.0.0.0`, please report
it straight away. `nodeau doctor` reports `NETWORK_EXPOSURE` when anything on the
machine makes a model reachable from off it.

---

## Fleets

### `nodeau fleet invite` says the machine limit is reached

**Fix.** Remove a machine you no longer use, or move to a larger plan and refresh:

```bash
nodeau fleet remove <machine>
nodeau plan refresh
```

**Good to know.** It checks **before creating anything**, so nothing was made and
every machine you have keeps working.

### `nodeau join` stops with a message

| Message | Fix |
|---|---|
| The invitation expired | Invitations last 15 minutes by design. Run `nodeau fleet invite` again |
| The code is damaged | It is one token, and a line break in the middle breaks it. Copy it again in one piece |
| Not a Nodeau enrollment code | Paste the code `nodeau fleet invite` printed |
| The code is version *N* and this Nodeau reads up to *M* | Update the joining machine first |
| The invitation names no address, or carries no credential | Mint a new invitation |
| This machine already runs a cluster | Use that cluster as it is, or remove it yourself first. Nodeau leaves it alone |
| A required program is missing | Install what the message names |

### A machine is offline

**What happens.** Nothing new is placed there. When the machine comes back it
reconnects on its own with the credential it already holds, so no new invitation
is needed.

```bash
nodeau fleet list
nodeau doctor --node <machine>
```

A workload on a machine that goes offline stops with it, and Nodeau keeps its
service so it can start again when a placement is possible. See
[how work stays put](/docs/fleet/).

### `nodeau fleet remove` asks me to stop workloads first

Workloads placed on the machine hold up removal, because a workload on a machine
you are about to delete is work somebody expects to be running.

```bash
nodeau ps -A                       # what is on it
nodeau stop <name> --workload      # stop each one
nodeau fleet remove <machine>
```

If the machine is already gone and those workloads can never come back, `--force`
removes it anyway.

### A model is missing on one machine

Each machine keeps its own model cache. Fetch the model there:

```bash
nodeau model install <model>       # on that machine
nodeau model status                # which machine holds what, verified or not
```

### The machines are on different versions

Nodeau's own components deliberately sit on different versions when one of them
did not change. What is worth acting on is **machines disagreeing with each
other**, which means an update reached some of them and not the rest:

```bash
nodeau update
```

### A machine is missing from the console

**Check the fleet first**, on the machine that runs the control plane:

```bash
nodeau fleet list       # is the machine in the fleet, and reporting?
nodeau fleet status     # is the fleet reporting to Nodeau Cloud?
```

- If `fleet list` does not show it, the machine has not joined, or it is offline.
  See [add and run machines](/docs/fleet/).
- If `fleet status` says **not connected**, run `nodeau login` and then
  `nodeau fleet connect`. The fleet reports as a whole from the control-plane
  machine, so a worker needs no connector of its own.
- If it says connected and the console still looks old, check that the connector
  is running with `systemctl --user status nodeau-fleet`, then run `nodeau doctor`
  for the codes below.

### `FLEET_NOT_REPORTING`, `FLEET_REPORT_STALE`, `FLEET_PROTOCOL_MISMATCH`

Warnings at most: inference carries on without Nodeau Cloud.

`FLEET_PROTOCOL_MISMATCH` is the one that needs a step from you: this build and
Nodeau Cloud cannot exchange fleet state, and **updating Nodeau fixes it**.

---

## Upgrade plans

### The plan holds a machine back

`nodeau fleet upgrade plan` explains each machine it holds back, in words, with a
code a script can read. Read the reason, then:

| Code | What it means | What to do |
|---|---|---|
| `NeverReported` | The machine has never reported which build it runs | Check it is online in `nodeau fleet list`, and give it a moment to report |
| `MachineStale` | Its last report is older than the planner will act on | Bring it back online, or plan with a wider `--max-report-age` |
| `MachineDraining` | It is draining for maintenance | Undrain it when you want it upgraded |
| `MachineUnhealthy` | It reports it is unhealthy | Run `nodeau doctor --node <machine>` and fix what it names |
| `WouldMoveBackwards` | It already runs a newer build than the target | Choose a newer target, or leave it where it is |
| `NoArtifactForPlatform` | The target publishes no build for that machine's platform | Choose a release that publishes one |
| `PlatformCannotJoinFleet` | It is a Mac, which runs standalone | Update it on the Mac itself |

See [planning a fleet upgrade](/docs/upgrades/) for the whole plan.

### The plan says no maintenance window is set

Read that line as **"not known on this machine"**. In this release the planner
works from what the machine you run it on knows, and organisation-wide settings
such as a maintenance window are not part of that. The plan's last line says so.

### Is my work waiting for a maintenance window?

No. Work you ask for runs straight away, inside or outside a window: running a
model, submitting a batch job, a placement you requested. A maintenance window
only governs what Nodeau would do **on its own** that could interrupt work, such as
recovering a workload automatically. See
[updates and release channels](/docs/updates/).

---

## Batch

### It refuses my file before uploading

| Message | Fix |
|---|---|
| "looks like a JSON array" | Nodeau reads **JSONL**: one JSON object per line, with no brackets and no commas between them |
| "line *N* is not valid JSON" | Fix that line |
| "no record … has a `custom_id`" | Give every record a `custom_id`, which is how each result is matched back to its request |
| "has no records in it" | The file is empty |

It also **notes** records with a small completion budget and submits them anyway,
because the budget in your record is your decision.

### The job is waiting to start

| Code | Means |
|---|---|
| `QUEUED` | Waiting for a card to free up. It starts by itself |
| `BATCH_QUOTA_EXHAUSTED` | Your organisation's batch allowance is spent. A colleague can raise it |
| `FEATURE_NOT_ENTITLED` | Batch comes with Home Pro and Business |

A batch job takes a whole GPU, exactly as a service does, and waits its turn for
one.

### Some workers are waiting

A worker count is a **request**. Workers that cannot get a card wait, and the job
still completes with the workers it has.

### `BATCH_WORKER_UNAVAILABLE`

The worker was placed and its container never started, so nothing ran:

```bash
nodeau logs <job>
nodeau doctor
```

A worker that cannot start lets go of its GPU: Nodeau suspends it, waits until
nothing holds the device, and only then records its final state.

### The job failed after running

`BATCH_FAILED` means an attempt failed for an infrastructure reason and no
attempts remain. `--max-attempts` counts attempts at the **whole job**, and each
retry starts from the beginning.

### I cancelled it and the GPU is still held

Nodeau waits for the model server to actually exit before releasing the card, so a
cancelled job takes a few seconds to finish stopping. Results already produced
are kept.

### The results seem to be missing a record

Every record you submitted has exactly one line in the results, in the order you
sent them. A result whose `custom_id` cannot be resolved is reported **by line
number** and says so, so it is never dropped or credited to the wrong request.

### A control-plane restart ended an attempt

A batch worker fetches its records from the control plane, and it retries for two
minutes if the control plane is away. A control plane down for longer than that
fails the attempt, and a remaining attempt starts the job again. Serving models
are unaffected: their traffic never passes through the control plane.

---

## Still stuck

```bash
nodeau doctor --json > doctor.json
nodeau support bundle
```

Then [contact us](/contact/?type=install) or email
[founders@nodeau.ai](mailto:founders@nodeau.ai). The bundle contains no keys, no
credentials, no prompts and no model output, and it is a plain `.tar.gz` you can
open first; see [support bundles](/docs/support/).
