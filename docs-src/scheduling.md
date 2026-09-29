---
title: How Nodeau decides where work runs
heading: How Nodeau decides
nav: How Nodeau decides
description: How Nodeau decides whether a workload can run and where it should go: the VRAM arithmetic, safety margins, scheduling modes, holds, drains and every reason code.
lede: Two decisions, made in order. Admission asks whether a workload can safely run. Placement asks where. Both are written down, and you can read either one back whenever you like.
---

## Admission comes first

Before anything is created, Nodeau predicts the peak GPU memory a workload will
need and compares it with what a card can really offer. If it won't fit, the
answer comes back **before anything starts**, with the arithmetic and something
you can do about it. You find out in a second, not sixty seconds into loading.

```bash
nodeau service explain qwen-local
```

That prints the decision exactly as the controller recorded it. It reads the
record rather than redoing the sums, so there's only ever one answer: the one
the platform acted on.

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
| Safety reserve | 512 MiB | Always, on every card. The room Nodeau keeps for whatever else is on it |
| Prediction margin | 256 MiB | Always. The error bar on the prediction |
| Estimate margin | 768 MiB | Only when the configuration hasn't been measured on hardware like yours |
| Multi-device allowance | 128 MiB per device | Only for a workload spanning several cards |

:::warning Every card has to fit its own share
A workload spread over two cards needs each card to hold its part, plus its own
copy of the per-device overhead. Two 8 GB cards give you two 8 GB cards, and the
smaller card is the one that fills first. A pair whose total looks roomy can
still have one card that can't take its share, and Nodeau checks each card on
its own for exactly that reason.
:::

### Estimated and measured {#estimated-and-measured}

When Nodeau has a measurement for this model, in this configuration, on hardware
like yours, it uses the measurement. When it doesn't, it works out a figure from
the model's architecture and file size, adds the 768 MiB estimate margin, and
**labels the decision estimated**. You always know which one you got.

```bash
nodeau model info <model>    # which configurations have actually been measured
```

An empty measurement list is a real answer. It means every decision about that
model is worked out from its shape rather than observed. Each row also says
whether its figure counted the whole device or one process, because those are
different quantities.

### Accepting the risk yourself {#accepting-the-risk-yourself}

Two flags, on `nodeau run` and `nodeau model qualify`. Both are explicit, both
apply to one workload, and both are recorded permanently.

| Flag | What you're accepting |
|---|---|
| `--accept-estimate-risk` | Drop only the extra margin for hardware nobody has measured this on. You accept that it might not fit |
| `--spend-safety-reserve` | Let this workload use the memory Nodeau keeps back for everything else on the card. If that GPU also drives your display, an out-of-memory kill takes the display with it |

That's the whole list, and each one is a margin rather than a check. Model
verification, your plan, stale hardware reports and a card that's already busy
are always checked, whichever flags you pass. Batch jobs run with the full
margins.

Nodeau spends a margin only when you ask it to. A qualifier that quietly shrank
the margin until a model fit would always succeed and prove nothing, so the
choice stays with you.

### Ordering

A **capability** answer comes before the capacity arithmetic, so *"this model
can't embed"* reaches you as exactly that, never as *"insufficient VRAM"*.

Your organisation's [limits and policies](/docs/governance/) narrow the
candidates **before** any capacity arithmetic too. A workload refused by a quota
is told it was a quota, in your organisation's own terms, and never as though it
didn't fit.

## Placement {#placement}

Among the candidates admission accepted, placement chooses one. It tells you
what it chose and what each alternative would have cost.

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
    predicted 80.4 output tokens/s   confidence family
    predicted 166 W

  NOT SELECTED
    nodeau-c     NVIDIA GeForce RTX 3080    predicted 114.0/s

  Hardware data 2026-09-hw.3, decided 2026-09-28T01:22:11Z

  Nodeau does not move a workload that is already running. Restart it to re-place it.
