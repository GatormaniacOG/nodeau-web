---
title: Admission, scheduling and placement
heading: Admission, scheduling and placement
nav: Admission, scheduling and placement
description: How Nodeau decides whether a workload can run and where it should run — the VRAM arithmetic, safety margins, scheduling modes, holds, drains and every reason code.
lede: Two separate decisions. Admission asks whether a workload can safely run; placement asks where. Both are recorded, and both can be replayed.
---

## Admission comes first

Before anything is created, Nodeau predicts the peak GPU memory a workload will
need and compares it with what a card can actually offer. A workload that would
not fit is **refused**, with the arithmetic and with remedies — rather than
started and left to be killed.

```bash
nodeau service explain qwen-local
```

That prints the decision the controller recorded when it made it. It does not
re-run the calculation: if it did, it could disagree with the controller, and
you would have two answers with no way to know which one the platform acted on.

### The arithmetic

What the card can offer:

```text
  CUDA-addressable VRAM          15,827 MiB
− what else is already on it      5,950 MiB   your desktop, another program
− safety reserve                    512 MiB
= available                       9,365 MiB
```

What the workload needs:

```text
  model weights                   4,280 MiB   from the artifact and quantisation
+ KV cache                          512 MiB   context size × parallel sequences
+ runtime overhead                  300 MiB   the engine's own buffers
= predicted peak                  5,092 MiB
+ prediction margin                 256 MiB
+ estimate margin                   768 MiB   ONLY on unmeasured hardware
= required                        6,116 MiB
```

| Margin | Size | When |
|---|---|---|
| Safety reserve | 512 MiB | Always, per card. What Nodeau keeps back for whatever else is on it |
| Prediction margin | 256 MiB | Always. The error bar on the prediction |
| Estimate margin | 768 MiB | Only when the configuration has not been measured on hardware like yours |
| Multi-device allowance | 128 MiB per device | Only for a workload spanning several cards |

:::warning VRAM is a per-device conjunction, never a sum
Two 8 GB cards are not a 16 GB card. Per-device overhead is **replicated**, not
shared, and the smaller card runs out first. A pair whose total looks ample can
have one card that cannot hold its share.
:::

### Estimated and measured {#estimated-and-measured}

Where Nodeau has a measurement for this model, this configuration and hardware
like yours, it uses the measurement. Where it does not, it computes a figure from
the model's architecture and artifact size, adds the 768 MiB estimate margin,
and **labels the decision estimated**.

```bash
nodeau model info <model>    # which configurations have actually been measured
```

An empty measurement list is a real answer: it means every decision about that
model is computed rather than observed. Each row also states its **scope** —
whether the figure counted the whole device or one process — because the two are
different quantities.

### Accepting the risk yourself

Two flags, on `nodeau run` and `nodeau model qualify`. Both are explicit, both
are per-workload, and both are recorded permanently.

| Flag | What you are accepting |
|---|---|
| `--accept-estimate-risk` | Drop only the extra margin Nodeau adds for hardware nobody has measured this on. You accept that it may not fit |
| `--spend-safety-reserve` | Let this workload use the memory Nodeau keeps back for whatever else is on the card. If that GPU also drives your display, an out-of-memory kill takes it too |

There is no `--force`, and admission cannot be bypassed. An unverified artifact,
an unentitled device, stale hardware or a busy card are **not** overridable by
either flag. Batch deliberately supports neither.

Nodeau will never spend a margin on your behalf. A qualifier that quietly shrank
the margin until a model fit would always succeed and prove nothing.

### Ordering

A **capability** refusal is decided before the capacity arithmetic, so *"this
model cannot embed"* can never reach you as *"insufficient VRAM"*.

An organisation's [governance policy](/docs/governance/) narrows the candidate
set **before** any capacity arithmetic too — so a workload refused by a quota is
told it was a quota, in your organisation's own terms, and never as though it did
not fit.

## Placement

Among the candidates admission accepted, placement chooses. It reports what it
chose and what the alternatives would have cost.

```bash
nodeau placement explain qwen-local
```

```text
Selected   nodeforge / NVIDIA GeForce RTX 5060 Ti (GPU-c080d9be-9a0…)
Mode       balanced   (fleet-default)
Work       output tokens

  WHY
    it was already here and still fits — Nodeau does not move a
    running workload for a better score
    predicted 80.8 output tokens/s   confidence observed
    predicted 166 W

  NOT SELECTED
    nodeau-c     NVIDIA GeForce RTX 3080    predicted 114.0/s

  Hardware data 2026-09-hw.3, decided 2026-09-21T06:17:37Z
```

