---
title: Models and the Nodeau catalog
heading: Models and the catalog
nav: Models and the catalog
description: The curated catalog and its hardware ladder, downloading and verifying weights, the model cache, capabilities, tasks, and what each kind of model can do.
lede: A curated set chosen to span real hardware and real workloads — not a list of everything that exists. Plus how weights get onto a machine, and how Nodeau knows they are the right ones.
---

## The curated catalog {#the-curated-catalog}

```bash
nodeau model list          # what you can run, and what is downloaded
nodeau model list --all    # including deprecated and legacy entries
```

Eight recommended models, arranged on a four-rung hardware ladder. Every model
states which rung it is on, and a rung is **guidance** — the decision is always
made by [admission](/docs/scheduling/), on your card, at the moment you ask.

| Rung | Model | Role |
|---|---|---|
| 8 GB | `qwen3.5-4b-q4km` | Compact general. The starter model |
| 8 GB | `gemma-4-e4b-qat-q4-0` | Compact multimodal — text and images |
| 8 GB | `qwen3-embedding-0.6b-q8_0` | Embeddings |
| 8 GB | `bge-reranker-v2-m3-q8_0` | Reranking |
| 12 GB | `qwen3.5-9b-q4km` | Mainstream general |
| 12 GB | `gemma-4-12b-qat-q4-0` | Mainstream multimodal |
| 16 GB | `gpt-oss-20b-mxfp4` | Large, efficient mixture-of-experts |
| 24 GB, or several smaller cards in one machine | `qwen3.8-27b-q4km` | Flagship general |

`nodeau model list` on your own machine is the authoritative list for the build
you have. Older ids stay valid for ever and keep naming the same bytes; some are
marked **deprecated**, meaning superseded rather than removed.

:::note An 8 GB label is not a claim about an 8 GB card
Where Nodeau has no 8 GB card to test on, the rung comes from an available-memory
capacity test rather than from a measurement on that class of hardware. The label
tells you which rung a model is designed for; `nodeau model info` tells you what
has actually been measured.
:::

## What a model can do

A model has a **task** (what a workload is started for) and a set of
**capabilities** (what it has been shown to do).

| Capability | What it means | Route |
|---|---|---|
| `chat` | Conversational completion | `/v1/chat/completions` |
| `embed` | Vector embeddings | `/v1/embeddings` |
| `rerank` | Ordering documents against a query | `/v1/rerank` |
| `tools` | Emitting a tool call you then execute | in a chat completion |
| `structured-output` | Sampling constrained by a JSON schema | in a chat completion |
| `vision-input` | Understanding an image in the prompt | in a chat completion |

A workload answers its task's routes and refuses the others, because the model
server underneath does not — see
[which routes an endpoint answers](/docs/api/#which-routes-an-endpoint-answers).

```bash
nodeau run <model>                      # task inferred when the model can only do one
nodeau run <model> --task embed         # otherwise, say which
```

There is **no supported** speech, transcription, audio, text-to-speech or
image-generation capability. A model in the catalog is listed for the tasks and
capabilities above and for nothing else.

## Looking at a model before downloading it

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
  https://huggingface.co/.../Qwen3.5-4B-Q4_K_M.gguf
  repository    unsloth/Qwen3.5-4B-GGUF
  revision      e87f1764…   (pinned; not a moving branch)
  size          2.55 GiB
  sha256        00fe7986…
```

Everything a person should know before downloading several gigabytes: where the
bytes come from, what licence they carry, and which serving configurations have
actually been **measured** on which hardware.

## Downloading

```bash
nodeau model install qwen3.5-4b-q4km
```

Nothing is downloaded until you agree. The size, licence and source are shown
first, because several gigabytes over somebody's connection is not a side effect
any command should have. `--consent` answers in advance, for a script.

- Downloaded from the **publisher**, over HTTPS, from a URL pinned to an
  **immutable revision**. Nodeau never redistributes weights and needs no account
  or token.
- An interrupted download **resumes**.
- The **SHA-256 is verified** before the file is allowed to be used.
- A file that fails verification is **moved aside** rather than deleted — so the
  evidence survives — and rather than left in place, so the next run cannot
  mistake it for a good one.

`nodeau run <model>` will offer to download a missing model for you; `--pull`
answers yes in advance.

## The model cache

| | |
|---|---|
| Linux | `/var/lib/nodeau/models/` |
| macOS | `~/Library/Application Support/Nodeau/state/models/` |

Override with `--cache-dir` — it must be the directory the runtime mounts.

Each machine keeps its own copy. **Nodeau does not replicate models between
machines**: a second machine downloads or imports what it needs. A Mac runs
standalone and simply holds its own cache; importing a model of your own is
qualified on Linux and unproven there.

## Verification

Presence is not integrity, and the two are deliberately separate columns.

```bash
nodeau model verify qwen3.5-4b-q4km   # re-read this machine's copy, recompute
nodeau model status                   # the fleet's view
```

```text
MODEL              MACHINE     DOWNLOADED  VERIFIED  GPUs THAT FIT
qwen3.5-4b-q4km    nodeforge   yes         yes       RTX 5060 Ti
qwen3.5-4b-q4km    nodeau-c    yes         pending   —
```

Only a computed SHA-256 that matches counts as **verified**, and only a verified
copy can be placed against. A file of the right name and the right size once
served coherent answers for a day on one machine while being the wrong bytes —
which is why "it loads and sounds fine" is not evidence.

Each machine re-hashes its own copies continuously, on a fingerprint change and
on age expiry, and publishes the result. `nodeau model verify` is the on-demand
version, worth running after a power cut or storage trouble.

The GPU columns answer *is this card big enough*, judged as if the card were free
of Nodeau workloads. Whether it is free right now is shown separately, because
"too small" and "busy" call for completely different actions.

## Removing a model

```bash
nodeau model remove qwen3.5-4b-q4km
```

Deletes the weights **on this machine only**. Nodeau checks first that no service
references the model and refuses by name if one does — and refuses just as firmly
when it cannot reach the cluster to check, because not knowing whether something
is in use is a reason to stop rather than a reason to proceed.

It does not remove the model from other machines. Deleting gigabytes from a
machine you are not sitting at, as a side effect of a command that reads like a
catalog edit, is not a default Nodeau is willing to have.

## Estimated and measured

Where a configuration has been measured on hardware like yours, Nodeau uses the
measurement. Where it has not, it computes a figure from the model's own
architecture and artifact size, adds a further margin, and **labels the decision
estimated**. An estimate is never presented as a measurement.

```bash
nodeau model info <model>    # the measurements, and their scope
```

Each measurement row states whether the figure counted the **whole device** or
**one process**, because the two are different quantities and mixing them
silently weakens admission.

If a model is refused only because of the unmeasured-hardware margin, you can
accept that risk yourself with `--accept-estimate-risk` — see
[admission](/docs/scheduling/#accepting-the-risk-yourself).

## Your own models

Everything above is the curated set. To run a GGUF file of your own, see
[bring your own model](/docs/byom/). Custom models are listed separately from
curated ones, because they are a different trust class: Nodeau did not choose
them, did not review their licence, and did not supply the bytes.
