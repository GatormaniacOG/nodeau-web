---
title: Before it runs: previews, the safety reserve and calibration
heading: Before it runs
nav: Previews and calibration
description: See where a model would run and what it would cost before anything starts, set the safety reserve aside for one run, and measure what your own machine needs to keep for itself.
lede: Ask Nodeau where a model would run, what it would cost and why, before anything starts. If the answer is that Nodeau's reserve is in the way, you can measure what your machine really needs to keep for itself and decide what to do about it.
---

## Preview a run {#preview-a-run}

```bash
nodeau run qwen3.5-4b-q4km --explain
```

`--explain` asks Nodeau the same question a run would ask, and shows you the
answer. It **starts nothing and downloads nothing**. You get:

- **where** it would run: the machine and the accelerator Nodeau would choose,
- what the model is **expected to need**,
- what's **available** right now,
- the **reserve** Nodeau keeps for the system, and whether that figure was
  *calibrated on this machine* or is *Nodeau's conservative default*,
- the **headroom** left over, or how short it is,
- **the arithmetic**, term by term, with where each figure came from,
- and in a fleet, **every other machine** with its reason.

It takes the same flags as the run itself (`--context-size`, `--parallel`,
`--task`, `--gpus`, `--mode` and the two risk flags further down), so what you
preview is the run you're about to make. `--json` prints the whole answer for a
script.

| Exit code | Means |
|---|---|
| `0` | It would run |
| `3` | It would not run as asked, and that stays true until something changes |
| `4` | Not yet: it's waiting on something that clears by itself, like a fresh report from a machine or a model whose checksum is still being verified |

Here's an illustration of a preview on a 36 GB Mac with a browser and a handful
of other apps open, with the long explanation line shortened:

```text
Where Nodeau would run qwen3.5-4b-q4km

  Nodeau would not run it now: Qwen3.5-4B Q4_K_M at contextSize=4096 parallel=1 is predicted to need 4,406 MiB including the 256 MiB admission margin. …

  Available to Nodeau now                                                    1,370 MiB
    Memory free or reclaimable right now                                     7,120 MiB  observed now
    − Reserve Nodeau keeps for the system                                    5,750 MiB  Nodeau's conservative default
        (of which 2,048 MiB is a floor that is never given away)
    · Accelerator ceiling: 28,753 MiB (the most the GPU will use for models, a fixed property of this Mac; a limit, not memory in hand)
    · In use by the system and other applications: 29,744 MiB (everything not reclaimable right now; Nodeau does not look at which applications)

  Expected cost                                                              4,406 MiB  conservative estimate
    Model weights                                                            2,614 MiB  estimated
    Context (KV cache) for the context size and parallel requests asked for    512 MiB  estimated
    Runtime overhead (Metal pipelines and compute buffers)                     256 MiB  estimated
    Prediction margin                                                          256 MiB  Nodeau policy
    Allowance for hardware nobody has measured this model on                   768 MiB  Nodeau policy

  Remaining headroom                                                        -3,036 MiB  short

  Admission: HELD BACK by Nodeau's safety margins, not by the hardware
  Qwen3.5-4B Q4_K_M at contextSize=4096 parallel=1 is predicted to need 4,406 MiB including the 256 MiB admission margin. …

  To run it anyway on macbook only, for this run only:
    nodeau run qwen3.5-4b-q4km --spend-safety-reserve
  The reserve would go from 5,750 MiB to 2,048 MiB (the 2,048 MiB floor stays), leaving 666 MiB.

  This is a preview, not a reservation: running it asks again.
```

The model needs 4,406 MiB and 1,370 MiB is available, so it's 3,036 MiB short.
The Mac has the memory, though: what's in the way is the 5,750 MiB Nodeau keeps
for the system, and only the part above its floor. That's why the preview
offers a one-run override, and it exits `3`. On a Mac, what's free moves with
every app you open or close, so the same preview can say something different in
ten minutes.

`--explain` is for a run you haven't made yet. Given a name that's already
taken, it points you at `nodeau ps` and `nodeau service explain <name>`, which
show the decision Nodeau recorded (on a Mac on its own, `nodeau ps`).

