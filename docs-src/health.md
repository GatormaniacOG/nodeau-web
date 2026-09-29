---
title: Health, alerts and diagnostics in Nodeau
heading: Health and alerts
nav: Health and alerts
description: Which command answers which question, every doctor code, what each machine measures, alert states, history and retention, and the local dashboard.
lede: Five commands answer five different questions. Pick the right one and a problem usually names itself.
---

## Which command answers which question

| Command | Question | Where |
|---|---|---|
| `nodeau doctor` | **Is anything wrong, and what do I do about it?** | Linux and Mac |
| `nodeau health` | **How are my machines doing?** Processor, memory, storage, network | Linux fleets |
| `nodeau status` | **What is Nodeau running right now**, and does the endpoint answer? | Linux and Mac |
| `nodeau ps` | **What is holding a GPU?** Services and batch jobs | Linux and Mac |
| `nodeau logs` | **What is a workload printing?** | Linux and Mac |

`doctor` is the one to start with. It is read-only, it names problems with typed
codes, and every result that is not a pass comes with something to do about it.

---

## `nodeau doctor`

```bash
nodeau doctor
nodeau doctor --json          # every result, code, explanation and remedy
nodeau doctor --host-only     # this machine only, without contacting the cluster
nodeau doctor --node nodeau-c # one machine, plus the installation-wide checks
```

**Every check is read-only.** Doctor looks and reports; it never installs,
configures, mounts, starts or stops anything.

It covers two halves:

- **The host**: is this machine able to run Nodeau? Operating system, processor,
  memory, whether it is bare metal, storage safety, the state directory, Secure
  Boot, the GPU on the PCI bus, the driver, VRAM and network.
- **The installation**: is Nodeau itself working? Its control plane, the agent on
  each machine, whether every GPU report is fresh enough to schedule against,
  whether the models on disk still verify, and what your services and batch jobs
  are doing.

Exit `0`: everything passed, or only warnings. Exit `1`: something failed. Exit
`2`: the command was called wrongly.

### Doctor codes {#doctor-codes}

Stable, machine-readable, and identical in `--json` and in the human report.

**Reaching the cluster**

| Code | Meaning |
|---|---|
| `CLUSTER_UNREACHABLE` | Nodeau cannot reach Kubernetes |
| `API_FORBIDDEN` | The cluster answered and refused this identity |
| `NODEAU_NOT_INSTALLED` | A Nodeau component is absent. On a machine that has not been set up yet, this is simply the right answer |
| `NODEAU_CRDS_MISSING` | The Nodeau resource types are not registered |
| `CONTROLLER_NOT_RUNNING` | The control plane is not available |
| `AGENT_NOT_RUNNING` | A machine has no hardware agent reporting |
| `COMPONENT_DEGRADED` | A component is running below its desired count |

**Hardware**

| Code | Meaning |
|---|---|
| `NO_GPU_NODES` | No machine has published a GPU yet |
| `HARDWARE_REPORT_STALE` | A machine's GPU report is older than the controller will accept, so admission waits for a fresh one on that machine |
| `GPU_UNHEALTHY` | A reported GPU says it is unhealthy |
| `DEVICES_NOT_INDEPENDENT` | A machine holds more than one GPU and allocates them by count. This is the normal state until a machine opts in to scheduling each card by name |
| `DEVICE_DRIVER_MISSING` | A machine is set to schedule each card by name, and nothing is offering its GPUs |
| `DEVICE_ALLOCATORS_OVERLAP` | A machine is serving GPU work through **both** allocators at once. Fix this one promptly: two allocators over the same cards can hand out the same card twice |
| `HOST_CHECK_FAILED` | A host-level precondition failed |
| `STORAGE_LOW` | The model cache filesystem is running out of room |

**Models**

| Code | Meaning |
|---|---|
| `NO_MODELS` | Nothing has been downloaded yet |
| `MODEL_CACHE_NOT_OBSERVED` | A GPU machine has no model-cache observation yet |
| `MODEL_CACHE_ERROR` | The cache observer ran and could not read the cache |
| `MODEL_CACHE_VERIFYING` | A hash is in progress. It clears by itself |
| `MODEL_CORRUPT` | A cached artifact does not match the catalog digest |

