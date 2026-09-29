---
title: Batch inference on Nodeau
heading: Batch inference
nav: Batch inference
description: Run a file of chat or embedding requests against one model on your own GPUs and collect the results: input format, workers, queuing, cancelling, retries and failure cases.
lede: Hand Nodeau a file of requests, go and do something else, and come back to a results file with one answer for every line. Your records stay on your own hardware the whole time.
---

:::linux
Batch runs on **Linux machines with NVIDIA GPUs**, and comes with **Home Pro**
and **Business**. On a Mac, the batch commands say that batch runs on Linux and
exit with code `3`.
:::

## The whole flow

```bash
nodeau batch submit requests.jsonl --model qwen3.5-4b-q4km --name nightly
nodeau batch wait nightly
nodeau batch results nightly -o answers.jsonl
```

Or chained together:

```bash
nodeau batch wait nightly && nodeau batch results nightly
```

`wait` exits `0` when the job finished and `1` when it failed, was cancelled or
timed out, so a shell can branch on it.

## The input file

One JSON object per line. Nodeau reads **JSONL**, rather than one big JSON array.

A **chat** job's records call `/v1/chat/completions`, and each body is an
ordinary chat-completions request:

```jsonl
{"custom_id":"req-1","method":"POST","url":"/v1/chat/completions","body":{"messages":[{"role":"user","content":"Summarise this paragraph: ..."}],"max_tokens":2048}}
{"custom_id":"req-2","method":"POST","url":"/v1/chat/completions","body":{"messages":[{"role":"user","content":"And this one: ..."}],"max_tokens":2048}}
```

An **embedding** job's records call `/v1/embeddings`, and each body is an
ordinary embeddings request:

```jsonl
{"custom_id":"doc-1","method":"POST","url":"/v1/embeddings","body":{"input":"Nodeau runs models on hardware you own."}}
{"custom_id":"doc-2","method":"POST","url":"/v1/embeddings","body":{"input":"Batch jobs return one result per line."}}
```

Submit an embedding job with an embedding model, such as
`qwen3-embedding-0.6b-q8_0`. Nodeau works out the task from the model when the
model only does one thing, and `--task embed` says it explicitly.

| Field | Required | Notes |
|---|---|---|
| `custom_id` | **Yes** | How each result is matched back to its request |
| `url` | Yes | `/v1/chat/completions` for a chat job, `/v1/embeddings` for an embedding job |
| `method` | Yes | `POST` |
| `body` | Yes | An ordinary request for that endpoint |

:::important The job's model is the one that runs
The job runs **one** model, the one you chose with `--model`, because that's the
model Nodeau reserved a GPU for. A `model` field inside a record's body is
ignored, so every record in the job gets the same model.
:::

### Nodeau checks the file before uploading it

The first twenty records are read on your machine first, so the two most common
mistakes get an answer straight away instead of a per-record error after a big
upload:

- A file starting with `[` gets *"looks like a JSON array. Nodeau reads
  JSONL."*
- A line that isn't valid JSON is reported by its line number.
- If **no** record in the sample has a `custom_id`, you're told before anything
  uploads.
- An empty file is caught too.

It also **mentions**, without stopping, records that ask for a small completion
budget, because a reasoning model spends its budget thinking before an answer
exists. That's advice rather than a rule: plenty of records legitimately want a
hard cap, and the budget in your record is yours to set.

## Workers and GPUs {#workers-and-gpus}

These two flags answer different questions, and mixing them up costs you
throughput without any error to warn you.

```bash
nodeau batch submit in.jsonl --model M --workers 2 --gpus 1
```

> **Two independent workers**, each a complete copy of the model on a card of
> its own, sharing out the records between them. Faster, because the records
> don't depend on each other.

```bash
nodeau batch submit in.jsonl --model M --workers 1 --gpus 2
```

> **One worker** whose model spans two cards, for a model too large to fit on
> either card alone. It's for capacity, not speed.

A worker count is a **request**. Workers that can't get a card wait, and the job
still completes with the workers it got: the ones running simply take the
records the others would have had. `nodeau batch status` shows how many are
running and how many are waiting.

