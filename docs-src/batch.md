---
title: Batch inference on Nodeau
heading: Batch inference
nav: Batch inference
description: Run a finite set of requests against one model and collect the results — input format, workers, queuing, cancellation, retries, and every failure case.
lede: A finite set of requests, one model, and a results file when it is done. Your records never leave the machine.
---

:::linux
Batch inference is **Linux only**. On macOS it is absent rather than untested:
the commands refuse by name. Needs `FeatureBatchJobs` — **Home Pro** or
**Business**.
:::

## The whole flow

```bash
nodeau batch submit requests.jsonl --model qwen3.5-4b-q4km --name nightly
nodeau batch wait nightly
nodeau batch results nightly -o answers.jsonl
```

Or, composed:

```bash
nodeau batch wait nightly && nodeau batch results nightly
```

`wait` exits `0` when the job finished and `1` when it failed, was cancelled or
timed out, so a shell can branch on it.

## The input file

One JSON object per line. Not a JSON array — Nodeau reads **JSONL**.

```jsonl
{"custom_id":"req-1","method":"POST","url":"/v1/chat/completions","body":{"messages":[{"role":"user","content":"Summarise this paragraph: ..."}],"max_tokens":2048}}
{"custom_id":"req-2","method":"POST","url":"/v1/chat/completions","body":{"messages":[{"role":"user","content":"And this one: ..."}],"max_tokens":2048}}
```

| Field | Required | Notes |
|---|---|---|
| `custom_id` | **Yes** | How each result is matched back to its request |
| `url` | Yes | Only `/v1/chat/completions` is supported in this version |
| `method` | Yes | `POST` |
| `body` | Yes | An ordinary chat-completions request |

:::important A `model` inside a record's body is ignored
The job runs **one** model, chosen with `--model`, because that is the model
Nodeau reserved a GPU for. Putting a different one in a record does not switch
models for that record.
:::

### Nodeau checks the file before uploading it

The first twenty records are read locally, so the two commonest mistakes become
an answer rather than a per-record error after a large upload:

- A file starting with `[` is refused: *"looks like a JSON array. Nodeau reads
  JSONL."*
- A line that is not valid JSON is refused, by line number.
- If **no** record in the sample has a `custom_id`, it is refused.
- An empty file is refused.

It also **notes** — without refusing — records asking for a small completion
budget, because a reasoning model spends its budget thinking before any answer
exists. That is advice, not a rule: plenty of records legitimately want a hard
cap, and the budget in your record is your decision.

## Workers and GPUs {#workers-and-gpus}

These answer different questions, and mixing them up costs throughput rather than
raising an error.

```bash
nodeau batch submit in.jsonl --model M --workers 2 --gpus 1
```

> **Two independent workers**, each a complete model instance on a card of its
> own, sharing out the records between them. Faster, because the records do not
> depend on each other.

```bash
nodeau batch submit in.jsonl --model M --workers 1 --gpus 2
```

> **One worker** whose model spans two cards. For a model too large to fit on
> either card alone — not a way to go faster.

A worker count is a **request**. Workers that cannot get a card wait, and the job
still completes with the workers it got.

Measured on a 24-record job with two workers: **47 s against 61 s**. That is a
**floor, not a rate** — a short job is dominated by loading the model, and both
workers pay that cost.