### Reading the arithmetic {#reading-the-arithmetic}

**Available to Nodeau now** is what the machine can give a model, less what's
already in use, less the reserve:

- On a GPU card, that's the GPU memory the driver can address, minus what the
  desktop and other programs on the card use, minus what other Nodeau workloads
  on that card were charged.
- On a Mac, it's the memory free or reclaimable right now, minus anything Nodeau
  is still loading. The accelerator ceiling is shown as a limit rather than
  memory in hand, and so is everything else the system and your apps hold.

**Expected cost** is the model's weights, its context (the KV cache for the
context size and parallel requests you asked for) and the runtime's own
overhead, then Nodeau's margins: a 256 MiB prediction margin, and an allowance
for hardware nobody has measured this model on, only when nobody has.

Every figure carries a label saying where it came from:

| Label | Means |
|---|---|
| `measured` | Observed running this model in this configuration, on the same kind of hardware in Nodeau's catalog, or on this very machine if you adopted a [model measurement](#measure-one-model-on-a-mac) |
| `estimated` | Worked out from the model's architecture and file size |
| `observed now` | Read from the machine just now. It moves |
| `Nodeau policy` | A margin Nodeau keeps on purpose |
| `calibrated on this machine` | A reserve you measured with `nodeau benchmark` and adopted |
| `Nodeau's conservative default` | The reserve Nodeau uses until you adopt one of your own |

The word beside the expected cost says how much evidence stands behind it:
`high` (measured on this machine, for exactly this configuration, and adopted),
`medium` (measured on the same kind of hardware) or `conservative estimate`.
It's always a word, never a percentage, because none of this evidence supports
a number like that.

### Every run says where it's going {#every-run-says-where}

An ordinary `nodeau run` now prints one line before it starts the model:

```text
  Will run on nodeau-c · NVIDIA GeForce RTX 3080 — expected cost 4.3 GiB of 9.1 GiB GPU memory available, 4.8 GiB left (conservative estimate)
```

**A preview isn't a reservation.** Another workload can start in between, so
when the run starts, the machine checks the fit again from what's true at that
moment, and that answer is the one that counts.

In a fleet, previews come from the machine that runs your fleet, so they need
that machine to be on a Nodeau with previews. Until it is, `--explain` says so
and stops, and an ordinary run starts without the line.

## The safety reserve {#the-safety-reserve}

Nodeau keeps some memory back so the rest of your system has room to work: a
spike in some other program shouldn't turn into an out-of-memory kill of your
model, or of your desktop. The reserve has two parts:

- a **floor**, which is never given away,
- and the part **above the floor**, which you can set aside for one run.

| | The reserve | Its floor | Above the floor |
|---|---|---|---|
| An NVIDIA card | 512 MiB | None: the card's own memory and what's already on it are the hard limit | All 512 MiB |
| A Mac | The larger of 2,048 MiB and 20% of the Mac's GPU working-set ceiling | 2,048 MiB | Everything above 2,048 MiB |

On the Mac above, the ceiling is 28,753 MiB, so the reserve is 5,750 MiB: a
2,048 MiB floor and 3,702 MiB above it.

