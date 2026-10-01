---
title: Nodeau CLI reference
heading: CLI reference
nav: CLI reference
description: Every public Nodeau command and subcommand, with its syntax, platform, plan, flags, examples and the exit codes it can return.
lede: Every public command in the published build, with its flags, the platform it runs on, and what it tells you when it says no. Every flag here was read from the released binary.
---

## How to read this

```bash
nodeau <command> [arguments] [flags]
nodeau <command> --help        # always current, for the binary you have
```

A few conventions run through the whole page:

- **Platform.** `Linux` means Linux with an NVIDIA GPU. `macOS` means an Apple
  Silicon Mac. `Both` means the command works on either.
- **Plan.** Mentioned only where a plan actually decides something. Most
  commands need no account at all.
- Arguments in `UPPER CASE` are required, and `[BRACKETS]` are optional.

### Namespaces

Workload commands take `--namespace` or `-n`, and the default is
**`nodeau-dev`**. Unless you've created others, it's the only one you'll ever
use. Where it's offered, `-A` or `--all-namespaces` looks across all of them.

### Exit codes {#exit-codes}

There are five, on purpose. A script needs three answers without reading any
text: did it work, was it called wrongly, and is it worth trying again?

| Code | Name | Meaning |
|---|---|---|
| `0` | OK | It worked |
| `1` | Error | Nodeau itself failed, or something unexpected did |
| `2` | Usage | The command was called wrongly: an unknown flag, a missing argument, an unknown model id. Fix the command, not the machine |
| `3` | Refused | Nodeau considered the request and said no, and that answer stays the same until something changes |
| `4` | Not ready | The answer is "not yet": still starting, queued, or a wait that ran out of time |

The difference between `3` and `4` is the one that matters most. **A script
that retries should retry on `4` and never on `3`.**

Two commands use a narrower contract of their own. `nodeau doctor` returns `0`
when everything passed or only warnings came back, `1` when something failed,
and `2` when it was called wrongly. `nodeau batch wait` returns `0` when the job
finished and `1` when it failed, was cancelled or the wait timed out.

### `--json` {#json}

**Every command that prints a table also takes `--json`**, and commands that
only perform an action generally don't.

The JSON is a contract. Field names are part of the CLI's interface, and reason
codes inside it keep their names. Use it rather than parsing the human output,
which is written for people and will keep getting better.

`--json` never implies consent. A command that would change the machine still
asks, or tells you to pass `--yes`.

---

## Setting up

### `nodeau install` {#nodeau-install}

```bash
nodeau install [flags]
```

Check the machine, show a plan, and set up what's missing. **Both**, with a
different body on each platform: see [Linux](/docs/install-linux/) and
[macOS](/docs/install-macos/).

On Linux it installs, when they're absent, the NVIDIA Container Toolkit, K3s,
the NVIDIA device plugin, the per-device GPU driver and Nodeau's own control
plane. When they're already there it **adopts** them, uses them exactly as it
found them, and writes that down. That record is what makes uninstalling safe.

Your NVIDIA driver, Secure Boot, the bootloader, the kernel command line, your
partitions and any Kubernetes cluster Nodeau didn't create all stay exactly as
they are.

Running it again is safe. It re-checks everything, skips what's done, keeps your
API key, and never re-decides who owns a component.

