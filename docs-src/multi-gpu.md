---
title: Using several GPUs in one machine
heading: Several GPUs in one machine
nav: Several GPUs in one machine
description: The two things people mean by multi-GPU: one model split across cards for capacity, and independent copies on separate cards for throughput. With measured numbers.
lede: "Multi-GPU" means two very different things, and mixing them up quietly costs you throughput. Here's how to pick the right one, with the numbers we measured.
---

:::linux
Everything on this page happens inside **one Linux machine with NVIDIA GPUs**.
A Mac has one integrated GPU, so it's always a single-card machine.
:::

Several GPUs in a machine come with **Home Pro** (up to 2 cards in any one
machine) and **Business** (as many as the machine has). On the free Home plan,
Nodeau still detects and reports a second card, ready for whenever you want it.

## The two modes

| | One model across several cards | Independent copies |
|---|---|---|
| **What for** | A model too large for any single card | Getting through more work |
| **Gets you** | Capacity | Throughput |
| **Trade-off** | Slower than the faster card on its own | None, when the work is independent |
| **Command** | `nodeau run M --gpus 2` | `nodeau batch submit … --workers 2` |

## One model across several cards

```bash
nodeau run qwen3.8-27b-q4km --gpus 2
```

Nodeau names the exact cards, Kubernetes allocates exactly those, and
per-process telemetry shows which card carried the work.

### It adds capacity, not speed

Measured on our own hardware, with a model that fits on either card:

| | Output tokens/s |
|---|---|
| RTX 3080 alone | **113.6** |
| RTX 5060 Ti alone | **80.1** |
| The same model split across both | **89.3** |

Generation is limited by memory bandwidth, and a layer split runs the layers
**one after another**, so throughput lands *between* the two cards rather than
above the faster one.

:::warning For independent work, run separate copies
On the same pair, two independent copies claiming work as they went reached
**192.41 tok/s**, against **91.41** for the split. If your requests don't depend
on each other, run two workloads rather than one split one.
:::

### What it's for

Models that fit on **no** single card you own. The strong case is a model whose
weights are bigger than either card: roughly 19 GiB of weights on a pair of cards
with 10 GiB and 16 GiB. Split, it runs. On either card alone, it wouldn't fit.

### Each card holds its own share

Two 8 GB cards give a split model two separate 8 GB homes, and every card has to
fit its own part.

Per-device overhead is **repeated on each card**: every card pays for the
runtime's own buffers, and Nodeau adds a further **128 MiB per device** allowance
for a multi-device workload. So a pair whose *total* looks roomy can still have
one card that can't hold its share, and the smaller card is the one that fills
first.

That's why admission checks the fit **card by card**, and every card has to pass.

### Choosing how the split is made

```bash
nodeau run <model> --gpus 2 --topology auto    # the default
nodeau run <model> --gpus 2 --topology layer
```

`auto` lets Nodeau choose, and `layer` asks for a layer split explicitly. It's an
advanced setting, and ordinary use never needs it.

### Good to know

- **Nodeau splits by layers.** That's the split llama.cpp runs reliably on these
  cards. (Its other mode, row split, stops on this hardware with
  `device CUDA0 does not support split buffers`, so it isn't offered.)
- **The cards talk over ordinary PCIe.** A layer split needs no peer-to-peer link
  and no NVLink. Our qualifying pair reports peer-to-peer as unavailable in both
  directions, and the split runs happily.
- **A split lives inside one machine.** Across machines, Nodeau runs separate
  workloads, one per machine.
- **Each card belongs to one workload at a time**, and a split is set when the
  workload starts and stays that way while it runs.

### Different cards in one machine

A split across two different models of card is qualified on one pair, an RTX
3080 and an RTX 5060 Ti, running a model whose weights fit on neither alone.
Other combinations haven't been tested yet, and they aren't turned away:
admission still does the card-by-card arithmetic and tells you what it finds.

### If only one of the cards is free

Kubernetes allocates the whole set of cards together or not at all. A request
for two cards when one is busy is refused with *"cannot allocate all claims"*,
and it reserves nothing, because Nodeau never holds a partial set. Run it again
once the card frees up.

### Letting Nodeau choose the number of cards

`nodeau run` also accepts `--gpus-auto` and `--max-gpus`. They **have no effect
yet**: a workload started with them uses the number of cards `--gpus` asks for,
which is one unless you say otherwise, and Nodeau prints a notice on stderr
saying so. To give a model several cards, ask for them with `--gpus N`.

## Independent copies

The other mode. Instead of one model on several cards, run **several complete
copies of the model**, each on a card of its own, each with its own weights and
its own KV cache.

For a finite job, that's batch:

```bash
nodeau batch submit requests.jsonl --model qwen3.5-4b-q4km --workers 2
```

Two workers share out the records between them, and Nodeau shows which card ran
which worker. Measured on a 24-record job: **47 s against 61 s**.

:::note That's a floor, not a rate
A 24-record job is mostly the time it takes to load the model, and both workers
pay that. The saving grows with the job, so don't extrapolate a ratio from this
one.
:::

For serving, it's simply two workloads:

```bash
nodeau run <model> --name a --port 8080
nodeau run <model> --name b --port 8081
```

### `workers` and `gpus` are orthogonal {#workers-and-gpus-are-orthogonal}

This is the one piece of arithmetic on the page worth slowing down for.

- `--workers N` is **N independent copies of the model**. Each loads its own
  weights, holds its own KV cache and reserves its own cards.
- `--gpus G` is **how many cards are inside one copy**.

**Never divide a model's memory by the worker count.** Each worker needs the
model's full memory on its own card. Doing the sum the other way undercharges
every card, in the direction that lets a second workload onto memory that's
already spoken for.

A worker count is a **request**: workers that can't get a card wait, and the job
still completes.

## Seeing what happened

```bash
nodeau ps                          # which workload is on which card
nodeau placement explain <name>    # why those cards, and what the alternatives cost
nodeau service explain <name>      # the card-by-card VRAM arithmetic
```