Those are Nodeau's conservative defaults. If you
[measure your machine](#measure-your-machine) and adopt the result, the reserve
is the measured figure instead. On a Mac it never goes below the 2,048 MiB
floor, and nothing you do lowers the floor itself.

## Set the reserve aside for one run {#one-run-override}

When the reserve is the only thing in the way, the preview says so and gives
you the command:

```bash
nodeau run qwen3.5-4b-q4km --spend-safety-reserve
```

`--spend-safety-reserve` means: **for this run only, on the one machine the
preview showed**, let the workload use the part of the reserve above its floor.
All of it on an NVIDIA card. Everything above 2,048 MiB on a Mac.

Before anything starts, `nodeau run` shows you the new arithmetic and asks once:

```text
  This run uses a reduced safety margin on macbook (Apple M3 Pro):
    reserve              5,750 MiB → 2,048 MiB (the 2,048 MiB floor stays)
    expected headroom    666 MiB
  It applies to this workload on macbook only and changes no setting. Other applications have less room while it runs; if memory turns out tighter than predicted the model may fail to load or be stopped.
```

`--yes` answers for you. Here's exactly what you're agreeing to:

- **One workload, one machine.** The override lasts as long as that workload
  runs. No setting on the machine changes, and stopping the workload leaves
  nothing behind.
- **The machine you saw.** If, by the time the run starts, Nodeau would place it
  somewhere else, the run is refused rather than moved, with
  `OVERRIDE_FOR_ANOTHER_MACHINE`: *"The reduced safety reserve was accepted for a
  different machine."* Preview again and decide afresh.
- **The floor stays.** On a Mac, 2,048 MiB is always kept for the system.
- **A new run, and one you were shown.** The override is for a workload that
  doesn't exist yet. For a name that's already taken, `nodeau run` refuses
  (exit `2`): stop it first with `nodeau stop <name>`, then run it again with the
  override. And if Nodeau can't show you where the run would go, it starts
  nothing: exit `4` when the preview didn't come back (try again in a moment),
  exit `3` when the machine that runs your fleet predates previews (run it
  without the flag, or update that machine first). A plain run goes on as
  before in both cases.
- **Less room for everything else.** Other applications have less room while the
  model runs. On a Mac that can mean memory pressure and swapping; on a card that
  also drives your display, an out-of-memory kill takes the display with it.
- **A risk, not a measurement.** A run under an override never counts as
  evidence that the smaller reserve is safe, and it never changes the reserve
  Nodeau uses next time. Only [a measurement you adopt](#measure-your-machine)
  does that.

The preview offers the override only where setting the reserve aside would
actually free the memory. On a Mac whose GPU working-set ceiling is the limit,
it wouldn't, so none is offered.

When the hardware itself is too small, so the model wouldn't fit even with the
reserve at its floor, there's nothing to set aside. The preview offers no
override, Nodeau accepts none, and it says why:

```text
  No override can help: the hardware does not have enough safely usable memory for this, even with Nodeau's reserve at its floor.
```

A smaller context, fewer parallel requests or a smaller model is the way
forward then.

The other risk flag, `--accept-estimate-risk`, means what it always has: drop
only the extra allowance Nodeau adds for hardware nobody has measured this model
on. The preview's suggested command includes whichever of the two the gap needs.
Batch jobs always run with the full margins. See
[accepting the risk yourself](/docs/scheduling/#accepting-the-risk-yourself).

### From app.nodeau.ai {#from-app-nodeau-ai}

The Run page in app.nodeau.ai previews too, as part of running models from the
browser, which comes with Home Pro and Business.

1. Choose the model and the task. Set **Context size** and **Parallel requests**
   if you want something other than the defaults; both change what the model
   needs.
2. Press **Preview**. The answer shows **Will run on** with the machine and
   accelerator (or the **Closest candidate**, when nothing would run as asked),
   the expected cost, what's available, the reserve with a **Calibrated** or
   **Default reserve** badge, and what's left over or how short it is. **Show the
   arithmetic** opens the terms, and **Other machines** lists every other
   machine with its reason.
3. Where the reserve is the only thing in the way, the answer offers to run it
   on that machine with a reduced safety reserve, with a button that names the
   machine. It shows the reserve now, the reserve for this run, the floor that
   stays and the headroom, and nothing starts until you press **Run with the
   reduced reserve**. As in the CLI, that's for a new name: for one the fleet
   already has, the page asks you to stop it first, then run it again with the
   override.

A preview isn't a reservation here either: the machine checks the fit again when
it starts the model. A machine's page under Fleet shows each accelerator's
reserve and whether it's calibrated, and a Mac's unified memory. Measuring and
adopting happen on the machine itself, with the commands below, never from the
browser.

If your fleet's machines run a Nodeau without previews, the page says so and
**Run** works the way it always has.

## Measure your machine {#measure-your-machine}

Nodeau's default reserve is conservative because it was set without knowing
your machine. `nodeau benchmark` measures it.

```bash
nodeau benchmark            # measure, and record what it found
nodeau benchmark status     # what's measured, what's in use, and until when
nodeau benchmark adopt      # use the newest recommendation, or name one by its ID
nodeau benchmark reset      # back to Nodeau's conservative default
```

**Nothing changes until you adopt.** A benchmark records what it found, with a
recommendation when it can justify one, and the reserve Nodeau uses stays
exactly as it was until you run `nodeau benchmark adopt`. `reset` puts the
default back whenever you like, and the records stay for `status` to show.

A recommendation's confidence is a word: `high`, `medium` or `low`. A
`low` result comes from a machine that was too busy for a clear answer, and it
can't lower the reserve below the default; run it again when things are
quieter. A measurement can also say your machine needs **more** than the default
keeps. Adopting it then raises the reserve, and `nodeau doctor` points it out.

`adopt` checks the record against the machine as it is now: the same hardware,
the same operating system build or driver, not expired, and never below the
floor. A record that doesn't match is refused, and nothing changes.

| Flag | Meaning |
|---|---|
| `--quick` | Record a quick baseline only: watch for a few seconds, use no memory, recommend nothing |
| `--duration <d>` | Linux: how long to watch each GPU (`10m` by default, `11m` with `--machine`) |
| `--machine <name>` | Linux, on the machine that runs your fleet: measure another Linux machine from its own reports. A Mac refuses it |
| `--json` | Print the evidence record |
| `--yes`, `-y` | Don't ask before measuring |

A measurement describes your machine at the moment it was taken. It helps
Nodeau decide, and what fits on a Mac still depends on what else is open when
you ask.

### On a Mac {#benchmark-on-a-mac}

On a Mac, `nodeau benchmark` finds out how much memory the Mac needs left alone
before macOS starts to feel the pressure, by approaching that point gently from
below.

- It uses memory in small steps, in a separate process, and stops at the
  **first** sign of memory pressure macOS reports: a change in the pressure
  level, any swapping out, or the memory compressor growing.
- It also stops at its cap: it never takes a step that would leave less than
  the 2,048 MiB floor, and it takes about 90 seconds at most.
- Then it gives everything back and waits for the memory to return before it
  records anything.
- It never closes or touches other applications, and it changes no system
  setting: not swap, not wired memory, not sleep.

Close large applications **before** you start, not during. If the memory your
other apps use changes during the measurement by more than the Mac moves when
left alone (an app opened, quit or grew while it ran), it stops, recommends
nothing and asks you to run it again when the machine is quiet. Afterwards, apps may need a
moment to reload files they had cached.

It only measures when the Mac is quiet enough for the answer to mean something.
If Nodeau models are running on the Mac, if macOS already reports memory
pressure, if the system was swapping while left alone, if free memory moved too
much on its own, or if too little is free to measure, it says which, changes
nothing and exits `4`. Stop your models or close something, and try again.
Ctrl-C stops it at any point and hands everything back, with nothing recorded.

In a fleet, a Mac's adopted reserve travels with its own report, so the machine
that runs your fleet plans against the same figure the Mac does.

### On Linux {#benchmark-on-linux}

On Linux, `nodeau benchmark` **watches** each GPU's memory for a while, ten
minutes unless you choose otherwise with `--duration` (eleven with `--machine`,
because another machine's reports arrive about every 30 seconds and they have
to cover ten minutes), and allocates nothing.

- **Every GPU figure is the card's total**: every program on the card is in it,
  and it's labelled that way. Nodeau's agent runs without access to the host's
  processes, by design, so neither admission nor the benchmark attributes a
  card's memory to individual programs.
- A card that something was computing on during the window, a Nodeau model
  included, is reported busy and gets no recommendation.
- Host memory is recorded and shown, and that's all: admission on Linux plans
  GPU memory.

A Linux reserve is adopted with the fleet, so measure and adopt on the machine
that runs your fleet, naming the machine. `--machine` reads that machine's own
reports, and it's Linux only: on a Mac, every benchmark command refuses it.

```bash
nodeau benchmark --machine nodeau-c
nodeau benchmark adopt
nodeau benchmark status --machine nodeau-c
```

On a machine on its own, that's the machine you're on, and `--machine` isn't
needed.

With `--machine`, each card needs at least five fresh reports from its machine
during the window. A machine that stopped reporting repeats its last figure, and
a repeated figure isn't a quiet card, so that card gets no recommendation and
the record says why. A card's swing belongs to the machine around it, so
`adopt` refuses a card's record if the card is now in a different machine from
the one that measured it; measure it again there.

### How long a calibration lasts {#how-long-it-lasts}

An adopted calibration lasts **30 days**. Before then it's set aside by itself,
and Nodeau goes back to its conservative default and says why, if:

- macOS is updated, on a Mac,
- the NVIDIA driver changes, on Linux,
- the hardware changes,
- or the Mac's GPU working-set ceiling changes.

A calibration belongs to the hardware it measured. It's never used for another
machine, even an identical one, and two identical machines can calibrate
differently.

### What doctor says {#doctor}

`nodeau doctor` reports each machine's calibration: the reserve in use, whether
it's calibrated or the default, and until when.

| Code | Means | Do |
|---|---|---|
| `CALIBRATION_RECOMMENDATION_PENDING` | A measured recommendation is waiting and the default is in use. A warning when the measurement says the machine needs more than the default keeps | `nodeau benchmark adopt <ID>`, if you want it |
| `CALIBRATION_EXPIRED` | The adopted calibration reached its 30 days, and the default is back in use | `nodeau benchmark` to measure again |
| `CALIBRATION_INVALIDATED` | The adopted calibration no longer matches the machine (a new operating system build, driver or hardware), and the default is in use | `nodeau benchmark` to measure again |

`nodeau service explain <name>` also says where a running workload's reserve
came from, and so does the [Playground](/docs/playground/#where-the-answer-came-from).

## Measure one model on a Mac {#measure-one-model-on-a-mac}

```bash
nodeau benchmark model qwen3.5-4b-q4km --context-size 4096 --parallel 1
nodeau benchmark adopt <ID>
```

On a Mac, `nodeau benchmark model` measures the memory one model actually holds,
at one configuration. It starts the model the ordinary way, through Nodeau's own
fit check, so a model that doesn't fit isn't measured. Then it sends one short
request, records the most memory the model held, and stops it. The model needs
to be installed first.

It doesn't measure a vision model. A model with an image encoder uses that
encoder's memory only when it sees an image, and the measurement sends text, so
it would read low. Nodeau's own figure for it, which includes the encoder, stays
in use.

The figure is the model process's peak footprint plus the model's files, so it
can come out **higher than the truth, never lower**, and it may well read higher
than Nodeau's own prediction. `nodeau benchmark status` shows the two side by
side.

Adopting it applies to **exactly** that model file, runtime, task, context size
and parallelism, on this Mac, for 90 days or until macOS is updated. Anything
else is planned the usual way. A Mac keeps at most 16 adopted model
measurements; adopting another drops the oldest, and `adopt` names what it
dropped.

| Flag | Default | Meaning |
|---|---|---|
| `--context-size <n>` | `4096` | Context window to measure at |
| `--parallel <n>` | `1` | Concurrent sequences to measure at |
| `--task <task>` | the model's own | `chat`, `embed` or `rerank` |
| `--timeout <n>` | `300` | Seconds to wait for the model to start serving |
| `--json` | off | Print the evidence record |
| `--yes`, `-y` | off | Don't ask before starting the model |

On Linux it explains why it doesn't apply and stops: a card's only figure is its
total, and Nodeau's catalog already carries measured rows for the cards they
were measured on. `nodeau benchmark` still calibrates each card's reserve.

## On first install {#on-first-install}

The first `nodeau install` on a machine records a quick baseline of its memory.
It only watches, uses no memory and changes nothing, and an install never fails
because of it. When the machine is quiet, `nodeau benchmark` takes the full
measurement.

## On every plan {#on-every-plan}

`--explain`, `nodeau benchmark` and `nodeau doctor` work on every plan, Home
included. Previewing in app.nodeau.ai comes with running models from there,
which is Home Pro and Business.