Never divide a model's memory by the worker count. Each worker holds the model's
full memory on its own card. See
[several GPUs in one machine](/docs/multi-gpu/#workers-and-gpus-are-orthogonal).

## Submitting

```bash
nodeau batch submit FILE --model MODEL [flags]
```

| Flag | Default | Meaning |
|---|---|---|
| `--model <id>` | **required** | Model to run every record against |
| `--name <name>` | generated | Name for the job |
| `--namespace`, `-n` | `nodeau-dev` | Namespace |
| `--task <task>` | inferred | `chat` or `embed`; inferred when the model can only do one |
| `--workers <n>` | `1` | Independent workers, each on its own GPU |
| `--gpus <n>` | `1` | GPUs one worker uses |
| `--context-size <n>` | `4096` | Context window the model server runs with |
| `--parallel <n>` | `1` | Concurrent sequences the runtime serves |
| `--max-attempts <n>` | `2` | How many times the **whole job** may execute |

:::warning A retry starts from the beginning
`--max-attempts` is attempts at the whole job. This version does **not** resume a
partial batch. A retried job re-runs every record.
:::

## Queuing and capacity

A batch job takes a **whole GPU** while it runs, exactly as a service does —
Nodeau does not share a card between workloads.

If every GPU is busy, your job **waits in a queue and starts by itself** when one
frees. That is `QUEUED`, and it is not a failure. Nothing is preempted: Nodeau
has no priority queues and does not stop a serving model to make room.

```bash
nodeau ps          # batch jobs appear here alongside services
nodeau ps --all    # including finished ones
nodeau batch list
```

## Watching one

```bash
nodeau batch status nightly
nodeau batch status nightly --json
nodeau logs nightly            # a worker's own output
```

## Results

```bash
nodeau batch results nightly                 # writes nightly-results.jsonl
nodeau batch results nightly -o answers.jsonl
nodeau batch results nightly --stdout        # only if you mean it
```

```jsonl
{"custom_id":"req-1","response":{"status_code":200,"body":{}}}
{"custom_id":"req-2","error":{"code":"InferenceFailed","message":"..."}}
```

Every record you submitted has **exactly one line** here, in the order you sent
them, each carrying the `custom_id` it came from — so results are matched by
identity rather than by position.

Results are written to a **file** by default. These are your model's answers, and
printing them to a terminal by accident is how they end up in scrollback, a
screenshot or a pasted issue.

If a result arrives whose `custom_id` cannot be resolved, it is reported by line
number and says so, rather than being dropped or attributed to the wrong request.

## Cancelling

```bash
nodeau batch cancel nightly
```

Results already produced are **kept** and remain available with
`nodeau batch results`. Nodeau waits for the model server to actually exit before
releasing the GPU, so a cancelled job may take a few seconds to finish stopping.

The local dashboard can also stop a batch job — it is the one action that page
has.

## Where your records live

On the **control-plane machine's disk**, at `/var/lib/nodeau/batch`.

- They are **not** sent to Nodeau Cloud.
- They are **never** written into a Kubernetes object or a log.
- `nodeau uninstall` keeps them unless you pass `--remove-batch-data`, because
  unlike model weights they cannot be downloaded again.

:::warning Two limits worth knowing before you rely on batch
**Durability depends on one host.** Batch inputs and results live on the
control-plane machine's disk and are not replicated anywhere. If that disk is
lost, they are lost.

**The content endpoint lives inside the controller.** A control plane down for
longer than the runner's two-minute retry budget fails an in-flight attempt. No
inference traffic crosses that boundary, but a batch worker depends on
control-plane availability in a way a serving model does not.
:::

## Failure cases

| Symptom | Reason code | What it means |
|---|---|---|
| Refused at submit, before upload | — | The file is a JSON array, has an invalid line, has no `custom_id`, or is empty |
| Refused after upload | `BATCH_INPUT_INVALID` | The records are missing, unreadable, or do not match the digest recorded at submission |
| Sits without starting | `QUEUED` | Correct and waiting for a card. Not a failure |
| Sits without starting | `BATCH_QUOTA_EXHAUSTED` | Your organisation's batch allowance is spent. Ask a colleague, not a plan |
| Fails without producing anything | `BATCH_WORKER_UNAVAILABLE` | The worker was placed and its container never started, so nothing ran |
| Fails after running | `BATCH_FAILED` | An attempt failed for an infrastructure reason and no attempts remain |
| Stopped | `BATCH_CANCELLED` | You asked for it |
| Refused on a Mac | — | Batch inference is Linux-only and refuses by name |
| Refused on the free plan | `FEATURE_NOT_ENTITLED` | Batch needs Home Pro or Business |

A worker that cannot start does **not** hold its GPU indefinitely. Nodeau
suspends the job, waits until nothing holds the device, and only then goes
terminal — that order is what releases the reservation.

## What batch is not

Nodeau's batch is its own thing. It is **not** the OpenAI Batch API, there is no
`/v1/batches` endpoint, and it does not accept OpenAI batch files as a drop-in.

There is no preemption, no GPU sharing, no job resume, no batch failover, no
scheduled or recurring batch, and no priority queueing. A job runs on the machine
it was placed on; it does not span machines.
