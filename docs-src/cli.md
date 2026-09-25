---
title: Nodeau CLI reference
heading: CLI reference
nav: CLI reference
description: Every public Nodeau command and subcommand — syntax, platform, plan requirements, flags, examples and the failure states each one can reach.
lede: Every public command, with its flags, the platform it runs on, and what it does when it refuses. Anything not listed here does not exist in this build.
---

## How to read this

```bash
nodeau <command> [arguments] [flags]
nodeau <command> --help        # always current, for the binary you have
```

Conventions used throughout:

- **Platform** — `Linux` means Linux with an NVIDIA GPU; `macOS` means Apple
  Silicon; `Both` means the command works the same on either.
- **Plan** — only stated where a capability is actually gated. Most commands
  need no account at all.
- Arguments in `UPPER CASE` are required; `[BRACKETS]` are optional.

### Namespaces

Workload commands take `--namespace`/`-n`, defaulting to **`nodeau-dev`**. Unless
you have created others, that is the only one you will use. `-A` /
`--all-namespaces` looks across all of them where it is offered.

### Exit codes {#exit-codes}

Five, deliberately. A script needs to answer three questions without parsing
text: did it work, is this my fault, and should I try again?

| Code | Name | Meaning |
|---|---|---|
| `0` | OK | It worked |
| `1` | Error | Nodeau itself failed, or something unexpected did |
| `2` | Usage | The command was called wrongly — unknown flag, missing argument, unknown model id. Fix the command, not the machine |
| `3` | Refused | Nodeau considered the request and declined, and that will not change on its own |
| `4` | Not ready | The answer is "not yet" — still starting, queued, or a wait that ran out of time |

The distinction between `3` and `4` is the one that matters: **a script that
retries on failure should retry on `4` and never on `3`.**

`nodeau doctor` uses a narrower contract of its own: `0` everything passed or
only warnings, `1` something failed, `2` called wrongly.

`nodeau batch wait` uses `0` finished, `1` failed, cancelled or timed out.

### `--json` {#json}

Thirty commands take `--json`. As a rule: **every command that prints a table
also takes `--json`**, and commands that only perform an action do not.

The JSON is a stable contract — field names in it are part of the CLI's
interface, and reason codes inside it will not be renamed without a breaking
change. Use it rather than parsing human output, which is written for people and
is expected to change.

`--json` never implies consent. A command that would change the machine still
asks, or refuses and tells you to pass `--yes`.

---

## Setting up

### `nodeau install` {#nodeau-install}

```bash
nodeau install [flags]
```

Check the machine, show a plan, and set up what is missing. **Both platforms**,
with genuinely different bodies — see [Linux](/docs/install-linux/) and
[macOS](/docs/install-macos/).

On Linux it installs, when absent: the NVIDIA Container Toolkit, K3s, the NVIDIA
device plugin, the per-device GPU driver, and Nodeau's own control plane. When
they are already there it **adopts** them, uses them as found, and records that
it did — which is what makes uninstall safe.

It will never install, upgrade, replace or remove your NVIDIA driver, and never
touches Secure Boot, the bootloader, the kernel command line, any partition, or a
Kubernetes cluster it did not create.

Running it again is safe: it re-checks everything, skips what is done, does not
regenerate your API key, and never re-decides who owns a component.

| Flag | Platform | Default | Meaning |
|---|---|---|---|
| `--dry-run` | Both | off | Show the plan, including every command, and stop |
| `--yes`, `-y` | Both | off | Skip the confirmation |
| `--state <path>` | Both | `/var/lib/nodeau/install-state.json` | Path to the install ledger |
| `--verbose`, `-v` | Linux | off | The full technical plan instead of the plain-language summary |
| `--server-dry-run` | Linux | off | Send every manifest to the Kubernetes API server for full validation, then discard it |
| `--print-manifests` | Linux | off | Print every manifest compiled into this binary and exit, changing nothing |
| `--skip-k3s` | Linux | off | Do not install Kubernetes; you will provide a cluster |
| `--skip-toolkit` | Linux | off | Do not install the NVIDIA Container Toolkit |
| `--cache-dir <path>` | Linux | `/var/lib/nodeau/models` | Model cache directory |
| `--channel <name>` | Linux | `dev` | Release channel to record |
| `--scheduling-mode <m>` | Linux | balanced | `efficiency`, `balanced`, `performance` or `legacy` |
| `--scheduling-selection` | Linux | `true` | Let the mode choose placements; `false` records what it would have chosen |
| `--controller-image <ref>` | Linux | the release's | Override the controller image |
| `--agent-image <ref>` | Linux | the release's | Override the node agent image |
| `--batch-runner-image <ref>` | Linux | the release's | Override the batch runner image |
| `--runtime <path>` | macOS | bundled | A prepared model runtime: a directory or `.tar.gz` |
| `--skip-path` | macOS | off | Do not offer to add Nodeau to your shell `PATH` |
| `--skip-binary` | macOS | off | Do not copy the Nodeau binary into Nodeau's own directory |
| `--json` | macOS | off | Machine-readable output |