**Workloads**

| Code | Meaning |
|---|---|
| `SERVICE_NOT_ADMITTED` | A service exists and Nodeau refused it. This is the product doing its job, listed so you can see it without going looking |
| `SERVICE_NOT_READY` | Admitted and still getting ready to serve |
| `WORKLOAD_STOPPED` | A workload Nodeau has a record of is stopped |
| `BATCH_JOB_FAILED` | A batch job ended in failure |

**Local endpoints**

| Code | Meaning |
|---|---|
| `ENDPOINT_NOT_ANSWERING` | A local endpoint is recorded and does not answer |
| `ENDPOINT_UPSTREAM_LOST` | It answers, and cannot reach the model behind it |
| `ENDPOINT_ORPHANED` | Endpoint units exist for workloads that are gone |
| `ENDPOINT_UNRECORDED` | An endpoint is running that Nodeau has no record of, so `nodeau status` leaves it out |
| `ENDPOINT_BINARY_REPLACED` | A local endpoint is running a program that has since been replaced on disk |
| `NETWORK_EXPOSURE` | Something on the machine makes a model reachable from off it. Nodeau itself only ever binds `127.0.0.1`, so this points at something else worth knowing about |

**Account and plan**

| Code | Meaning |
|---|---|
| `ENTITLEMENT_INVALID` | An entitlement exists and was not accepted |
| `PLAN_REFRESH_STALLED` | This installation is linked to an account and has stopped learning what that account entitles it to |
| `FLEET_NOT_REPORTING` | The fleet connector is not reporting. A **warning at most**: inference carries on regardless |
| `FLEET_REPORT_STALE` | Reporting, and the last report is older than the cadence Nodeau Cloud asked for |
| `FLEET_PROTOCOL_MISMATCH` | This build and Nodeau Cloud cannot exchange fleet state. An update fixes it |
| `CONNECTOR_BINARY_REPLACED` | The connector is running a binary that has since been replaced on disk |

**On a Mac**

| Code | Meaning |
|---|---|
| `RUNTIME_MISSING` | No model runtime is installed yet |
| `RUNTIME_CORRUPT` | The installed runtime's bytes no longer match the digests recorded when it was installed |
| `RUNTIME_UNVERIFIED` | Installed, and its integrity was **not checked on this run**. Deliberately not a pass: "not checked" and "intact" are different answers |
| `RUNTIME_UNMANAGED` | A runtime Nodeau did not install, so it carries no version, backend or digests |
| `NOT_ON_PATH` | The binary is installed and your shell does not find it yet |

Fixes for each are in [troubleshooting](/docs/troubleshooting/).

---

## `nodeau health`

```bash
nodeau health
nodeau health --json
nodeau health history --machine nodeforge --since 6h
```

:::linux A fleet command
`health` and `health history` read the fleet's datastore, so they run on Linux
machines in a fleet. A Mac runs standalone, and `nodeau doctor` covers it: the
codes under **On a Mac** above are the ones it reports.
:::

The current state of every machine, **processor, memory, storage and network**,
next to its GPU readings, together with anything that needs attention.

```text
nodeau-c  (worker, ready, reported 6s ago)
    CPU              0 %            16 threads, 0 % stalled
    memory           12 %           1.9 GiB of 15.5 GiB in use
    storage used     21 %           709.7 GiB free on /dev/nvme0n1p2
    network          7.5 KiB/s in   2.9 KiB/s out, counting enp6s0, wlp5s0
    GPU              NVIDIA GeForce RTX 3080, 44 MiB of 9,877 MiB in use, healthy
```

**Every reading is taken by the machine it describes, and stays on your own
hardware.** The fleet console shows your machines and their state; these readings
stay local.

### Missing is not zero

A value shown as **"not collected"** is missing, which is a different answer from
zero. A card reporting 0% utilisation is idle; a card Nodeau could not read is
unknown, and the two never look the same.

`health history` follows the same rule: an interval with no observations is
**absent** rather than zero, so a gap in the output is a gap in what was observed.
Nodeau leaves it as a gap.

