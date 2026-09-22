---
title: Health, doctor and diagnostics
heading: Health and diagnostics
nav: Health and diagnostics
description: The difference between doctor, health, status, ps and logs, what each machine actually measures, alert states, retention, and every doctor code.
lede: Five commands answer five different questions. Using the wrong one is the commonest reason a real problem looks invisible.
---

## Which command answers which question

| Command | Question | Platform |
|---|---|---|
| `nodeau doctor` | **Is anything wrong, and what do I do about it?** | Both |
| `nodeau health` | **How are my machines doing** — processor, memory, storage, network | Linux |
| `nodeau status` | **What is Nodeau running right now**, and does the endpoint answer? | Both |
| `nodeau ps` | **What is holding a GPU** — services and batch jobs | Both |
| `nodeau logs` | **What is a workload printing?** | Linux |

`doctor` is the one to start with. It is read-only, it names problems in typed
codes, and every result that is not a pass carries something to do about it.

---

## `nodeau doctor`

```bash
nodeau doctor
nodeau doctor --json          # every result, code, explanation and remedy
nodeau doctor --host-only     # this machine only, without contacting the cluster
nodeau doctor --node nodeau-c # one machine, plus installation-wide checks
```

**Every check is read-only.** Doctor never installs, configures, mounts, starts
or stops anything; it only looks.

Two halves:

- **The host** — is this machine capable of running Nodeau: operating system,
  processor, memory, whether it is bare metal, storage safety, the state
  directory, Secure Boot, the GPU on the PCI bus, the driver, VRAM, network.
- **The installation** — is Nodeau itself working: its control plane, the agent on
  each machine, whether every GPU report is fresh enough to schedule against,
  whether the models on disk still verify, and what your services and batch jobs
  are doing.

Exit `0` everything passed or only warnings · `1` something failed · `2` called
wrongly.

### Doctor codes {#doctor-codes}

Stable, machine-readable, and the same in `--json` as in the human report.

**Reaching the cluster**

| Code | Meaning |
|---|---|
| `CLUSTER_UNREACHABLE` | Nodeau cannot talk to Kubernetes at all |
| `API_FORBIDDEN` | The cluster answered and refused this identity |
| `NODEAU_NOT_INSTALLED` | A Nodeau component is absent. On a machine that has not been set up, this is the correct answer rather than a fault |
| `NODEAU_CRDS_MISSING` | The Nodeau resource types are not registered |
| `CONTROLLER_NOT_RUNNING` | The control plane is not available |
| `AGENT_NOT_RUNNING` | No hardware agent is reporting on some machine |
| `COMPONENT_DEGRADED` | A component is running below its desired count |

**Hardware**

| Code | Meaning |
|---|---|
| `NO_GPU_NODES` | No machine has published a GPU |
| `HARDWARE_REPORT_STALE` | A machine's GPU report is older than the controller will accept, so admission fails closed for that machine |
| `GPU_UNHEALTHY` | A reported GPU says it is not healthy |
| `DEVICES_NOT_INDEPENDENT` | A machine holds more than one GPU and cannot schedule them independently. Not a fault — the state every machine is in until it opts in |
| `DEVICE_DRIVER_MISSING` | A machine is switched to per-device scheduling and nothing offers its GPUs |
| `DEVICE_ALLOCATORS_OVERLAP` | A machine is serving GPU work through **both** allocators. This one **is** a fault, and the dangerous kind — two independent allocators over the same cards |
| `HOST_CHECK_FAILED` | A host-level precondition failed |
| `STORAGE_LOW` | The model cache filesystem is running out of room |

**Models**

| Code | Meaning |
|---|---|
| `NO_MODELS` | Nothing has been downloaded yet |
| `MODEL_CACHE_NOT_OBSERVED` | A GPU machine has no model-cache observation |
| `MODEL_CACHE_ERROR` | The observer ran and could not read the cache |
| `MODEL_CACHE_VERIFYING` | A hash is in progress. Clears by itself |
| `MODEL_CORRUPT` | A cached artifact does not match the catalog digest |

**Workloads**

| Code | Meaning |
|---|---|
| `SERVICE_NOT_ADMITTED` | A service exists and Nodeau refused it. **Not an installation fault** — the product working, reported so you can see it without going looking |
| `SERVICE_NOT_READY` | Admitted and not yet serving |
| `WORKLOAD_STOPPED` | A workload Nodeau has a record of is not running |
| `BATCH_JOB_FAILED` | A batch job ended in failure |

**Local endpoints**

| Code | Meaning |
|---|---|
| `ENDPOINT_NOT_ANSWERING` | A local endpoint is recorded and does not answer |
| `ENDPOINT_UPSTREAM_LOST` | It answers and cannot reach the model behind it |
| `ENDPOINT_ORPHANED` | Endpoint units exist for workloads that do not |
| `ENDPOINT_UNRECORDED` | An endpoint is running and Nodeau has no record of it, so `nodeau status` does not list it |
| `ENDPOINT_BINARY_REPLACED` | A local endpoint is running a program that has since been replaced on disk |
| `NETWORK_EXPOSURE` | Something makes a model reachable from off this machine. **Nodeau never creates one** |

**Account and plan**