| Flag | Platform | Default | Meaning |
|---|---|---|---|
| `--dry-run` | Both | off | Show the plan, including every command, and stop |
| `--yes`, `-y` | Both | off | Skip the confirmation |
| `--state <path>` | Both | `/var/lib/nodeau/install-state.json` on Linux | Path to the install ledger |
| `--verbose`, `-v` | Linux | off | The full technical plan instead of the plain-language summary |
| `--server-dry-run` | Linux | off | Send every manifest to the Kubernetes API server for full validation, then discard it |
| `--print-manifests` | Linux | off | Print every manifest compiled into this binary and exit, changing nothing |
| `--lifecycle-prepare` | Linux | off | Used by `nodeau fleet upgrade`: apply only what a rollout needs before its first machine (this release's resources, and its DaemonSets set to update one machine at a time) and restart nothing |
| `--skip-k3s` | Linux | off | Leave Kubernetes to you; use this when you'll provide a cluster yourself |
| `--skip-toolkit` | Linux | off | Leave the NVIDIA Container Toolkit to you |
| `--cache-dir <path>` | Linux | `/var/lib/nodeau/models` | Model cache directory |
| `--channel <name>` | Linux | `beta` | Release channel to record for this installation |
| `--scheduling-mode <m>` | Linux | balanced | `efficiency`, `balanced`, `performance`, or `legacy` for the older tightest-fit scorer |
| `--scheduling-selection` | Linux | `true` | Let the mode choose placements; `false` records what it would have chosen and changes nothing |
| `--controller-image <ref>` | Linux | the release's | Override the controller image |
| `--agent-image <ref>` | Linux | the release's | Override the node agent image |
| `--batch-runner-image <ref>` | Linux | the release's | Override the batch runner image |
| `--runtime <path>` | macOS | bundled | A prepared model runtime: a directory or a `.tar.gz` |
| `--skip-path` | macOS | off | Leave your shell `PATH` as it is |
| `--skip-binary` | macOS | off | Keep the Nodeau binary where it is instead of copying it into Nodeau's own directory |
| `--json` | macOS | off | Machine-readable output |

**When it stops.** A blocking preflight check exits `3` and names the check. On
Linux, a missing or broken NVIDIA driver stops the install so you can fix it
your way first. With no terminal attached and no `--yes`, it asks for `--yes`
rather than acting unasked.

### `nodeau join` {#nodeau-join}

```bash
nodeau join CODE [flags]
```

Add this machine to an existing fleet as a worker. **Linux.**

Get the code from the machine that already runs Nodeau with
[`nodeau fleet invite`](#nodeau-fleet-invite), which checks your plan's machine
limit before it creates one. This machine needs an NVIDIA GPU with a working
driver, and it has to be able to reach the other machine on your network. If it
already runs a cluster of its own, Nodeau stops and tells you, and your cluster
stays as it is.

| Flag | Default | Meaning |
|---|---|---|
| `--dry-run` | off | Show what would happen and change nothing |
| `--verbose` | off | Print every command that would run |
| `--yes`, `-y` | off | Skip the confirmation |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Where this machine keeps model files |

A Mac runs Nodeau standalone, so this one is for Linux machines. See
[add and run machines](/docs/fleet/).

### `nodeau doctor` {#nodeau-doctor}

```bash
nodeau doctor [flags]
```

Diagnose this installation and explain anything that needs attention. **Both.**
Every check only reads. Doctor never installs, configures, mounts, starts or
stops anything.

It looks at two things. The **host**: can this machine run Nodeau at all? And
the **installation**: is Nodeau itself working? That covers its control plane,
the agent on each machine, whether each machine's GPU report is fresh enough to
schedule against, whether the models on disk still verify, and what your
services and batch jobs are doing.

| Flag | Default | Meaning |
|---|---|---|
| `--json` | off | Every result with its code, explanation and remedy, in a stable shape |
| `--host-only` | off | Check this machine only, without contacting the cluster |
| `--node <name>` | all | Report on one machine, plus the checks that cover the whole installation |
| `--namespace`, `-n` | `nodeau-dev` | Namespace your workloads are in |

Exit `0` when everything passed or only warnings came back, `1` when something
failed, `2` when it was called wrongly. Every code is listed under
[health and alerts](/docs/health/#doctor-codes).

### `nodeau environment` {#nodeau-environment}

```bash
nodeau environment [--json]        # alias: nodeau env
```

Print what Nodeau has detected about this machine: operating system, processor,
memory, GPUs, network, and which disks Nodeau may write to and which belong to
another operating system. **Both.** It only reads.

### `nodeau version` {#nodeau-version}

```bash
nodeau version [--json]
```

The build identity of this binary: version, commit, build date, channel, Go
version and platform. **Both.**

### `nodeau update` {#nodeau-update}

```bash
nodeau update [flags]
```

Compare this machine's Nodeau with the published release channel. **Both.** By
default it only looks.

| Flag | Default | Meaning |
|---|---|---|
| `--download` | off | Also fetch the new build and check it against the published checksum, keeping it only if it matches |
| `--channel <name>` | this build's | Which channel to check |
| `--base-url <url>` | `https://get.nodeau.ai` | Where releases are published |
| `--json` | off | Machine-readable |

If a cluster is reachable it also shows what each machine in your fleet is
running. Nodeau updates only when you ask it to, and a machine that can't reach
the internet keeps working exactly as it is. See
[updates and release channels](/docs/updates/).

### `nodeau uninstall` {#nodeau-uninstall}

```bash
nodeau uninstall [flags]
```

Remove Nodeau's own components and keep everything Nodeau didn't install.
**Both.** The whole plan is printed before anything happens, and every option
that deletes something is named for exactly what it deletes. See
[uninstalling](/docs/uninstall/).

| Flag | Platform | Meaning |
|---|---|---|
| `--dry-run` | Both | Print the plan and stop |
| `--yes`, `-y` | Both | Skip the confirmation |
| `--state <path>` | Both | Path to the install ledger |
| `--namespace`, `-n` | Linux | Namespace Nodeau's workloads live in |
| `--remove-models` | Linux | Also delete downloaded model weights |
| `--remove-batch-data` | Linux | Delete every batch job's input records and results. **These exist nowhere else** |
| `--remove-managed-k3s` | Linux | Also remove K3s, and only if Nodeau installed it |
| `--remove-toolkit` | Linux | Also remove the NVIDIA Container Toolkit, and only if Nodeau installed it |
| `--purge` | Linux | Every removal option above at once |
| `--models` | macOS | Also delete downloaded model weights |
| `--keep-path` | macOS | Leave the `PATH` line in your login profile |

Each flag says what it removes. There's no vague "remove more" switch.

---

## Running models

### `nodeau quickstart` {#nodeau-quickstart}

```bash
nodeau quickstart [flags]
```

Download a model, start it, and print a `curl` command that works. **Linux.**
Everything it does is one of the other commands, stitched together. See
[your first model](/docs/quickstart/). On a Mac, [`nodeau run`](#nodeau-run)
does the same job.

| Flag | Default | Meaning |
|---|---|---|
| `--model <id>` | `qwen3.5-4b-q4km` | Model to install and serve |
| `--name <name>` | `qwen-local` | Name for the workload |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |
| `--context-size <n>` | `4096` | Context window |
| `--parallel <n>` | `1` | Concurrent sequences |
| `--port <n>` | `8080` | Loopback port for the endpoint |
| `--timeout <d>` | `10m` | How long to wait for it to become Ready |
| `--consent` | off | Agree to the download without being asked |
| `--yes`, `-y` | off | Answer every question with yes |

### `nodeau run` {#nodeau-run}

```bash
nodeau run MODEL|SERVICE [flags]
```

Start a model on one of your GPUs and print how to use it. **Both.** This is the
everyday command on Linux and macOS alike.

Give it a model id and Nodeau picks a GPU that can hold it, starts it, waits for
it to load and prints an endpoint. Give it something that's already running and
it just brings the local endpoint back. If the model isn't downloaded yet, it
tells you the size and the licence and asks first.

The endpoint binds `127.0.0.1`. By default it installs a user service, so it
keeps running after you close the terminal. `--foreground` runs it right here
instead.

| Flag | Default | Meaning |
|---|---|---|
| `--name <name>` | from the model | Name for the workload |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |
| `--task <task>` | inferred | `chat`, `embed` or `rerank`. Inferred when the model can only do one |
| `--context-size <n>` | `4096` | Context window |
| `--parallel <n>` | `1` | Concurrent sequences |
| `--batch-tokens <n>` | runtime default (512) | Micro-batch size for embedding and reranking workloads |
| `--port <n>` | `8080` | Loopback port |
| `--pull` | off | Download the model if it's missing, without asking |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Where model files are kept |
| `--foreground` | off | Run the endpoint in this terminal instead of installing a user service |
| `--timeout <d>` | `10m` | How long to wait for it to start serving |
| `--mode <mode>` | the fleet's setting | `efficiency`, `balanced` or `performance`, for this workload |
| `--gpus <n>` | `1` | How many GPUs in **one machine** to use for this model. For models too big for one card. Linux/NVIDIA |
| `--gpus-auto` | off | Has no effect yet: the workload uses the number of GPUs `--gpus` asks for |
| `--max-gpus <n>` | unset | Has no effect yet: it bounds `--gpus-auto` |
| `--topology <mode>` | `auto` | How one model is spread across several GPUs: `auto` or `layer`. Advanced, and you'll rarely need it |
| `--accept-estimate-risk` | off | Admit a model whose only obstacle is the margin for hardware nobody has measured |
| `--spend-safety-reserve` | off | Let this workload use the memory Nodeau keeps back for everything else on the card |
| `--json` | off | Print the result as JSON |
| `--yes`, `-y` | off | Answer every question with yes |

```bash
nodeau run qwen3.5-4b-q4km                       # a catalog model
nodeau run qwen-local                            # bring an existing one's endpoint back
nodeau run my-model --task embed --port 8081     # an imported model, as an embedder
```

**Exit codes.** `0` running, with an endpoint. `2` the model or service name
wasn't recognised. `3` refused, and the answer stays the same until something
changes. `4` still starting, and ran out of time to wait.

:::note Asking for several GPUs
Use `--gpus N` to give one model N cards in one machine. `--gpus-auto` and
`--max-gpus` are accepted and currently change nothing, and Nodeau prints a
notice on stderr when you pass one: a workload started with them gets the number
of cards `--gpus` asks for, which is one unless you say otherwise. See
[several GPUs in one machine](/docs/multi-gpu/).
:::

### `nodeau ps` {#nodeau-ps}

```bash
nodeau ps [flags]          # alias: nodeau list
```

Every workload using a GPU, models you're serving and batch jobs alike, with
where each one is and what it's doing. **Both.**

| Flag | Default | Meaning |
|---|---|---|
| `--all`, `-a` | off | Include finished batch jobs |
| `--all-namespaces`, `-A` | off | Look across all namespaces |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |
| `--json` | off | Machine-readable |

### `nodeau status` {#nodeau-status}

```bash
nodeau status [flags]
```

The state of every Nodeau workload and local endpoint. **Linux.** On a Mac,
[`nodeau ps`](#nodeau-ps) gives you the same picture.

Nothing here comes from a cache. Workload state comes from the cluster, endpoint
state from the service manager, and "answering" from a real connection to the
port, so a stale record can't make it report something that isn't true.

Flags: `--all-namespaces`/`-A`, `--namespace`/`-n`, `--json`.

### `nodeau stop` {#nodeau-stop}

```bash
nodeau stop SERVICE [flags]
```

Stop serving a model locally. **Both.** By default this stops the local endpoint
and leaves the model loaded on its GPU, so starting again is instant.

| Flag | Meaning |
|---|---|
| `--workload` | Stop the model as well, freeing its GPU. Downloaded files stay |
| `--endpoint-only` | Stop only the endpoint, without asking about the model |
| `--remove` | Also delete the endpoint's service definition |
| `--namespace`, `-n` | Namespace |
| `--yes`, `-y` | Answer every question with yes |

Your downloaded model files stay put whichever you choose.

### `nodeau restart` {#nodeau-restart}

```bash
nodeau restart SERVICE [flags]
```

Restart the model behind a service so it re-reads its configuration. **Linux.**

The model server reads its configuration, including your API key, once, when it
starts. A regenerated key or a change to a mounted file takes effect when the
process restarts, and this is how you restart it. Nothing is reconfigured and
nothing is deleted except the running pod, which Kubernetes recreates straight
away. Expect a short gap while the model reloads into VRAM.

Flags: `--wait` (default `true`), `--timeout` (default `10m`), `--namespace`/`-n`.

### `nodeau logs` {#nodeau-logs}

```bash
nodeau logs WORKLOAD [flags]
```

Read what a workload is printing, no `kubectl` needed. **Both.**

```bash
nodeau logs qwen-local                     # the model server's own output
nodeau logs my-batch                       # a batch job's worker
nodeau logs --system nodeau-controller     # one of Nodeau's own components (Linux)
```

| Flag | Default | Meaning |
|---|---|---|
| `--follow`, `-f` | off | Keep printing new output |
| `--tail <n>` | `200` | How many recent lines (`-1` for all) |
| `--previous` | off | The previous run of a container that has restarted |
| `--container`, `-c` | unset | Which container, when a workload has more than one |
| `--system` | off | Read one of Nodeau's own components |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |

Prompts, completions and batch records are never written to a log, so they'll
never show up here.

### `nodeau dashboard` {#nodeau-dashboard}

```bash
nodeau dashboard [flags]
```

Serve a local dashboard showing hardware, models, running services and your
plan. **Both.** It binds loopback only and asks for a token, which is printed in
the URL and swapped for a session cookie the first time you open it.

The page is compiled into the binary, so there's nothing to install or download,
and it works with no internet connection at all. It's read-only apart from one
action: it can stop a batch job.

Flags: `--addr` (default `127.0.0.1:7371`, must be loopback), `--cache-dir`.

### `nodeau endpoint serve` {#nodeau-endpoint-serve}

```bash
nodeau endpoint serve [flags]
```

Run the loopback reverse proxy in the foreground until you stop it. **Both.** This
is what the generated user service runs. Run it directly to see exactly why an
endpoint won't start.

Flags: `--service`, `--namespace`, `--model`, `--port` (default `8080`, `0` lets
the OS choose), `--upstream` (resolved from the service when you leave it out).

:::note Keeping an endpoint up after you log out, on Linux
The endpoint runs as a systemd **user** service, which stops when your session
ends. To keep it running across logout and at boot, enable lingering for your
account with `sudo loginctl enable-linger "$USER"`. Nodeau leaves that choice to
you, because it changes session behaviour for the whole account.
:::

### `nodeau service` {#nodeau-service}

```bash
nodeau service get [NAME] [flags]     # alias: nodeau svc
nodeau service explain NAME [flags]
nodeau service apply -f FILE [flags]
```

Work with `GPUService` objects directly. **Linux.** These talk to the Kubernetes
API with your kubeconfig and your permissions.

- **`get`** lists services, or shows one. Flags: `--all-namespaces`/`-A`,
  `--namespace`/`-n`, `--json`.
- **`explain`** shows the reasoning behind Nodeau's decision, including the VRAM
  arithmetic. Everything it prints comes from the object's status, written by the
  controller at the moment it decided. It reads that record rather than redoing
  the sums, so there's only ever one answer.
- **`apply`** creates or updates a service from a YAML manifest (`-f -` reads
  stdin). The controller admits the workload a moment later and records its
  decision in status, so follow it with `get` or `explain`.

### `nodeau placement explain` {#nodeau-placement-explain}

```bash
nodeau placement explain WORKLOAD [flags]
```

Why a workload is where it is, and what each alternative would have cost.
**Linux.** Flags: `--namespace`/`-n`, `--json`. See
[placement](/docs/scheduling/#placement).

---

## Models

`nodeau model` and `nodeau models` are the same command.

### `nodeau model list` {#nodeau-model-list}

```bash
nodeau model list [flags]          # alias: ls
```

Models Nodeau can serve, and what's downloaded. **Both.** It shows the curated
catalog with each model's role, hardware rung, size and status, then your own
imported models in a list of their own, because they're a different kind of
trust.

Flags: `--all` (include deprecated and legacy models), `--cache-dir`,
`--namespace`/`-n` (show custom models from one namespace), `--json`.

### `nodeau model info` {#nodeau-model-info}

```bash
nodeau model info MODEL [flags]
```

Licence, provenance and the configurations that have been **measured**. **Both.**

The measurements are the interesting part, and an empty list is a real answer:
it means every decision about this model is worked out from its shape rather
than observed. Each row also says whether its figure counted the whole device or
one process, because those are different quantities.

Flags: `--cache-dir`, `--namespace`/`-n`, `--json`.

### `nodeau model install` {#nodeau-model-install}

```bash
nodeau model install MODEL [flags]
```

Download a model from its publisher and verify it. **Both.**

Nothing downloads until you agree: the size, licence and source come first. An
interrupted download resumes. A file that fails verification is moved aside, so
the evidence survives and the next run can't mistake it for a good copy.

Flags: `--consent` (agree without being asked, for scripts), `--verify`
(re-verify what's already downloaded and fetch nothing), `--cache-dir`.

### `nodeau model verify` {#nodeau-model-verify}

```bash
nodeau model verify MODEL [flags]
```

Read the whole file and recompute its SHA-256. **Both.**

Having a file and having the right file are two different things. This is worth
running on a machine that's been power-cycled or had storage trouble, because a
corrupted model can load, answer fluently and still look healthy. It checks
**this** machine. Each machine also verifies its own copy continuously and
publishes the result, which `nodeau model status` shows.

Flags: `--cache-dir`, `--namespace`/`-n`.

### `nodeau model status` {#nodeau-model-status}

```bash
nodeau model status [MODEL] [flags]
```

The fleet's view of models: which machine holds which weights, whether each
machine's bytes have been checked, which GPUs are big enough, and what's using
them. **Linux.**

The GPU columns answer *is this card big enough*, judged as if the card were
free of Nodeau workloads. Whether it's free **right now** is a separate column,
because "too small" and "busy" call for completely different next steps.

Flags: `--context-size` (default `4096`), `--parallel` (default `1`),
`--namespace`/`-n`, `--cache-dir`, `--json`.

### `nodeau model remove` {#nodeau-model-remove}

```bash
nodeau model remove MODEL [flags]      # alias: rm
```

Delete the weights for one model, **on this machine only**. **Both.**

Nodeau first checks that no service references the model, and names the one
that does if there is one. When it can't reach the cluster to check, it stops
and says so, because not knowing whether something is in use is a reason to
wait. Only that one model's file is touched.

Flags: `--yes`, `--namespace`/`-n`, `--cache-dir`.

### `nodeau model import` {#nodeau-model-import}

```bash
nodeau model import PATH --alias NAME [flags]
```

Bring your own GGUF model into Nodeau. **Linux.** See
[bring your own model](/docs/byom/).

| Flag | Default | Meaning |
|---|---|---|
| `--alias <name>` | **required** | The name you'll use to run this model |
| `--namespace`, `-n` | `nodeau-dev` | Namespace to register it in. It has to be where its workloads run |
| `--sha256 <digest>` | unset | The digest you expect. A mismatch stops the import before anything is copied |
| `--qualify` | off | Run qualification straight after importing |
| `--probe <list>` | unset | Capabilities to try during qualification, beyond what the file suggests |
| `--no-register` | off | Place and verify the weights on this machine only, without registering a model |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Model cache directory |
| `--json` | off | Machine-readable |

Use `--alias` or `--no-register`, one or the other.

### `nodeau model qualify` {#nodeau-model-qualify}

```bash
nodeau model qualify MODEL [flags]
```

Find out, on your own hardware, what a custom model can really do. **Linux.**

| Flag | Default | Meaning |
|---|---|---|
| `--probe <list>` | what the model declares | Capabilities to probe |
| `--task <task>` | `chat`, or the model's own | Task to qualify |
| `--context-size <n>` | `4096` | Context window to qualify at |
| `--parallel <n>` | `1` | Concurrent sequences to qualify at |
| `--gpus <n>` | `1` | Accelerators for this one workload |
| `--dry-run` | off | Print the plan and stop, without touching a GPU |
| `--ready-timeout <d>` | `8m` | How long the runtime may take to start |
| `--timeout <d>` | `20m` | How long the whole run may take |
| `--accept-estimate-risk` | off | See [accepting the risk yourself](/docs/scheduling/#accepting-the-risk-yourself) |
| `--spend-safety-reserve` | off | The same page explains this one too |
| `--namespace`, `-n` | `nodeau-dev` | Namespace the qualification workload runs in |
| `--json` | off | Machine-readable |

Qualification uses **free capacity** and leaves healthy workloads running. If
your cards are busy, admission says so and the run reports it straight away.

---

## Batch inference

**Linux, with Home Pro or Business.** On a Mac these commands explain that batch
runs on Linux and exit with the refused code `3`. See
[batch inference](/docs/batch/).

### `nodeau batch submit` {#nodeau-batch-submit}

```bash
nodeau batch submit FILE --model MODEL [flags]
```

Submit a JSONL file of requests.

| Flag | Default | Meaning |
|---|---|---|
| `--model <id>` | **required** | Model to run every record against |
| `--name <name>` | generated | Name for the job |
| `--namespace`, `-n` | `nodeau-dev` | Namespace to create the job in |
| `--task <task>` | inferred | `chat` or `embed` |
| `--workers <n>` | `1` | How many **independent** workers process the records at once, each on its own GPU |
| `--gpus <n>` | `1` | How many GPUs **one** worker uses, for a model too large for a single card |
| `--context-size <n>` | `4096` | Context window the model server runs with |
| `--parallel <n>` | `1` | Concurrent sequences the runtime serves |
| `--max-attempts <n>` | `2` | How many times the whole job may run. A retry starts again from the first record |

`--workers` and `--gpus` answer different questions, and mixing them up costs
you throughput without any error to warn you. See
[workers and GPUs](/docs/batch/#workers-and-gpus).

### `nodeau batch status` {#nodeau-batch-status}

```bash
nodeau batch status NAME [flags]
```

One batch job in detail, including how many workers are running and how many
are waiting for a card. Flags: `--namespace`/`-n`, `--json`.

### `nodeau batch list` {#nodeau-batch-list}

```bash
nodeau batch list [flags]          # alias: ls
```

Flags: `--all-namespaces`/`-A`, `--namespace`/`-n`, `--json`.

### `nodeau batch wait` {#nodeau-batch-wait}

```bash
nodeau batch wait NAME [flags]
```

Block until the job reaches a final state, then exit. The exit code is the
outcome, so it chains nicely in a shell:

```bash
nodeau batch wait my-job && nodeau batch results my-job
```

`0` the job finished. `1` it failed, was cancelled, or the wait timed out.
Flags: `--timeout` (default `24h`), `--namespace`/`-n`.

### `nodeau batch results` {#nodeau-batch-results}

```bash
nodeau batch results NAME [flags]
```

Download the results, one JSON object per line. They're written to a file by
default. These are your model's answers, and a file keeps them out of your
terminal's scrollback, your screenshots and any issue you paste.

Flags: `--output`/`-o` (default `NAME-results.jsonl`), `--stdout`,
`--namespace`/`-n`.

### `nodeau batch cancel` {#nodeau-batch-cancel}

```bash
nodeau batch cancel NAME [flags]
```

Stop a batch job. Results it has already produced are kept and stay available.
Nodeau waits for the model server to actually exit before it releases the GPU,
so a cancelled job can take a few seconds to finish stopping. Flags:
`--namespace`/`-n`.

---

## Your machines

### `nodeau fleet invite` {#nodeau-fleet-invite}

```bash
nodeau fleet invite [flags]
```

Print a code that adds another machine to your fleet. **Linux.** Your plan's
machine limit is checked before the code is created: Home is one machine, Home
Pro up to three, and Business as many as you need.

The code is a credential for as long as it lives, so paste it into the other
machine's terminal rather than a chat log. It expires on its own whether or not
anyone uses it, and a machine that has joined never needs it again.

Flags: `--expires-in` (default `15m`), `--address` (the address the new machine
should use to reach this one; defaults to this machine's LAN address).

### `nodeau fleet list` {#nodeau-fleet-list}

```bash
nodeau fleet list [--json]         # alias: ls
```

Every machine in your fleet and the GPUs in it. **Linux.**

### `nodeau fleet remove` {#nodeau-fleet-remove}

```bash
nodeau fleet remove MACHINE [flags]
```

Take a machine out of the fleet for good, because it's retired, failed or been
sold. **Linux.**

Nodeau removes its cluster membership, the storage and identity it created for
it, and the credential that let it reconnect, then frees the plan slot it was
using. If workloads are placed on the machine, Nodeau lists them and waits for
you: stop them first, or pass `--force` if the machine is already gone.

The machine's own installation is left as it is. Rejoining afterwards takes a
fresh invitation, and that's deliberate: a removed machine can't reappear on its
own.

Flags: `--dry-run`, `--force`, `--yes`, `--json`.

### `nodeau fleet connect` {#nodeau-fleet-connect}

```bash
nodeau fleet connect [flags]
```

Let Nodeau Cloud show you this fleet from anywhere. **Linux.** It needs an
account ([`nodeau login`](#nodeau-login)).

Your machines reach **out** to Nodeau Cloud, and every connection starts on your
side. This command opens no inbound port, callback or remote shell. What travels
is what someone running machines needs to see: which machines exist, what's
plugged into them, what's running, and whether anything needs attention. What
you compute stays on your hardware.

Inference carries on whether or not the connector is running.

Flags: `--yes`, `--no-linger` (skip the offer to keep the connector running when
you're logged out).

### `nodeau fleet disconnect` {#nodeau-fleet-disconnect}

```bash
nodeau fleet disconnect
```

Stop and remove the fleet connector. **Linux.** Everything else carries on, and
this machine stays linked to your account for its plan.
[`nodeau logout`](#nodeau-logout) is the command that unlinks it.

### `nodeau fleet status` {#nodeau-fleet-status}

```bash
nodeau fleet status [--json]
```

Whether this fleet is reporting to Nodeau Cloud. **Linux.**

### `nodeau fleet upgrade plan` {#nodeau-fleet-upgrade-plan}

```bash
nodeau fleet upgrade plan [flags]
```

See what moving your fleet to a Nodeau release would involve, before any machine
moves. **Linux.** It reads and changes nothing. `nodeau fleet upgrade` on its own
prints help for all five subcommands.

The target is resolved **once**, to a version, the commit it was built from, and
the digest of every artifact it names, so the plan describes one specific build.
For each machine you get where it would go, whether it's ready, waiting for your
maintenance window, already up to date, or blocked (with the reason in words and
a code), the order the machines would go in, and what it would mean for the
workloads running there. The machine that runs your control plane goes last.

| Flag | Default | Meaning |
|---|---|---|
| `--to <version>` | the channel's current release | Pin the target to one version the channel serves |
| `--channel <name>` | this build's | Release channel to plan against |
| `--machine <name>` | every machine | Plan only this machine. Repeat it for several |
| `--fleet-group` | off | Plan only the machines your organisation's fleet group names |
| `--max-report-age <d>` | `10m` | How old a machine's last report may be and still be planned; `0` skips that check |
| `--json` | off | Print the plan as JSON |
| `--base-url <url>` | the public release site | Where releases are published |

```bash
nodeau fleet upgrade plan                          # the channel's current release
nodeau fleet upgrade plan --to v0.15.0-beta.7      # one exact version
nodeau fleet upgrade plan --machine garage --json  # one machine, for a script
```

Exit `0` whenever a plan was worked out, whatever it says about each machine,
and `1` when one couldn't be, for example with no network to read the release
from. With `--json`, even a failure comes back as JSON, with an `error` field,
so a script always has something to parse.

The plan uses the maintenance window and channel policy Nodeau Cloud holds for
your fleet, and its notes say whether it could see them: a policy it couldn't see
is reported as unknown and holds every machine that would move. In `--json`,
each machine's `key` is its node UID (it was the name before v0.15.0-beta.7) and
`name` is its name. See [upgrading a fleet](/docs/upgrades/).

### `nodeau fleet upgrade apply` {#nodeau-fleet-upgrade-apply}

```bash
nodeau fleet upgrade apply [flags]
```

Show the plan, ask, then ask Nodeau Cloud to authorise that exact plan.
**Linux**, with Home Pro or Business and the fleet connected to your account.
Nodeau Cloud works out its own plan and refuses if the two differ, so what you
approve is what you saw. Your machines then upgrade one at a time, workers first
and the control plane last, each checked on what it reports running before the
next. Workloads on a machine being upgraded stop and start again on that machine.

| Flag | Default | Meaning |
|---|---|---|
| `--yes` | off | Authorise without asking. The plan is still printed |
| `--override-window` | off | Let machines upgrade outside your organisation's maintenance window, recorded as your decision |
| `--to <version>` | the channel's current release | Pin the target to one version the channel serves |
| `--channel <name>` | this build's | Release channel to plan against |
| `--machine <name>` | every machine | Plan only this machine. Repeat it for several |
| `--fleet-group` | off | Plan only the machines your organisation's fleet group names |
| `--max-report-age <d>` | `10m` | How old a machine's last report may be and still be planned; `0` skips that check |
| `--base-url <url>` | the public release site | Where releases are published |

One rollout runs at a time: cancel an unfinished one before approving another.

### `nodeau fleet upgrade status` {#nodeau-fleet-upgrade-status}

```bash
nodeau fleet upgrade status [--json]
```

The rollout Nodeau Cloud has authorised for this fleet, as it last told this
installation, beside this installation's own record of the step it ran.
**Linux.** What was asked for and what a machine reports are shown separately: a
step is complete only when its machine reports running the target.

### `nodeau fleet upgrade cancel` {#nodeau-fleet-upgrade-cancel}

```bash
nodeau fleet upgrade cancel [rollout-id]
```

Stop a rollout before its next machine. **Linux.** Before any machine has
started, the rollout ends at once. A machine already upgrading finishes or fails
first, and no machine starts after it. With no id, it acts on the fleet's
current rollout.

### `nodeau fleet upgrade resume` {#nodeau-fleet-upgrade-resume}

```bash
nodeau fleet upgrade resume [rollout-id]
```

Retry the machine a held rollout stopped on. **Linux.** The machine is tried
again as a new attempt of the same step, and every check it has to pass first is
run again. With no id, it acts on the fleet's current rollout.

### `nodeau scheduling mode` {#nodeau-scheduling-mode}

```bash
nodeau scheduling mode [efficiency|balanced|performance] [flags]
```

Show or set how Nodeau chooses where work runs. **Linux.** With no argument it
shows the current mode. Flags: `--node <name>` (set it for one machine instead
of the whole fleet), `--json`.

### `nodeau scheduling constraints` {#nodeau-scheduling-constraints}

```bash
nodeau scheduling constraints [flags]
```

Show or set the **hard** limits Nodeau must respect on a machine. **Linux.**

Flags: `--node`, `--power-budget <W>`, `--idle-watts <W>`,
`--max-accelerators <n>`, `--deny-device <uuid>`, `--allow-device <uuid>`,
`--clear`, `--json`. See
[hard constraints](/docs/scheduling/#hard-constraints).

### `nodeau scheduling drain` / `undrain` {#nodeau-scheduling-drain}

```bash
nodeau scheduling drain   --node MACHINE
nodeau scheduling undrain --node MACHINE
```

Stop placing new work on a machine while everything already there keeps
running, and later put it back into service. **Linux.** Undraining leaves every
workload where it is now.

### `nodeau governance` {#nodeau-governance}

```bash
nodeau governance [flags]
```

Show or set your organisation's limits on this fleet. **Linux.** On a Mac it
explains that limits belong to a fleet and exits `3`. With no flags it shows the
current policy.

| Flag | Meaning |
|---|---|
| `--max-workloads <n>` | The most workloads that may run at once; `0` removes the quota |
| `--max-gpus <n>` | The most graphics cards in use at once; `0` removes the quota |
| `--max-batch-workers <n>` | The most batch workers at once; `0` removes the quota |
| `--allow-model <id>` | Permit a model, by the id a workload runs under. Repeatable |
| `--allow-device <uuid>` | Permit a graphics card, by UUID. Repeatable |
| `--allow-node <name>` | Permit a machine, by name. Repeatable |
| `--clear` | Remove every governance setting from this fleet |
| `--json` | Print the policy as JSON |

**Lowering a quota leaves everything already running exactly as it is.** A quota
decides what may start. See [limits and policies](/docs/governance/).

### `nodeau health` {#nodeau-health}

```bash
nodeau health [--json]
nodeau health history [flags]
```

How each machine is doing (processor, memory, storage and network) and anything
that needs attention. **Linux.** On a Mac both exit `3` and say why.

`history` prints one machine's recorded telemetry. Flags: `--machine`,
`--since` (default `1h`), `--resolution`, `--metric` (repeatable), `--device`
(repeatable), `--max-points`, `--json`.

Storage is reported as how full a filesystem is. See
[health and alerts](/docs/health/).

### `nodeau power` {#nodeau-power}

```bash
nodeau power [--json]
nodeau power set --device UUID --limit WATTS
nodeau power set --device UUID --clear
```

Show what each GPU is allowed to draw and what it's drawing, and set one card's
software power limit. **Linux.** `set` is local: it applies to a card in the
machine you run it on and never crosses the network.

It sets a software power limit and nothing else: no firmware, no VBIOS, no
voltage, no clocks. See [power limits and budgets](/docs/power/).

---

## Keys, accounts and plans

### `nodeau auth show` {#nodeau-auth-show}

```bash
nodeau auth show [--quiet]
```

Print the local API key, creating one the first time. **Both.**

It's written for substitution, so the bare key is the only thing on stdout and
anything explanatory goes to stderr:

```bash
export NODEAU_API_KEY="$(nodeau auth show)"
```

`--quiet`/`-q` prints only the key, with no notices on stderr.

### `nodeau auth token` {#nodeau-auth-token}

```bash
nodeau auth token SERVICE [flags]
```

Print the token to use against **one service's** endpoint. **Linux.** Where
`auth show` prints your local key, this checks which credential the service
actually enforces, and tells you when it isn't one Nodeau can print, instead of
handing you a key that would be rejected.

Flags: `--export` (print a shell export line you can `eval`), `--namespace`/`-n`.

### `nodeau auth rotate` {#nodeau-auth-rotate}

```bash
nodeau auth rotate [--yes]
```

Generate a new local API key and discard the current one. **Both.** Every saved
`curl` command, script and SDK configuration using the old key stops working
straight away, which is the point of rotating. The running endpoint keeps going
without a restart: it forwards whatever `Authorization` header it receives and
never reads the key file itself.

### `nodeau auth publish` {#nodeau-auth-publish}

```bash
nodeau auth publish SERVICE [flags]
```

Make the local API key the one a service enforces. **Linux.** This fixes an
endpoint that rejects the key `auth show` prints, which happens when the service
references a Secret Nodeau didn't publish.

The model server reads its key file once at startup, so the workload restarts.
Expect a short gap while the model reloads into VRAM. Flags: `--yes`,
`--namespace`/`-n`.

### `nodeau login` {#nodeau-login}

```bash
nodeau login [flags]
```

Link this installation to a Nodeau account. **Both.** It's optional: Nodeau runs
completely without one.

You never paste a token. Nodeau shows a short code, you approve it in a browser
where you're already signed in, and this machine receives its own credential
directly.

| Flag | Default | Meaning |
|---|---|---|
| `--show` | off | Show this machine's account status and exit |
| `--name <name>` | this machine's hostname | Name for this installation |
| `--no-browser` | off | Print the URL and code instead of opening a browser |
| `--wait <d>` | `10m` | How long to wait for approval |
| `--api <url>` | `https://api.nodeau.ai` | Nodeau Cloud API base URL |
| `--json` | off | Machine-readable |

### `nodeau logout` {#nodeau-logout}

```bash
nodeau logout [--json]
```

Remove this machine's account link. **Both.** Everything keeps running:
inference, batch and every local capability carry on, on the free Home plan.
It's a **local** operation, so the installation stays listed in your Nodeau
account until you remove it there.

### `nodeau plan show` {#nodeau-plan-show}

```bash
nodeau plan show [--json]          # alias: nodeau entitlement show
```

The current plan, its capabilities and its limits. **Both.**

### `nodeau plan refresh` {#nodeau-plan-refresh}

```bash
nodeau plan refresh [--json]
```

Fetch a current entitlement from Nodeau Cloud. **Both.** Run it after changing
plan, and to renew before the current one expires.

A failed refresh changes nothing. The entitlement already on the machine keeps
working until it expires, and an installation with no entitlement at all runs
the free Home plan with every safety and integrity check in place.

### `nodeau plan set` {#nodeau-plan-set}

```bash
nodeau plan set --from-file FILE      # or - for stdin
```

Install a signed entitlement token. **Both.** Most people want `nodeau login`
instead. The token is read from a file or stdin, never from a command-line
argument, so it stays out of your shell history and the process list.

### `nodeau plan export` / `import` {#nodeau-plan-export}

```bash
nodeau plan export [FILE] [-o FILE]
nodeau plan import FILE [--json]
```

Carry an entitlement to a machine with no internet. **Both.**

The entitlement names the installation and organisation it was issued for, so
the file works on the machine it belongs to and nowhere else. An imported
entitlement goes through exactly the same checks as a fetched one, so it's never
less verified. There's nothing secret in the file.

---

## Support

### `nodeau support bundle` {#nodeau-support-bundle}

```bash
nodeau support bundle [flags]
```

Write a sanitised diagnostic archive to the current directory. **Both.** The
bundle stays on your disk until you choose to send it. Flags: `--output`/`-o`,
`--namespace`/`-n`.

See [support bundles](/docs/support/) for exactly what goes in and what stays
out.

---

## Also in the binary

`nodeau completion` generates a shell completion script. It's standard Cobra
behaviour.

Two commands are **hidden** because they're plumbing rather than part of the
everyday vocabulary: `nodeau fleet refresh-connector`, which the installer
calls for you, and, on macOS, `nodeau native`, a low-level diagnostic that skips
the catalog, consent and the endpoint. The ordinary commands do the same work on
both platforms, and they're the ones to use.