Measured on a 24-record job with two workers: **47 s against 61 s**. That's a
**floor, not a rate**, because a short job is mostly the time it takes to load
the model, and both workers pay that.

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
| `--task <task>` | inferred | `chat` or `embed`; inferred when the model only does one |
| `--workers <n>` | `1` | Independent workers, each on its own GPU |
| `--gpus <n>` | `1` | GPUs one worker uses |
| `--context-size <n>` | `4096` | Context window the model server runs with |
| `--parallel <n>` | `1` | Concurrent sequences the runtime serves |
| `--max-attempts <n>` | `2` | How many times the **whole job** may run |

:::warning A retry starts again from the first record
`--max-attempts` counts attempts at the whole job. A retried job runs every
record again from the top, so a retry costs the whole job's time.
:::

## Queuing and capacity

A batch worker holds a **whole GPU** while it runs, exactly as a served model
does. One workload per card keeps everyone's memory arithmetic honest.

If every GPU is busy, your job **waits in a queue and starts by itself** when a
card frees up. That's `QUEUED`, and it's perfectly normal. Queued jobs start
oldest first, and a model that's serving is never stopped to make room.

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

Every record you submitted gets **exactly one line** here, in the order you sent
them, each carrying the `custom_id` it came from. So you match results by
identity, not by position, and one bad record comes back as its own error line
while the rest of the job carries on.

Results are written to a **file** by default. These are your model's answers,
and a file keeps them out of your scrollback, your screenshots and any issue you
paste.

If a result turns up whose `custom_id` can't be matched, Nodeau reports it by
line number and says so, so nothing is dropped or pinned on the wrong request.

## Cancelling

```bash
nodeau batch cancel nightly
```

Results already produced are **kept**, and `nodeau batch results` still returns
them. Nodeau waits for the model server to actually exit before it releases the
GPU, so a cancelled job can take a few seconds to finish stopping.

The local dashboard can stop a batch job too. It's the one action that page
has.

## Where your records live

On the **control-plane machine's disk**, at `/var/lib/nodeau/batch`.

- They stay on your hardware. Nodeau Cloud never receives them.
- They're never written into a Kubernetes object or a log.
- `nodeau uninstall` keeps them unless you pass `--remove-batch-data`, because
  unlike model weights they can't be downloaded again.

:::warning Two things to plan around
**Your records live on one disk.** Batch inputs and results sit on the
control-plane machine's disk, with no second copy anywhere. Back that disk up if
the results matter to you.

**Workers read their records through the control plane.** If the control plane
is down for longer than a worker's two-minute retry window, the attempt that's
running fails and `--max-attempts` decides what happens next. Serving models
never route traffic through the control plane, so this applies to batch alone.
:::

## When a job stops

| What you see | Reason code | What it means |
|---|---|---|
| Stopped at submit, before upload | None (checked on your machine) | The file is a JSON array, has an invalid line, has no `custom_id`, or is empty |
| Stopped after upload | `BATCH_INPUT_INVALID` | The records are missing, unreadable, or don't match the digest recorded at submission |
| Waiting to start | `QUEUED` | Everything's correct, and it's waiting for a card |
| Waiting to start | `BATCH_QUOTA_EXHAUSTED` | Your organisation's batch allowance is used up. A colleague who manages the policy can change it |
| Ends without producing anything | `BATCH_WORKER_UNAVAILABLE` | The worker was placed and its container never started, so nothing ran |
| Ends after running | `BATCH_FAILED` | An attempt failed for an infrastructure reason and no attempts remain |
| Stopped | `BATCH_CANCELLED` | You asked it to stop |
| On a Mac | None | Batch runs on Linux; the command says so and exits `3` |
| On the free Home plan | `FEATURE_NOT_ENTITLED` | Batch comes with Home Pro and Business |

A worker that can't start never sits on its GPU. Nodeau suspends the job, waits
until nothing holds the device, and only then marks it finished, and that order
is what releases the card.

## How Nodeau's batch fits together

- **Its own commands.** You submit with `nodeau batch submit` and collect with
  `nodeau batch results`. Each line looks like an OpenAI batch input line
  (`custom_id`, `method`, `url`, `body`), and Nodeau serves no `/v1/batches`
  endpoint, so OpenAI batch clients aren't a drop-in.
- **One model per job**, chosen with `--model`.
- **Jobs start when you submit them** and queue oldest first. Scheduled and
  recurring batches are on the [roadmap](/roadmap/).
- **Each worker keeps its card** for the life of the job.
- **A retry reruns the whole job**, from the first record.