### What it weighs

- Which machines and cards are **eligible** — healthy, reporting fresh telemetry,
  not drained, not excluded by policy, big enough.
- Whether the machine already has the model's **weights** verified locally.
- A **prediction** of how the workload will perform there, from observations
  collected on your own machines.
- The **scheduling mode**.
- Any **hard constraints** you set on that machine.

### Scheduling modes

```bash
nodeau scheduling mode                      # show
nodeau scheduling mode balanced             # set for the fleet
nodeau scheduling mode performance --node nodeau-c   # set for one machine
```

| Mode | Means |
|---|---|
| `efficiency` | The most work per unit of energy, never much slower |
| `balanced` | Fastest, while staying near the best efficiency. **The default** |
| `performance` | Fastest, whatever it costs |
| `legacy` | The pre-Phase-13 tightest-safe-fit scorer |

A mode change affects **new placements only**. Holds and stickiness run before
any scorer, so a fleet that changes its mode moves nothing that is running.

:::note It is not a learned model
Nodeau's prediction is medians, ratios and linear interpolation over
observations collected where the traffic is — on your own machines. It is not an
"AI scheduler", it does not promise an exact figure, and it does not claim energy
savings. What it promises is a ranking plus a bounded error, and it tells you the
confidence it has.
:::

### Hard constraints

Constraints are **hard**: Nodeau refuses to place work rather than exceed one,
and no mode can score around them.

```bash
nodeau scheduling constraints --node nodeforge --power-budget 400
nodeau scheduling constraints --node nodeforge --deny-device GPU-c080d9be-…
nodeau scheduling constraints --node nodeforge --clear
```

| Flag | What it bounds |
|---|---|
| `--power-budget <W>` | The most **predicted** power Nodeau may have running on this machine |
| `--idle-watts <W>` | What the machine draws with nothing running, so waking it counts as a cost |
| `--max-accelerators <n>` | The most cards one workload may use here |
| `--deny-device <uuid>` | Withhold one card from scheduling; it stays visible |
| `--allow-device <uuid>` | Return a withheld card |
| `--clear` | Remove every constraint from this machine |

:::important A scheduling power budget is not a physical cap
It changes where work goes. It changes nothing about what any card draws, needs
no privilege, and works on hardware where power-limit mutation is unsupported.
For the physical setting see [power limits](/docs/power/).
:::

## What Nodeau will not do

- **It does not move a running workload.** Placement decides once and then holds.
  A workload on a machine whose telemetry has gone stale is **held**, not moved,
  and that hold has no timeout — giving up after N minutes would be automatic
  failover acquired by accident.
- **It does not fail over, migrate or reschedule.** If a card genuinely leaves a
  machine, Nodeau **withdraws** the workload that can no longer start and keeps
  the service, which starts again when a placement is possible. That is not
  failover.
- **It does not re-split a healthy workload** for a better fit.
- **It does not share a card.** No time-slicing, no MIG, no preemption, no
  priority queues.

`nodeau restart <name>` is how you ask for a workload to be placed again.

## Drain

```bash
nodeau scheduling drain --node nodeau-c
```

Nothing running is stopped, moved or disturbed. Nodeau stops choosing that
machine for anything new, and says so when it explains a placement. To empty the
machine, drain it and then stop what you want gone — `nodeau ps` shows what is on
it.

```bash
nodeau scheduling undrain --node nodeau-c
```

Undraining does not bring anything back.

## Reason codes {#reason-codes}

Every refusal and every scheduling decision carries a machine-readable code and
a readable explanation. The same code means the same thing in the CLI, in
`--json`, and in the dashboard.

### The model

| Code | Meaning | Usually |
|---|---|---|
| `MODEL_NOT_INSTALLED` | The weights are not on the machine that would run them | `nodeau model install <id>` |
| `MODEL_VERIFICATION_PENDING` | Present; the digest is still being established | Wait — it clears by itself |
| `MODEL_ARTIFACT_INVALID` | The file on disk is not what was pinned | Re-download it |
| `MODEL_UNVERIFIED` | Present, right size, digest not established | `nodeau model verify <id>` |
| `MODEL_UNSUPPORTED` | No profile for this model, or none for this configuration on this hardware | Change the configuration, or choose another model |