### `history` flags

| Flag | Default | Meaning |
|---|---|---|
| `--machine <name>` | the first with any history | Which machine |
| `--since <d>` | `1h` | How far back to look |
| `--resolution <w>` | the finest that fits | A named window, such as `1m` or `15m`. Unset, Nodeau picks the finest window that covers the range within the point limit |
| `--metric <name>` | all | Restrict to a metric. Repeatable |
| `--device <uuid>` | all | Restrict to a GPU UUID. Repeatable |
| `--max-points <n>` | Nodeau's own ceiling | The most intervals to print per series |
| `--json` | off | Machine-readable |

### Retention

**24 hours**, the same on every plan.

History lives in the fleet's datastore, which is **the control-plane machine's
disk**. It stays on that one machine, so if that disk is lost, the history goes
with it.

### What health reports, and where it stays

- **Storage** is how full each filesystem is. Drive health data such as SMART is
  outside what Nodeau reads, so keep your usual disk tools for that.
- **Figures are per machine and per card.** Per-process figures, process lists,
  command lines and connection tables are outside what it collects.
- **Readings stay on your hardware.** Your account shows your machines and their
  state; the readings stay local.
- **Alerts appear where you look**: in `nodeau health` and the local dashboard.
  Delivering them by email or webhook is on the [roadmap](/roadmap/).

### Alerts

The controller watches a small set of conditions and reports what needs
attention:

| Condition | About |
|---|---|
| `MachineOffline` | A machine has stopped reporting |
| `HostTelemetryUnavailable` | The machine is there and its readings are not |
| `HostMemoryPressure` | System memory |
| `HostFilesystemLow` | A filesystem filling up |
| `AcceleratorUnhealthy` | A card reporting a fault |
| `AcceleratorMemoryExhausted` | A card's memory |
| `AcceleratorTemperatureHigh` | Temperature |
| `AcceleratorThermalThrottling` | The card lowering its clocks to stay within limits |
| `InsufficientVRAM` | A workload that cannot be placed |
| `WorkloadNotReady` | A workload that is not serving |

An alert has **three** states:

| State | Meaning |
|---|---|
| `Pending` | The condition is holding and counting toward its debounce window |
| `Active` | It held for the full window |
| `Resolved` | It was there, and it stopped |

**Only `Active` counts anywhere.** No badge, tile or `nodeau health` line moves
for a `Pending` alert, so a brief blip never reads as a problem.

:::note Alerts and health answer different questions
A healthy machine can carry a warning, and a machine with no alerts can still be
unable to run what you want. Use both.
:::

---

## `nodeau status`

```bash
nodeau status
```

**Everything here is read fresh.** The workload state comes from the cluster, the
endpoint state from the service manager, and "answering" from an actual
connection to the port, so a stale record can never make it report something
untrue.

It also lists anything on the machine that makes a model reachable **from your
network**. Nodeau binds only `127.0.0.1`, so if something shows up here, it came
from somewhere else and is worth a look.

---

## `nodeau ps`

```bash
nodeau ps            # everything holding a GPU
nodeau ps --all      # including finished batch jobs
nodeau ps -A         # across all namespaces
```

Services and batch jobs alike, with where each one is and what it is doing.

```text
NAME        TYPE     MODEL              STATE    GPU                         MACHINE    PROGRESS  AGE  ENDPOINT
qwen-local  service  qwen3.5-4b-q4km    serving  NVIDIA GeForce RTX 5060 Ti  nodeforge  1/1       4d   http://127.0.0.1:8080/v1
```

---

## `nodeau logs`

```bash
nodeau logs qwen-local -f
nodeau logs my-batch
nodeau logs --system nodeau-controller
```

Your workloads are looked up by name. On Linux, Nodeau's own components are under
`--system`.

**Prompts, completions and batch records are never written to a log**, so they
can never appear here.

---

## The local dashboard

```bash
nodeau dashboard
```

The same picture in a browser: hardware, models, running services, alerts and
plan. It binds loopback, asks for a token, is compiled into the binary, and works
with no internet connection at all.

It is read-only apart from one action: it can stop a batch job.