| Code | Meaning |
|---|---|
| `ENTITLEMENT_INVALID` | An entitlement exists and was not accepted |
| `PLAN_REFRESH_STALLED` | This installation is linked to an account and has stopped learning what that account entitles it to |
| `FLEET_NOT_REPORTING` | The fleet connector is not reporting. A **warning at worst** — a cloud outage costs you nothing |
| `FLEET_REPORT_STALE` | Reporting, and the last report is older than the cadence the server asked for |
| `FLEET_PROTOCOL_MISMATCH` | This build and Nodeau Cloud cannot exchange fleet state. An update fixes it; a network never will |
| `CONNECTOR_BINARY_REPLACED` | The connector is running a binary that has since been replaced on disk |

**macOS**

| Code | Meaning |
|---|---|
| `RUNTIME_MISSING` | No model runtime is installed, so nothing can be executed |
| `RUNTIME_CORRUPT` | The installed runtime's bytes no longer match the digests recorded when it was installed |
| `RUNTIME_UNVERIFIED` | Installed, and its integrity was **not checked on this run**. Deliberately not a pass: "was not checked" and "is intact" are different claims |
| `RUNTIME_UNMANAGED` | A runtime Nodeau did not install, so it has no version, no backend and no digests |
| `NOT_ON_PATH` | The binary is installed and a shell will not find it |

---

## `nodeau health`

```bash
nodeau health
nodeau health --json
nodeau health history --machine nodeforge --since 6h
```

:::linux
`health` and `health history` refuse on a native installation and say so. They
read the fleet datastore, and a Mac runs standalone — it is not a Kubernetes node
and has no fleet to report on. The codes under **macOS** below are the ones a Mac
does produce, through `nodeau doctor`.
:::

The current state of every machine — **processor, memory, storage and network** —
alongside the GPU readings already there, together with anything that needs
attention.

**Every reading was taken by the machine it describes**, and stays on your own
hardware. Telemetry is not sent to Nodeau Cloud, and there is no field for it in
the protocol that talks to Nodeau Cloud at all.

### Missing is not zero

A value shown as **"not collected"** is missing, which is a different thing from
zero. A card reporting 0% utilisation is idle; a card Nodeau could not read is
unknown, and the two must never look the same.

`health history` follows the same rule: an interval with no observations is
**absent** rather than zero, so a gap in the output is a gap in what was observed.
Nodeau does not fill one in.

### `history` flags

| Flag | Default | Meaning |
|---|---|---|
| `--machine <name>` | the first with any history | Which machine |
| `--since <d>` | `1h` | How far back to look |
| `--resolution <w>` | — | A named window, e.g. `1m` or `15m` |
| `--metric <name>` | all | Restrict to a metric. Repeatable |
| `--device <uuid>` | all | Restrict to a GPU UUID. Repeatable |
| `--max-points <n>` | — | The most intervals to print per series |
| `--json` | off | Machine-readable |

### Retention

**24 hours**, uniformly. It is not a plan difference, and no plan gets more.

History lives in the Kubernetes datastore — which is **the control-plane
machine's disk**. It is not replicated anywhere. If that disk is lost, the
history goes with it.

### What health does not do

- **No disk health and no SMART.** Nodeau reads no drive attribute. It reports how
  full a filesystem is, and says so. It will not tell you a disk is failing.
- **No per-process CPU or memory**, no process list, no command lines, no
  connection table.
- **No telemetry to Nodeau Cloud.** The machines appear in the hosted console;
  these readings do not.
- **No external alert delivery.** No email, no webhook, no pager.
- **Not qualified on Apple Silicon.**

### Alerts

The controller reconciles a small set of conditions and reports what needs
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
| `AcceleratorThermalThrottling` | The card reducing clocks to stay within limits |
| `InsufficientVRAM` | A workload that cannot be placed |
| `WorkloadNotReady` | A workload that is not serving |

An alert has **three** states:

| State | Meaning |
|---|---|
| `Pending` | The condition is holding and counting toward its debounce window |
| `Active` | It held for the full window |
| `Resolved` | It was there and stopped |

**Only `Active` is counted anywhere** — no badge, tile or `nodeau health` line
moves for a `Pending` alert. That is what makes the third state additive rather
than a claim.

:::note An alert is not health
A healthy machine can carry a warning, and a machine with no alerts can still be
unable to run what you want. They answer different questions.
:::

---

## `nodeau status`

```bash
nodeau status
```

**Nothing here is read from a cache.** The workload state comes from the cluster,
the endpoint state from the service manager, and "answering" from an actual
connection to the port — so a stale record cannot make this report something that
is not true.

It also lists anything that makes a model reachable **from your network**, if
something on the machine does. Nodeau does not create those, and saying so is the
point.

---

## `nodeau ps`

```bash
nodeau ps            # everything holding a GPU
nodeau ps --all      # including finished batch jobs
nodeau ps -A         # across all namespaces
```

Services and batch jobs alike, with where each one is and what it is doing.

---

## `nodeau logs`

```bash
nodeau logs qwen-local -f
nodeau logs my-batch
nodeau logs --system nodeau-controller
```

Nodeau's own components are under `--system`; everything else is looked up in
your workload namespace.

**Prompts, completions and batch records are never written to a log**, so they
cannot appear here.

---

## The local dashboard

```bash
nodeau dashboard
```

The same information in a browser: hardware, models, running services, alerts and
plan. Bound to loopback, protected by a token, compiled into the binary, and it
works with no internet connection at all.

It is read-only apart from one action — it can stop a batch job.