### The GPU

| Code | Meaning | Usually |
|---|---|---|
| `GPU_TOO_SMALL` | The arithmetic says it will not fit | Smaller context, or a smaller model |
| `GPU_ALREADY_ALLOCATED` | A whole GPU is reserved by another workload | `nodeau ps`, then wait or stop something |
| `GPU_UNAVAILABLE` | No healthy GPU was reported at all | `nodeau doctor` |
| `ACCELERATOR_SET_UNSUPPORTED` | The **shape** of the request cannot be run — not a memory problem | Ask for a different set of cards |
| `HARDWARE_STALE` | A GPU report is too old to be evidence about the card now | Check the machine is reporting |
| `MACHINE_DRAINING` | The machine is deliberately not taking new work | `nodeau scheduling undrain` |

### The task

Three codes rather than one, because the three sources of capability truth fail
for different reasons and are fixed by different things.

| Code | Meaning |
|---|---|
| `TASK_UNKNOWN` | Not a word Nodeau knows. A typo, or a manifest for a newer Nodeau |
| `MODEL_CAPABILITY_UNSUPPORTED` | These weights cannot do this task |
| `RUNTIME_CAPABILITY_UNSUPPORTED` | This engine cannot drive this task |
| `PLATFORM_CAPABILITY_UNSUPPORTED` | The runtime installed on **this machine** was not built with it |

### Being patient, and being gone

| Code | Meaning |
|---|---|
| `WORKLOAD_STARTING` | It is coming up. Not a refusal |
| `QUEUED` | Evaluated, correct, waiting for a card to free |
| `WORKLOAD_STOPPED` | Nodeau has a record and the machine does not have the process. Holds nothing |
| `WORKLOAD_SUPERSEDED` | Decided at a placement generation the fleet has moved past |

### Entitlement

| Code | Meaning | Remedy belongs to |
|---|---|---|
| `FEATURE_NOT_ENTITLED` | The plan does not grant the capability | A purchase |
| `LIMIT_REACHED` | The capability is granted and a numeric limit is spent | A purchase |
| `ENTITLEMENT_INVALID` | An entitlement exists and cannot be accepted | `nodeau plan refresh` |

### Governance

| Code | Meaning | Remedy belongs to |
|---|---|---|
| `QUOTA_EXCEEDED` | Your organisation's own policy, inside what the plan grants | A colleague |
| `POOL_RESTRICTED` | A GPU pool or fleet group left no eligible machine | A colleague |
| `MODEL_NOT_PERMITTED` | An organisation's model policy disallows this model | A colleague |
| `BATCH_QUOTA_EXHAUSTED` | The organisation's batch allowance is spent | A colleague |

### Batch

| Code | Meaning |
|---|---|
| `BATCH_INPUT_INVALID` | The submitted records are missing, unreadable, or do not match the digest recorded at submission |
| `BATCH_FAILED` | An attempt failed for an infrastructure reason and no attempts remain |
| `BATCH_WORKER_UNAVAILABLE` | The worker was placed and its container never started |
| `BATCH_CANCELLED` | You asked for it to stop |

### Everything else

| Code | Meaning |
|---|---|
| `OK` | Nothing is wrong |
| `INTERNAL_ERROR` | Nodeau itself failed. Every other code above is Nodeau working correctly |
| `UNKNOWN` | A reason this build has not been taught about. The original text is preserved rather than blanked |

## Suggested actions

Alongside the code, every explanation carries a machine-readable suggested
action, so the CLI and the dashboard render the same remedy without
pattern-matching prose: `NONE`, `WAIT`, `INSTALL_MODEL`, `REINSTALL_MODEL`,
`VERIFY_MODEL`, `CHOOSE_SMALLER_MODEL`, `REDUCE_CONTEXT`,
`WAIT_OR_STOP_WORKLOAD`, `CHECK_NODE`, `UNDRAIN_MACHINE`, `REVIEW_ENTITLEMENT`,
`REVIEW_QUOTA`, `REVIEW_POLICY`, `FIX_INPUT`, `RUN_DOCTOR`, `UPDATE_RUNTIME`,
`RUN`, `CONTACT_SUPPORT`.

`REVIEW_ENTITLEMENT` is deliberately not "upgrade": which plan, and whether to
sell you one, is not the scheduler's call.
