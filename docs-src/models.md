---
title: The Nodeau model catalog
heading: The model catalog
nav: The model catalog
description: The eight curated models and their hardware ladder, what each one can do, how weights are downloaded and verified, the model cache, and measured versus estimated.
lede: A small, curated set chosen to span the cards people actually own, from a compact 8 GB starter up to a flagship. Plus how the weights reach a machine, and how Nodeau knows they're the right ones.
---

## The curated catalog {#the-curated-catalog}

```bash
nodeau model list          # what you can run, and what's downloaded
nodeau model list --all    # including older ids that newer models replaced
```

Eight recommended models, arranged on a four-rung hardware ladder. Each one says
which rung it's designed for. A rung is **guidance**: the real decision is made
by [the fit check](/docs/scheduling/), on your card, at the moment you ask, and a
model can fit a smaller card than its label suggests.

| Rung | Model | What it's for | Can do |
|---|---|---|---|
| 8 GB | `qwen3.5-4b-q4km` | Compact general, and the starter model | chat, tools, structured output |
| 8 GB | `gemma-4-e4b-qat-q4-0` | Compact multimodal: text and images | chat, image input, structured output |
| 8 GB | `qwen3-embedding-0.6b-q8_0` | Embeddings for search and retrieval | embed |
| 8 GB | `bge-reranker-v2-m3-q8_0` | Reranking search results | rerank |
| 12 GB | `qwen3.5-9b-q4km` | Mainstream general | chat, tools, structured output |
| 12 GB | `gemma-4-12b-qat-q4-0` | Mainstream multimodal | chat, image input, structured output |
| 16 GB | `gpt-oss-20b-mxfp4` | A larger, efficient mixture-of-experts model | chat |
| 24 GB, or several smaller cards in one machine | `qwen3.8-27b-q4km` | Flagship general | chat, tools, structured output |

Every model runs on Linux machines with NVIDIA GPUs. On a Mac, which runs
standalone, Nodeau serves the chat models. The tasks beyond chat are covered in
[embeddings, reranking, tools and vision](/docs/tasks/).

Here's the list on a machine that has a few of them already:

```text
MODEL                      ROLE                   GPU     SIZE        STATUS          QUALIFICATION
bge-reranker-v2-m3-q8_0    Reranker               8 GB    606.23 MiB  downloaded      Nodeau curated
gemma-4-12b-qat-q4-0       Mainstream multimodal  12 GB   6.50 GiB    downloaded      Nodeau curated
gemma-4-e4b-qat-q4-0       Compact multimodal     8 GB    4.80 GiB    not downloaded  Nodeau curated
gpt-oss-20b-mxfp4          Large efficient MoE    16 GB   11.28 GiB   downloaded      Nodeau curated
qwen3-embedding-0.6b-q8_0  Embedding              8 GB    609.54 MiB  downloaded      Nodeau curated
qwen3.5-4b-q4km            Compact general        8 GB    2.55 GiB    not downloaded  Nodeau curated
qwen3.5-9b-q4km            Mainstream general     12 GB   5.29 GiB    not downloaded  Nodeau curated
qwen3.8-27b-q4km           Flagship general       24 GB+  17.67 GiB   not downloaded  Nodeau curated
```

`nodeau model list` on your own machine is the authoritative list for the build
you have. Older ids stay valid for good and keep naming exactly the same bytes.
When a newer model takes an older one's place, the older id is marked
**deprecated**, and it still installs and runs.

:::note What an 8 GB label rests on
Where Nodeau had no 8 GB card to test on, the rung comes from an 8 GiB
available-memory capacity test rather than a measurement on that class of card.
The label tells you which rung a model is designed for, and `nodeau model info`
tells you exactly what has been measured.
:::

## What a model can do

A model has a **task**, which is the kind of work a workload is started for, and
a set of **capabilities**, which are what it has been shown to do.

| Capability | What it means | Route |
|---|---|---|
| `chat` | Conversational completion | `/v1/chat/completions` |
| `embed` | Vector embeddings | `/v1/embeddings` |
| `rerank` | Ordering documents against a query | `/v1/rerank` |
| `tools` | Emitting a tool call that you then run | inside a chat completion |
| `structured-output` | Generation constrained to your JSON schema | inside a chat completion |
| `vision-input` | Understanding an image in the prompt | inside a chat completion |

