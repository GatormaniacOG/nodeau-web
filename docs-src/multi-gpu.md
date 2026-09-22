---
title: Using several GPUs in one machine
heading: Several GPUs in one machine
nav: Several GPUs in one machine
description: The two different things people mean by multi-GPU — one model split across cards for capacity, and independent workers on separate cards for throughput — with measured numbers.
lede: Two completely different things share the phrase "multi-GPU", and confusing them costs throughput rather than raising an error. This page separates them.
---

:::linux
Both modes are Linux with NVIDIA GPUs, in **one machine**. A Mac has one
integrated GPU. Nothing here spans machines: Nodeau does not shard a model across
a network.
:::

Needs `FeatureMultiGPU` — **Home Pro** (up to 2 cards in any one machine) or
**Business** (unlimited).

## The two modes

| | One model across several cards | Independent workers |
|---|---|---|
| **What for** | A model too large for any single card | Getting through more work |
| **Buys you** | Capacity | Throughput |
| **Costs you** | Speed | Nothing, if the work is independent |
| **Command** | `nodeau run M --gpus 2` | `nodeau batch submit … --workers 2` |

## One model across several cards

```bash
nodeau run qwen3.8-27b-q4km --gpus 2
```

Nodeau names the exact cards, Kubernetes allocates exactly those, and per-process
telemetry proves which card carried the work.

### It is not a speedup

Measured on this project's own hardware, with a model that fits on either card:

| | Output tokens/s |
|---|---|
| RTX 3080 alone | **113.6** |
| RTX 5060 Ti alone | **80.1** |
| The same model split across both | **89.3** |

Generation is bandwidth-bound and a layer split runs the layers **sequentially**,
so throughput lands *between* the two cards rather than above the faster one.

:::warning Splitting is the slowest way to use two cards for independent work
On the same pair, two independent replicas with dynamic claiming reached
**192.41 tok/s** against the split's **91.41**. If your work is independent,
run two workloads, not one split one.
:::

### What it is for

Models that fit on **no** single card you own. The strong case is a model whose
weights are larger than either card's memory — roughly 19 GiB of weights on a
pair of cards that are 10 GiB and 16 GiB. Split, it runs. On either card alone,
it does not.

### GPU memory is not pooled

Two 8 GB cards are not a 16 GB card.

Per-device overhead is **replicated**, not shared, so each card pays the runtime's
own buffers again. Nodeau adds a further **128 MiB per device** allowance for a
multi-device workload. A pair whose *total* looks ample can have one card that
cannot hold its share — and the smaller card runs out first.

Admission evaluates the fit **per device, as a conjunction**. It never sums.

### Choosing how the split is made

```bash
nodeau run <model> --gpus 2 --topology auto    # the default
nodeau run <model> --gpus 2 --topology layer
```

`auto` lets Nodeau choose; `layer` asks for a layer split explicitly. This is
advanced and unnecessary for ordinary use.

### What is not supported

- **Row split** — it does not run on this hardware (`device CUDA0 does not
  support split buffers`).
- **Peer-to-peer between cards** — reported unavailable in both directions on the
  only pair this project owns. No NVLink.
- **Across machines** — no cross-machine sharding, no distributed tensor or
  pipeline parallelism.
- **Sharing a card** — no GPU sharing, time-slicing, MIG, preemption, migration,
  live repartitioning or automatic tensor-split tuning.
- **Batch** — `--gpus` on a batch job sets how many cards **one worker** uses, and
  is currently pinned to 1 by its own type.

### Heterogeneous cards

A split across two different models of card is qualified: one pair — an RTX 3080
and an RTX 5060 Ti — running a model whose weights fit on neither alone. Other
combinations are untested rather than refused; admission still does the per-device
arithmetic and will say what it finds.

### If only one of the cards is free

Atomic set allocation is **inherited, not built**. A multi-device claim with one
member already held is refused outright — *"cannot allocate all claims"* — and
reserves nothing. Nodeau never holds a partial set, because Nodeau never holds
devices at all: Kubernetes does.

So a workload asking for two cards when one is busy is refused, holds nothing, and
can be run again when the card frees.

### `--gpus-auto`

```bash
nodeau run <model> --gpus-auto --max-gpus 2
```

:::warning This flag does not currently change the outcome
The flags parse and the request is written, and the Kubernetes execution plane
does not read it — a workload started with `--gpus-auto` gets one card, exactly as
`--gpus 1` would. Ask for several cards explicitly with `--gpus N`. This is a known
gap, recorded here rather than papered over.
:::

## Independent workers

The other mode. Instead of one model on several cards, run **several complete
model instances**, each on a card of its own, each with its own weights and its
own KV cache.

For a finite job, that is batch:

```bash
nodeau batch submit requests.jsonl --model qwen3.5-4b-q4km --workers 2
```

Two workers share out the records between them, and Nodeau proves which card ran
which worker. Measured on a 24-record job: **47 s against 61 s**.

:::note That is a floor, not a rate
A 24-record job is dominated by loading the model, and both workers pay that cost.
The saving grows with the job; do not extrapolate a ratio from it.
:::

For serving, it is just two workloads:

```bash
nodeau run <model> --name a --port 8080
nodeau run <model> --name b --port 8081
```

### `workers` and `gpus` are orthogonal

This is the most dangerous arithmetic available here.

- `--workers N` is **N independent model replicas**. Each loads its own weights,
  holds its own KV cache and reserves its own accelerator set.
- `--gpus G` is **how many accelerators are inside one worker**.

**Never divide a model's memory by the worker count.** Each worker needs the
model's full memory on its own card. Doing that arithmetic the other way
undercharges every card, in the direction that lets a second workload onto memory
already spoken for.

A worker count is a **request**: workers that cannot get a card wait, and the job
still completes.

## Seeing what happened

```bash
nodeau ps                          # which workload is on which card
nodeau placement explain <name>    # why those cards, and what the alternatives cost
nodeau service explain <name>      # the per-device VRAM arithmetic
```