**Failure states.** A blocking preflight check exits `3` and names the check.
On Linux a missing or broken NVIDIA driver stops the install rather than being
fixed. With no terminal attached and no `--yes`, it refuses rather than acting
unasked.

### `nodeau join` {#nodeau-join}

```bash
nodeau join CODE [flags]
```

Join this machine to an existing fleet as a worker. **Linux.** Needs
`FeatureMultiNode` — **Home Pro** or **Business** on the machine that invited it.

Get the code from the machine that already runs Nodeau
([`nodeau fleet invite`](#nodeau-fleet-invite)). This machine needs an NVIDIA GPU
with a working driver and must be able to reach the other machine on your
network. If it already runs a cluster of its own, Nodeau stops and says so rather
than destroying it.

| Flag | Default | Meaning |
|---|---|---|
| `--dry-run` | off | Show what would happen and change nothing |
| `--verbose` | off | Print every command that would run |
| `--yes`, `-y` | off | Do not ask for confirmation |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Where this machine keeps model files |

A Mac cannot join a fleet. See [adding and operating machines](/docs/fleet/).

### `nodeau doctor` {#nodeau-doctor}

```bash
nodeau doctor [flags]
```

Diagnose this installation and explain anything that is wrong. **Both.**
Every check is **read-only**: doctor never installs, configures, mounts, starts
or stops anything.

Two halves. The **host** — is this machine capable of running Nodeau. The
**installation** — is Nodeau itself working: its control plane, the agent on each
machine, whether every machine's GPU report is fresh enough to schedule against,
whether the models on disk still verify, and what your services and batch jobs
are doing.

| Flag | Default | Meaning |
|---|---|---|
| `--json` | off | Every result with its code, explanation and remedy, in a stable shape |
| `--host-only` | off | Check this machine only, without contacting the cluster |
| `--node <name>` | all | Report only on one machine, plus installation-wide checks |
| `--namespace`, `-n` | `nodeau-dev` | Namespace your workloads are in |

Exit `0` everything passed or only warnings · `1` something failed · `2` called
wrongly. Codes are listed under [health and diagnostics](/docs/health/#doctor-codes).

### `nodeau environment` {#nodeau-environment}

```bash
nodeau environment [--json]        # alias: nodeau env
```

Print what Nodeau has detected about this machine: operating system, processor,
memory, GPUs, network, and which disks Nodeau is allowed to write to and which
belong to another operating system. **Both.** Reads only.

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

Compare this machine's Nodeau with the published release channel. **Both.**
By default it only looks.

| Flag | Default | Meaning |
|---|---|---|
| `--download` | off | Also fetch the new build and check it against the published checksum, refusing to keep anything that does not match |
| `--channel <name>` | this build's | Which channel to check |
| `--base-url <url>` | `https://get.nodeau.ai` | Where releases are published |
| `--json` | off | Machine-readable |

Nodeau never updates itself in the background, and a machine that cannot reach
the internet keeps working exactly as it is. See
[updating and release channels](/docs/updates/).

### `nodeau uninstall` {#nodeau-uninstall}

```bash
nodeau uninstall [flags]
```

Remove Nodeau's own components, keeping everything Nodeau did not install.
**Both.** The full plan is printed before anything happens, and each destructive
option is named for exactly what it destroys. See
[uninstalling](/docs/uninstall/).

| Flag | Platform | Meaning |
|---|---|---|
| `--dry-run` | Both | Print the plan and stop |
| `--yes`, `-y` | Both | Do not ask for confirmation |
| `--state <path>` | Both | Path to the install ledger |
| `--namespace`, `-n` | Linux | Namespace Nodeau's workloads live in |
| `--remove-models` | Linux | Also delete downloaded model weights |
| `--remove-batch-data` | Linux | Delete every batch job's input records and results. **These exist nowhere else** |
| `--remove-managed-k3s` | Linux | Also remove K3s, and only if Nodeau installed it |
| `--remove-toolkit` | Linux | Also remove the NVIDIA Container Toolkit, and only if Nodeau installed it |
| `--purge` | Linux | Every removal option above at once |
| `--models` | macOS | Also delete downloaded model weights |
| `--keep-path` | macOS | Leave the `PATH` line in your login profile |

There is deliberately no flag that means "remove more" without saying what.

---

## Running models

### `nodeau quickstart` {#nodeau-quickstart}

```bash
nodeau quickstart [flags]
```

Download a model, start it, and print a working `curl` command. **Linux.**
Everything it does is one of the other commands. See
[Quickstart](/docs/quickstart/).

| Flag | Default | Meaning |
|---|---|---|
| `--model <id>` | the starter model | Model to install and serve |
| `--name <name>` | `qwen-local` | Name for the workload |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |
| `--context-size <n>` | `4096` | Context window |
| `--parallel <n>` | `1` | Concurrent sequences |
| `--port <n>` | `8080` | Loopback port for the endpoint |
| `--timeout <d>` | `10m` | How long to wait for it to become Ready |
| `--consent` | off | Agree to the download without being asked |
| `--yes`, `-y` | off | Do not ask anything |

### `nodeau run` {#nodeau-run}

```bash
nodeau run MODEL|SERVICE [flags]
```

Start a model on one of your GPUs and print how to use it. **Both** — this is
the supported vocabulary on Linux and macOS alike.

Given a model id it picks a GPU that can hold it, starts it, waits for it to
load and prints an endpoint. Given something already running it just brings the
local endpoint back. If the model is not downloaded it tells you the size and the
licence and asks first.

The endpoint binds `127.0.0.1` and nothing else. By default it installs a user
service so it survives closing the terminal; `--foreground` runs it here instead.

| Flag | Default | Meaning |
|---|---|---|
| `--name <name>` | from the model | Name for the workload |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |
| `--task <task>` | inferred | `chat`, `embed` or `rerank`. Inferred when the model can only do one |
| `--context-size <n>` | `4096` | Context window |
| `--parallel <n>` | `1` | Concurrent sequences |
| `--batch-tokens <n>` | runtime default (512) | Micro-batch size for embedding and reranking workloads |
| `--port <n>` | `8080` | Loopback port |
| `--pull` | off | Download the model if missing, without asking |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Where model files are kept |
| `--foreground` | off | Run the endpoint in this terminal instead of installing a user service |
| `--timeout <d>` | `10m` | How long to wait for it to start serving |
| `--mode <mode>` | fleet setting | `efficiency`, `balanced` or `performance` for this workload |
| `--gpus <n>` | `1` | How many GPUs in **one machine** to use for this model. Linux/NVIDIA only |
| `--gpus-auto` | off | Let Nodeau choose how many GPUs to use |
| `--max-gpus <n>` | — | The most `--gpus-auto` may use |
| `--topology <mode>` | `auto` | How to spread one model across several GPUs — `auto` or `layer` |
| `--accept-estimate-risk` | off | Admit a model whose only obstacle is the unmeasured-hardware margin |
| `--spend-safety-reserve` | off | Let this workload use the memory Nodeau keeps back for everything else on the card |
| `--json` | off | Print the result as JSON |
| `--yes`, `-y` | off | Do not ask anything |

```bash
nodeau run qwen3.5-4b-q4km                       # a catalog model
nodeau run qwen-local                            # bring an existing one's endpoint back
nodeau run my-model --task embed --port 8081     # an imported model, as an embedder
```

**Exit codes.** `0` running, with an endpoint · `2` the model or service name was
not recognised · `3` refused, and that will not change on its own · `4` still
starting, and ran out of time to wait.

:::note `--gpus-auto` and `--max-gpus` do not currently change the outcome
The flags parse and are accepted, and the request they write is not read by the
Kubernetes execution plane — a workload started with them gets one card, exactly
as `--gpus 1` would. Use `--gpus N` to ask for several cards explicitly. This is
a known gap rather than a behaviour to design around.
:::

### `nodeau ps` {#nodeau-ps}

```bash
nodeau ps [flags]          # alias: nodeau list
```

Every workload using a GPU — models you are serving and batch jobs alike — with
where each one is and what it is doing. **Both.**

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

The state of every Nodeau workload and local endpoint. **Both.**

Nothing here is read from a cache. The workload state comes from the cluster, the
endpoint state from the service manager, and "answering" from an actual
connection to the port — so a stale record cannot make this report something that
is not true.

Flags: `--all-namespaces`/`-A`, `--namespace`/`-n`, `--json`.

### `nodeau stop` {#nodeau-stop}

```bash
nodeau stop SERVICE [flags]
```

Stop serving a model locally. **Both.** By default this stops the local endpoint
and leaves the model loaded on its GPU, so starting again is instant.

| Flag | Meaning |
|---|---|
| `--workload` | Stop the model as well, freeing its GPU. Downloaded files are kept |
| `--endpoint-only` | Stop only the endpoint, without asking about the model |
| `--remove` | Also delete the service unit file |
| `--namespace`, `-n` | Namespace |
| `--yes`, `-y` | Do not ask anything |

Your downloaded model files are never touched by any of these.

### `nodeau restart` {#nodeau-restart}

```bash
nodeau restart SERVICE [flags]
```

Restart the model behind a service so it re-reads its configuration. **Linux.**

The model server reads its configuration — including your API key — once, when it
starts. A regenerated key, or any change to a mounted file, does not take effect
until the process restarts. Nothing is reconfigured and nothing is deleted except
the running pod. Expect a short gap while the model reloads into VRAM.

Flags: `--wait` (default `true`), `--timeout` (default `10m`), `--namespace`/`-n`.

### `nodeau logs` {#nodeau-logs}

```bash
nodeau logs WORKLOAD [flags]
```

Read what a workload is printing, without needing `kubectl`. **Linux.**

```bash
nodeau logs qwen-local                     # the model server's own output
nodeau logs my-batch                       # a batch job's worker
nodeau logs --system nodeau-controller     # one of Nodeau's own components
```

| Flag | Default | Meaning |
|---|---|---|
| `--follow`, `-f` | off | Keep printing new output |
| `--tail <n>` | `200` | How many recent lines (`-1` for all) |
| `--previous` | off | The previous run of a container that has restarted |
| `--container`, `-c` | — | Which container, when a workload has more than one |
| `--system` | off | Read one of Nodeau's own components |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |

Prompts, completions and batch records are never written to a log, so they
cannot appear here.

### `nodeau dashboard` {#nodeau-dashboard}

```bash
nodeau dashboard [flags]
```

Serve a local dashboard showing hardware, models, running services and plan.
**Both.** Binds loopback only and requires a token, printed in the URL and
exchanged for a session cookie the first time you open it.

The page is compiled into the binary: nothing to install, nothing to download,
and it works with no internet connection at all. It is read-only apart from one
action — it can stop a batch job.

Flags: `--addr` (default `127.0.0.1:7371`, must be loopback), `--cache-dir`.

### `nodeau endpoint serve` {#nodeau-endpoint-serve}

```bash
nodeau endpoint serve [flags]
```

Run the loopback reverse proxy in the foreground until interrupted. **Both.**
This is what the generated user service runs; use it directly to see why an
endpoint will not start.

Flags: `--service`, `--namespace`, `--model`, `--port` (default `8080`, `0` lets
the OS choose), `--upstream` (resolved from the service when omitted).

:::note Surviving logout on Linux
The endpoint runs as a systemd **user** service, which stops when your session
ends. To keep it running across logout and at boot:
`sudo loginctl enable-linger "$USER"`. Nodeau does not do this for you — it
changes session semantics for the whole account.
:::

### `nodeau service` {#nodeau-service}

```bash
nodeau service get [NAME] [flags]     # alias: nodeau svc
nodeau service explain NAME [flags]
nodeau service apply -f FILE [flags]
```

Work with `GPUService` objects directly. **Linux.** This is a development-mode
CLI: it talks to the Kubernetes API using your kubeconfig, with your permissions.

- **`get`** lists services, or shows one. Flags: `--all-namespaces`/`-A`,
  `--namespace`/`-n`, `--json`.
- **`explain`** shows the reasoning behind Nodeau's decision, including the VRAM
  arithmetic. Everything printed comes from the object's status, written by the
  controller when it decided — this command does not re-run the calculation.
- **`apply`** creates or updates a service from a YAML manifest (`-f -` for
  stdin). It does **not** admit the workload here; the controller admits it
  asynchronously and records the decision in status.

### `nodeau placement explain` {#nodeau-placement-explain}

```bash
nodeau placement explain WORKLOAD [flags]
```

Why a workload is where it is, and what the alternatives would have cost.
**Linux.** Flags: `--namespace`/`-n`, `--json`. See
[placement](/docs/scheduling/#placement).

---

## Models

`nodeau model` and `nodeau models` are the same command.

### `nodeau model list` {#nodeau-model-list}

```bash
nodeau model list [flags]          # alias: ls
```

Models Nodeau can serve, and what is downloaded. **Both.** Shows the curated
catalog with each model's role, hardware rung, size and status, then your own
imported models separately — different trust classes, listed separately.

Flags: `--all` (include deprecated and legacy models), `--cache-dir`,
`--namespace`/`-n` (only show custom models in one namespace), `--json`.

### `nodeau model info` {#nodeau-model-info}

```bash
nodeau model info MODEL [flags]
```

Licence, provenance and **measured** configurations. **Both.**

The measurements are the interesting part, and an empty list is a real answer: it
means every decision about this model is computed rather than observed. Each row
states its **scope** — whether the figure counted the whole device or one process
— because the two are different quantities.

Flags: `--cache-dir`, `--namespace`/`-n`, `--json`.

### `nodeau model install` {#nodeau-model-install}

```bash
nodeau model install MODEL [flags]
```

Download a model from its publisher and verify it. **Both.**

Nothing is downloaded until you agree: the size, licence and source are shown
first. An interrupted download resumes. A file that fails verification is moved
aside rather than deleted — so the evidence survives — and rather than left in
place, so the next run cannot mistake it for a good one.

Flags: `--consent` (agree without being asked, for scripts), `--verify` (only
re-verify what is already downloaded; download nothing), `--cache-dir`.

### `nodeau model verify` {#nodeau-model-verify}

```bash
nodeau model verify MODEL [flags]
```

Read the whole file and recompute its SHA-256. **Both.**

Presence is not integrity. Worth running on a machine that has been power-cycled
or has had storage trouble: a corrupted model loads, serves fluent-looking
answers and reports healthy. This checks **this** machine; each node verifies its
own copy continuously and publishes the result, which `nodeau model status`
shows.

### `nodeau model status` {#nodeau-model-status}

```bash
nodeau model status [MODEL] [flags]
```

The fleet's view of models: which machine holds which weights, whether the bytes
on each machine have been checked, which GPUs are big enough, and what is using
them. **Linux.**

The GPU columns answer *is this card big enough*, judged as if the card were free
of Nodeau workloads. Whether it is free **right now** is shown separately,
because "too small" and "busy" call for completely different actions.

Flags: `--context-size` (default `4096`), `--parallel` (default `1`),
`--namespace`/`-n`, `--cache-dir`, `--json`.

### `nodeau model remove` {#nodeau-model-remove}

```bash
nodeau model remove MODEL [flags]      # alias: rm
```

Delete the weights for one model, **on this machine only**. **Both.**

Nodeau checks first that no service references the model, and refuses by name if
one does. It refuses just as firmly when it cannot reach the cluster to check:
not knowing whether something is in use is a reason to stop, not a reason to
proceed. Only the one model's artifact is touched.

Flags: `--yes`, `--namespace`/`-n`, `--cache-dir`.

### `nodeau model import` {#nodeau-model-import}

```bash
nodeau model import PATH --alias NAME [flags]
```

Bring your own GGUF model into Nodeau. **Linux** (qualified). See
[bring your own model](/docs/byom/).

| Flag | Default | Meaning |
|---|---|---|
| `--alias <name>` | **required** | The name you will use to run this model |
| `--namespace`, `-n` | `nodeau-dev` | Namespace to register it in — it must be where its workloads run |
| `--sha256 <digest>` | — | The digest you expect; a mismatch refuses the import and copies nothing |
| `--qualify` | off | Run qualification immediately after importing |
| `--probe <list>` | — | Capabilities to try during qualification, beyond what the file suggests |
| `--no-register` | off | Place and verify the weights on this machine only, without registering a model |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Model cache directory |
| `--json` | off | Machine-readable |

`--alias` and `--no-register` cannot be used together.

### `nodeau model qualify` {#nodeau-model-qualify}

```bash
nodeau model qualify MODEL [flags]
```

Prove on your own hardware what a custom model can actually do. **Linux.**

| Flag | Default | Meaning |
|---|---|---|
| `--probe <list>` | what the model declares | Capabilities to probe |
| `--task <task>` | `chat`, or the model's own | Task to qualify |
| `--context-size <n>` | `4096` | Context window to qualify at |
| `--parallel <n>` | `1` | Concurrent sequences to qualify at |
| `--gpus <n>` | `1` | Accelerators for this one workload |
| `--dry-run` | off | Print the plan and stop, without touching a GPU |
| `--ready-timeout <d>` | `8m` | Bound on how long the runtime may take to start |
| `--timeout <d>` | `20m` | Bound on the whole run |
| `--accept-estimate-risk` | off | See [admission](/docs/scheduling/#accepting-the-risk-yourself) |
| `--spend-safety-reserve` | off | Same |
| `--namespace`, `-n` | `nodeau-dev` | Namespace the qualification workload runs in |
| `--json` | off | Machine-readable |

Qualification uses **free capacity** and never evicts a healthy workload. If your
cards are busy, admission refuses and the run reports it rather than waiting
forever.

---

## Batch inference

**Linux only.** Needs `FeatureBatchJobs` — **Home Pro** or **Business**. On macOS
these commands refuse by name. See [batch inference](/docs/batch/).

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
| `--gpus <n>` | `1` | How many GPUs **one** worker uses — for a model too large for a single card |
| `--context-size <n>` | `4096` | Context window the model server runs with |
| `--parallel <n>` | `1` | Concurrent sequences the runtime serves |
| `--max-attempts <n>` | `2` | How many times the whole job may execute. A retry starts from the beginning |

`--workers` and `--gpus` answer different questions, and mixing them up costs
throughput rather than raising an error. See
[workers and GPUs](/docs/batch/#workers-and-gpus).

### `nodeau batch status` {#nodeau-batch-status}

```bash
nodeau batch status NAME [flags]
```

One batch job in detail. Flags: `--namespace`/`-n`, `--json`.

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
outcome, so it composes with a shell:

```bash
nodeau batch wait my-job && nodeau batch results my-job
```

`0` the job finished · `1` it failed, was cancelled, or the wait timed out.
Flags: `--timeout` (default `24h`), `--namespace`/`-n`.

### `nodeau batch results` {#nodeau-batch-results}

```bash
nodeau batch results NAME [flags]
```

Download the results, one JSON object per line. Written to a file by default —
these are your model's answers, and printing them to a terminal by accident is
how they end up in scrollback, a screenshot or a pasted issue.

Flags: `--output`/`-o` (default `NAME-results.jsonl`), `--stdout`,
`--namespace`/`-n`.

### `nodeau batch cancel` {#nodeau-batch-cancel}

```bash
nodeau batch cancel NAME [flags]
```

Stop a batch job. Results already produced are kept and remain available.
Nodeau waits for the model server to actually exit before releasing the GPU, so a
cancelled job may take a few seconds to finish stopping. Flags:
`--namespace`/`-n`.

---

## Your machines

### `nodeau fleet invite` {#nodeau-fleet-invite}

```bash
nodeau fleet invite [flags]
```

Print a code that adds another machine to your fleet. **Linux.** Needs
`FeatureMultiNode` — **Home Pro** or **Business**.

The code is a credential for as long as it lives: paste it into the other
machine's terminal, not into a chat log. It expires on its own whether or not
anyone uses it.

Flags: `--expires-in` (default `15m`), `--address` (the address the new machine
should reach this one on; defaults to this machine's LAN address).

### `nodeau fleet list` {#nodeau-fleet-list}

```bash
nodeau fleet list [--json]         # alias: ls
```

Every machine in your fleet and the GPUs in it. **Linux.**

### `nodeau fleet remove` {#nodeau-fleet-remove}

```bash
nodeau fleet remove MACHINE [flags]
```

Take a machine out of the fleet — retired, failed or sold. **Linux.**

Nodeau removes its cluster membership, the storage and identity it generated for
it, and the credential that let it reconnect, then frees the plan slot it was
using. Workloads placed on the machine **block removal**; stop them first, or
pass `--force` if the machine is already gone.

The machine's own installation is not touched. Rejoining afterwards needs a fresh
invitation, which is the point — a removed machine must not be able to reappear
on its own.

Flags: `--dry-run`, `--force`, `--yes`, `--json`.

### `nodeau fleet connect` {#nodeau-fleet-connect}

```bash
nodeau fleet connect [flags]
```

Let Nodeau Cloud show you this fleet from anywhere. **Linux.** Requires an
account ([`nodeau login`](#nodeau-login)).

Your machines reach **out**. Nothing ever connects in: there is no inbound port,
no callback and no remote shell, and this command opens none. What leaves is what
a person operating machines needs — which machines exist, what is plugged into
them, what is running and whether anything is wrong. What you compute never does.

Nothing about inference depends on it.

Flags: `--yes`, `--no-linger` (do not offer to keep the connector running when
you are logged out).

### `nodeau fleet disconnect` {#nodeau-fleet-disconnect}

```bash
nodeau fleet disconnect
```

Stop and remove the fleet connector. **Linux.** Nothing else changes; this
machine stays linked to your account for entitlements —
[`nodeau logout`](#nodeau-logout) is what unlinks it.

### `nodeau fleet status` {#nodeau-fleet-status}

```bash
nodeau fleet status [--json]
```

Whether this fleet is reporting to Nodeau Cloud. **Linux.**


### `nodeau fleet upgrade` {#nodeau-fleet-upgrade}

Move the machines in a fleet to a Nodeau release, one at a time, workers first
and the control plane last. **Linux**; a Mac is updated on the machine itself.
The whole procedure is in [Upgrading a fleet](/docs/fleet-upgrades/).

### `nodeau fleet upgrade plan` {#nodeau-fleet-upgrade-plan}

```bash
nodeau fleet upgrade plan [flags]
```

Explain what moving this fleet to a release would involve — which machines would
change, which already match, which cannot and why, the order, and what it costs
the workloads running there. Changes nothing. A plan that could not be made exits
non-zero, in `--json` too.

Flags: `--to`, `--channel`, `--machine`, `--fleet-group`, `--max-report-age`,
`--base-url`, `--json`.

### `nodeau fleet upgrade apply` {#nodeau-fleet-upgrade-apply}

```bash
nodeau fleet upgrade apply [flags]
```

Print the plan and ask Nodeau Cloud to carry out **that** plan. Refused if
anything changed since you looked. Needs remote management.

Flags: the plan's flags, `--override-window` (act outside your organisation's
maintenance window, recorded as your decision), `--yes`.

### `nodeau fleet upgrade status` {#nodeau-fleet-upgrade-status}

```bash
nodeau fleet upgrade status [--json]
```

The rollout as Nodeau Cloud last described it: each machine's step and what the
machine itself reported.

### `nodeau fleet upgrade cancel` {#nodeau-fleet-upgrade-cancel}

Stop the rollout before its next machine. A machine already in its step is not
interrupted; the rollout ends canceled, never complete.

### `nodeau fleet upgrade resume` {#nodeau-fleet-upgrade-resume}

Retry a held rollout's failed machine, after checking everything again.
### `nodeau scheduling mode` {#nodeau-scheduling-mode}

```bash
nodeau scheduling mode [efficiency|balanced|performance] [flags]
```

Show or set how Nodeau chooses where work runs. **Linux.** With no argument it
shows. Flags: `--node <name>` (set for one machine instead of the fleet),
`--json`.

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

Stop placing new work on a machine, without touching what runs there; and put it
back into service. **Linux.** Undraining does not move anything back.

### `nodeau governance` {#nodeau-governance}

```bash
nodeau governance [flags]
```

Show or set your organisation's limits on this fleet. **Linux** — on a native
installation it refuses and says so. With no flags it shows the current policy.

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

**Lowering a quota does not stop anything that is already running.** See
[organisation limits](/docs/governance/).

### `nodeau health` {#nodeau-health}

```bash
nodeau health [--json]
nodeau health history [flags]
```

How each machine is doing — processor, memory, storage and network — together
with anything that needs attention. **Linux**; on a native installation both
refuse by name.

`history` prints one machine's recorded telemetry. Flags: `--machine`,
`--since` (default `1h`), `--resolution`, `--metric` (repeatable), `--device`
(repeatable), `--max-points`, `--json`.

Storage is how full a filesystem is and nothing more — Nodeau reads no drive
health data. See [health and diagnostics](/docs/health/).

### `nodeau power` {#nodeau-power}

```bash
nodeau power [--json]
nodeau power set --device UUID --limit WATTS
nodeau power set --device UUID --clear
```

Show what each GPU is allowed to draw and what it is drawing; and set one card's
software power limit. **Linux.** `set` is local: it applies to a card in the
machine you run it on and never crosses the network.

It writes no firmware, no VBIOS, no voltage and no clocks. See
[power limits and budgets](/docs/power/).

---

## Keys, accounts and plans

### `nodeau auth show` {#nodeau-auth-show}

```bash
nodeau auth show [--quiet]
```

Print the local API key, creating one if this is the first time. **Both.**

Written for substitution, so the bare key is the only thing on stdout and
anything explanatory goes to stderr:

```bash
export NODEAU_API_KEY="$(nodeau auth show)"
```

`--quiet`/`-q` prints only the key, with no notices on stderr.

### `nodeau auth token` {#nodeau-auth-token}

```bash
nodeau auth token SERVICE [flags]
```

Print the token to use against **one service's** endpoint. **Linux.** Unlike
`auth show`, this checks which credential the service actually enforces and
refuses rather than printing one that would be rejected.

Flags: `--export` (print a shell export line you can `eval`), `--namespace`/`-n`.

### `nodeau auth rotate` {#nodeau-auth-rotate}

```bash
nodeau auth rotate [--yes]
```

Generate a new local API key, discarding the current one. **Both.** Every saved
`curl` command, script and SDK configuration using the old key stops working
immediately. The running endpoint does not need restarting: it forwards whatever
`Authorization` header it receives and never reads the key file itself.

### `nodeau auth publish` {#nodeau-auth-publish}

```bash
nodeau auth publish SERVICE [flags]
```

Make the local API key the one a service enforces. **Linux.** This is the fix
for an endpoint that rejects the key `auth show` prints — which happens when the
service references a Secret Nodeau did not publish.

The model server reads its key file once at startup, so the workload restarts.
Expect a short gap while the model reloads into VRAM. Flags: `--yes`,
`--namespace`/`-n`.

### `nodeau login` {#nodeau-login}

```bash
nodeau login [flags]
```

Link this installation to a Nodeau account. **Both.** Optional — Nodeau runs
completely without one.

You are never asked to paste a token. Nodeau shows a short code, you approve it
in a browser you are already signed in to, and this machine receives its own
credential directly.

| Flag | Default | Meaning |
|---|---|---|
| `--show` | off | Show this machine's account status and exit |
| `--name <name>` | this machine's hostname | Name for this installation |
| `--no-browser` | off | Do not try to open a browser; print the URL and code |
| `--wait <d>` | `10m` | How long to wait for approval |
| `--api <url>` | `https://api.nodeau.ai` | Nodeau Cloud API base URL |
| `--json` | off | Machine-readable |

### `nodeau logout` {#nodeau-logout}

```bash
nodeau logout [--json]
```

Remove this machine's account link. **Both.** It does not stop anything:
inference, batch and every local capability keep working, on the free Home plan.
It is a **local** operation — the installation still exists in your Nodeau
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

A failed refresh changes nothing: the entitlement already on the machine keeps
working until it expires, and an installation with no entitlement at all runs the
free Home plan with every safety and integrity check intact.

### `nodeau plan set` {#nodeau-plan-set}

```bash
nodeau plan set --from-file FILE      # or - for stdin
```

Install a signed entitlement token. **Both.** Most people want `nodeau login`
instead. The token is read from a file or stdin, never from a command-line
argument, so it does not reach your shell history or the process list.

### `nodeau plan export` / `import` {#nodeau-plan-export}

```bash
nodeau plan export [FILE] [-o FILE]
nodeau plan import FILE [--json]
```

Carry an entitlement to a machine with no internet. **Both.**

The entitlement names the installation and organisation it was issued for, so a
file exported from one machine is **not** a licence another machine can use. An
imported entitlement goes through exactly the same checks a fetched one does and
is never less verified. Nothing secret is in the file.

---

## Support

### `nodeau support bundle` {#nodeau-support-bundle}

```bash
nodeau support bundle [flags]
```

Write a sanitised diagnostic archive to the current directory. **Both.** The
bundle is written to your disk and sent nowhere; Nodeau has no endpoint to upload
it to. Flags: `--output`/`-o`, `--namespace`/`-n`.

See [support bundles](/docs/support/) for exactly what is included and what is
excluded.

---

## Not documented here

`nodeau completion` generates a shell completion script and is standard Cobra
behaviour.

Two commands are **hidden** and are not part of the supported surface:
`nodeau fleet refresh-connector`, which the installer calls for you, and — on
macOS only — `nodeau native`, a diagnostic that bypasses the catalog, consent and
the endpoint. Use the ordinary commands instead; they do the same work on both
platforms.