A workload answers its own task's routes, which keeps every reply the kind you
asked for. See
[which routes an endpoint answers](/docs/api/#which-routes-an-endpoint-answers).

```bash
nodeau run <model>                      # the task is inferred when a model does only one
nodeau run <model> --task embed         # otherwise, say which
```

The catalog lists each model for exactly the tasks and capabilities it has
shown, and [embeddings, reranking, tools and vision](/docs/tasks/) has a working
example of each.

## Looking at a model before you download it

```bash
nodeau model info qwen3.5-4b-q4km
```

```text
Qwen3.5-4B Q4_K_M
  id            qwen3.5-4b-q4km
  family        Qwen3.5
  parameters    4B
  quantization  Q4_K_M

Licence
  Apache-2.0
  https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE

Where the bytes come from
  https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/e87f1764.../Qwen3.5-4B-Q4_K_M.gguf
  repository    unsloth/Qwen3.5-4B-GGUF
  revision      e87f176479d0855a907a41277aca2f8ee7a09523   (pinned; not a moving branch)
  size          2.55 GiB
  sha256        00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4

  Nodeau downloads this from its publisher and never republishes it.
  No account or token is needed.

Capabilities
  chat                yes
  structured output   yes
  tools               yes
  ...

Measured configurations
  ENGINE     CONTEXT  PARALLEL  GPU                         PEAK VRAM  SCOPE    CONFIDENCE
  llama.cpp  4096     1         NVIDIA GeForce RTX 5060 Ti  3,000 MiB  process  measured
```

Everything you'd want to know before downloading several gigabytes: where the
bytes come from, what licence they carry, what the model can do, and which
serving configurations have actually been **measured** on which hardware.

## Downloading

```bash
nodeau model install qwen3.5-4b-q4km
```

Nothing is downloaded until you say yes. The size, licence and source come
first, because several gigabytes over your connection should always be your
decision. `--consent` answers in advance, for a script.

- Weights come from the **publisher**, over HTTPS, from a URL pinned to an
  **immutable revision**. Nodeau never republishes weights, and you need no
  account or token.
- An interrupted download **resumes**.
- The **SHA-256 is checked** before the file is allowed to be used.
- A file that fails the check is **moved aside** rather than deleted, so the
  evidence survives and the next run can't mistake it for a good one.

`nodeau run <model>` offers to download a missing model for you, and `--pull`
answers yes in advance.

## The model cache

| | |
|---|---|
| Linux | `/var/lib/nodeau/models/` |
| macOS | `~/Library/Application Support/Nodeau/state/models/` |

`--cache-dir` points Nodeau somewhere else. It has to be the directory the
runtime mounts.

Each machine keeps its own copy of a model and verifies it itself. A second
machine downloads, or imports, what it needs, and Nodeau places work where the
verified weights already are. Copying models between machines for you is on the
[roadmap](/roadmap/).

## Verification

Presence isn't integrity, so the two are separate columns.

```bash
nodeau model verify qwen3.5-4b-q4km   # re-read this machine's copy and recompute
nodeau model status qwen3.5-4b-q4km   # every machine's view
```

```text
On each machine
  NODE       CACHE     DETAIL
  nodeau-c   verified  -
  nodeforge  absent    this node has been observed and does not hold this model

Will it fit? (judged as if the card were free of Nodeau workloads)
  NODE       GPU                         VERDICT          NEEDS      AVAILABLE   HEADROOM
  nodeau-c   NVIDIA GeForce RTX 3080     yes (estimated)  4,406 MiB  9,365 MiB   4,959 MiB
  nodeforge  NVIDIA GeForce RTX 5060 Ti  yes              3,512 MiB  15,315 MiB  11,803 MiB
```

Only a computed SHA-256 that matches counts as **verified**, and only a verified
copy is ever used to place a workload. Once, a file with the right name and the
right size served fluent answers for a day while being the wrong bytes, which is
why "it loads and sounds fine" doesn't count as evidence.

Each machine re-checks its own copies on its own: whenever a file's fingerprint
changes, and again when a check gets old. `nodeau model verify` is the
on-demand version, and it's worth running after a power cut or any storage
trouble.

The fit columns answer *is this card big enough*, judged as if the card were
free of Nodeau workloads. Whether it's free right now is shown separately,
because "too small" and "busy" call for completely different next steps.

## Removing a model

```bash
nodeau model remove qwen3.5-4b-q4km
```

This deletes the weights **on this machine only**. Nodeau first checks that no
service uses the model, and names the service if one does. If it can't reach
the cluster to make that check, it stops rather than guessing, because not
knowing whether something is in use is a reason to stop.

Other machines keep their copies. Deleting gigabytes on a machine you aren't
sitting at is a decision you make there.

## Measured and estimated

Where a configuration has been measured on hardware like yours, Nodeau uses the
measurement. Where it hasn't, it computes a figure from the model's own
architecture and file size, adds a further margin, and **labels the decision
estimated**. You always know which one you got.

```bash
nodeau model info <model>    # the measurements, and their scope
```

Each measurement row says whether it counted the **whole device** or **one
process**, because those are different quantities, and mixing them would quietly
weaken the fit check.

If a model is turned away only because of the extra margin for unmeasured
hardware, you can accept that risk yourself with `--accept-estimate-risk`. See
[accepting the risk yourself](/docs/scheduling/#accepting-the-risk-yourself).

## Your own models

Everything above is the curated set. To run a GGUF file of your own, see
[bring your own model](/docs/byom/). Your own models are listed separately from
curated ones, because they're a different kind of trust: you chose them, their
licence is yours to check, and you supplied the bytes.