```

That's a real one. The RTX 3080 is predicted to be faster for this model, and
the workload stays on the RTX 5060 Ti anyway, because it's already running there
and still fits. More on that [below](#running-work-stays-put).

### What it weighs

- Which machines and cards are **eligible**: healthy, reporting fresh telemetry,
  not drained, allowed by your policies, and big enough.
- Whether the machine already has the model's **weights**, verified.
- A **prediction** of how the workload will perform there, from observations
  collected on your own machines.
- The **scheduling mode**.
- Any **hard constraints** you've set on that machine.

### Scheduling modes {#scheduling-modes}

```bash
nodeau scheduling mode                      # show
nodeau scheduling mode balanced             # set for the fleet
nodeau scheduling mode performance --node nodeau-c   # set for one machine
```

| Mode | Means |
|---|---|
| `efficiency` | The most work per unit of energy, and never much slower |
| `balanced` | Fastest, while staying close to the best efficiency. **The default** |
| `performance` | Fastest, whatever it costs |

A mode change affects **new placements only**. Holds and stickiness run before
any scorer, so changing the mode leaves everything that's running exactly where
it is.

There's also `legacy`, the original tightest-safe-fit scorer, kept as an escape
hatch. It's set at install time with `nodeau install --scheduling-mode legacy`,
and `nodeau scheduling mode` shows it only when it's in force.

:::note Arithmetic you can check
Nodeau's predictions are medians, ratios and linear interpolation over
observations collected where your traffic is: on your own machines. There's no
learned model in the loop. What you get is a ranking and a stated confidence,
and `placement explain` shows its working. It doesn't promise an exact figure or
a particular energy saving.
:::

### Hard constraints {#hard-constraints}

Constraints are **hard**: Nodeau declines to place work rather than exceed one,
and no mode can score its way around them.

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
| `--deny-device <uuid>` | Keep one card out of scheduling; it stays visible |
| `--allow-device <uuid>` | Bring a withheld card back |
| `--clear` | Remove every constraint from this machine |

:::important A scheduling power budget steers work; a power limit caps a card
A budget changes where work goes. It changes nothing about what any card draws,
needs no privileges, and works on any hardware. To cap what a card itself may
draw, see [power limits](/docs/power/).
:::

## Running work stays put {#running-work-stays-put}

These rules run before any scoring, and they're what make Nodeau calm to live
with:

- **A running workload stays where it is.** Placement decides once and then
  holds. A better score somewhere else is never a reason to restart something
  that's working.
- **A machine that goes quiet keeps its work.** If a machine stops reporting,
  what it's running is **held** in place rather than moved, for as long as it
  takes. Nodeau doesn't give up on a machine after a few minutes and move its
  work, because moving work it can't see is how a network blip turns into an
  outage.
- **A card that has really gone releases its work.** When a machine's fresh
  report says a card is no longer there, Nodeau withdraws the workload that can
  no longer start and keeps the service. The service starts again as soon as
  there's somewhere it fits.
- **A healthy split stays as it is.** A workload spread across cards keeps its
  split, even if another split would fit better later.
- **One workload per card.** A GPU belongs to one workload at a time, so nothing
  competes for its memory while it runs.

To have Nodeau place a workload again, restart it: `nodeau restart <name>`.

## Drain

```bash
nodeau scheduling drain --node nodeau-c
```

Everything running on the machine carries on exactly as it was. Nodeau stops
choosing that machine for anything new, and says so when it explains a
placement. To empty the machine, drain it and then stop what you want gone;
`nodeau ps` shows what's on it.

```bash
nodeau scheduling undrain --node nodeau-c
```

Undraining puts the machine back in the running for new work and leaves every
workload where it is now.

## Reason codes {#reason-codes}

Every refusal and every scheduling decision carries a machine-readable code and
a plain explanation. The same code means the same thing in the CLI, in `--json`
and in the dashboard.

### The model

| Code | Meaning | Usually |
|---|---|---|
| `MODEL_NOT_INSTALLED` | The weights aren't on the machine that would run them | `nodeau model install <id>` |
| `MODEL_VERIFICATION_PENDING` | The file is there and its digest is still being checked | Wait. It clears by itself |
| `MODEL_ARTIFACT_INVALID` | The file on disk isn't the one that was pinned (the wrong size, or damaged since it arrived), or the cache couldn't be read at all | For a catalog model, `nodeau model install <id>` sets the bad copy aside and fetches a good one. If the cache couldn't be read, start with `nodeau doctor` |
| `MODEL_UNVERIFIED` | The file is there and the right size, and its digest isn't established yet | `nodeau model verify <id>` |
| `MODEL_UNSUPPORTED` | No profile for this model, or none for this configuration on this hardware | Change the configuration, or choose another model |

### The GPU

| Code | Meaning | Usually |
|---|---|---|
| `GPU_TOO_SMALL` | The arithmetic says it won't fit | A smaller context, or a smaller model |
| `GPU_ALREADY_ALLOCATED` | Another workload holds the whole GPU | `nodeau ps`, then wait or stop something |
| `GPU_UNAVAILABLE` | No healthy GPU was reported | `nodeau doctor` |
| `ACCELERATOR_SET_UNSUPPORTED` | The **shape** of the request can't be run, which is different from a memory problem | Ask for a different set of cards |
| `HARDWARE_STALE` | A GPU report is too old to count as evidence about the card now | Check the machine is reporting |
| `MACHINE_DRAINING` | The machine is deliberately not taking new work | `nodeau scheduling undrain` |

### The task

Four codes, because the task can be refused for four different reasons, and
each is fixed by something different.

| Code | Meaning |
|---|---|
| `TASK_UNKNOWN` | Not a task Nodeau knows. A typo, or a manifest written for a newer Nodeau |
| `MODEL_CAPABILITY_UNSUPPORTED` | These weights can't do this task |
| `RUNTIME_CAPABILITY_UNSUPPORTED` | This engine can't drive this task |
| `PLATFORM_CAPABILITY_UNSUPPORTED` | The runtime installed on **this machine** wasn't built with it |

### Waiting, starting and stopped

| Code | Meaning |
|---|---|
| `WORKLOAD_STARTING` | It's coming up. This one isn't a refusal |
| `QUEUED` | Evaluated, correct, and waiting for a card to free up |
| `WORKLOAD_STOPPED` | Nodeau has a record of it and the machine has no process for it. It holds nothing |
| `WORKLOAD_SUPERSEDED` | Decided at a placement generation the fleet has since moved past |

### Your plan

| Code | Meaning | Who can change it |
|---|---|---|
| `FEATURE_NOT_ENTITLED` | Your plan doesn't include this capability | A plan change |
| `LIMIT_REACHED` | Your plan includes it, and one of its numeric limits is used up | A plan change |
| `ENTITLEMENT_INVALID` | There's an entitlement and it can't be accepted | `nodeau plan refresh` |

### Your organisation's policies

| Code | Meaning | Who can change it |
|---|---|---|
| `QUOTA_EXCEEDED` | Your organisation's own quota, set inside what the plan allows | A colleague who manages the policy |
| `POOL_RESTRICTED` | A GPU pool or fleet group left no eligible machine | A colleague who manages the policy |
| `MODEL_NOT_PERMITTED` | Your organisation's model policy doesn't include this model | A colleague who manages the policy |
| `BATCH_QUOTA_EXHAUSTED` | The organisation's batch allowance is used up | A colleague who manages the policy |

### Batch

| Code | Meaning |
|---|---|
| `BATCH_INPUT_INVALID` | The submitted records are missing, unreadable, or don't match the digest recorded at submission |
| `BATCH_FAILED` | An attempt failed for an infrastructure reason and no attempts remain |
| `BATCH_WORKER_UNAVAILABLE` | The worker was placed and its container never started |
| `BATCH_CANCELLED` | You asked for it to stop |

### Everything else

| Code | Meaning |
|---|---|
| `OK` | All good |
| `INTERNAL_ERROR` | Nodeau itself failed. Every other code on this page is Nodeau working as designed |
| `UNKNOWN` | A reason this build hasn't been taught about. The original text is kept, so you still see what happened |

## Suggested actions

Next to the code, every explanation carries a machine-readable suggested action,
so the CLI and the dashboard show the same remedy without guessing from the
prose: `WAIT`, `INSTALL_MODEL`, `REINSTALL_MODEL`, `VERIFY_MODEL`,
`CHOOSE_SMALLER_MODEL`, `REDUCE_CONTEXT`, `WAIT_OR_STOP_WORKLOAD`, `CHECK_NODE`,
`UNDRAIN_MACHINE`, `REVIEW_ENTITLEMENT`, `REVIEW_QUOTA`, `REVIEW_POLICY`,
`FIX_INPUT`, `RUN_DOCTOR`, `UPDATE_RUNTIME`, `RUN` and `CONTACT_SUPPORT`. An
empty action means there's nothing for you to do.

`REVIEW_ENTITLEMENT` says "review" on purpose. Which plan suits you is your call
to make, not the scheduler's.
