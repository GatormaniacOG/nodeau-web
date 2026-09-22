---
title: Quickstart — your first model on Nodeau
heading: Quickstart
nav: Quickstart
description: One command from a set-up machine to a running model and a working endpoint, with every step it performs explained and what to do when one of them stops.
lede: From a set-up machine to a local OpenAI-compatible endpoint, in one command. Here is every step it performs, and what each one can tell you.
---

Install first: [Linux](/docs/install-linux/) or [macOS](/docs/install-macos/).

:::tabs
:::: Linux / NVIDIA
```bash
nodeau quickstart
```
::::  macOS / Apple Silicon
Quickstart creates a Kubernetes workload, and a Mac is not a Kubernetes node —
it runs standalone on its own execution plane. The equivalent is one command:

```bash
nodeau run <model>
```

It resolves the model, asks before downloading, runs admission, starts the model
on the Mac's GPU through Metal and brings up the loopback endpoint. `nodeau model list`
shows what you can run.
:::

## What quickstart actually does

Everything it does is one of the other commands, so nothing here is magic and
each step can be run on its own.

1. **Resolves the starter model** from the curated catalog. The default is a
   compact general model of about 2.6 GB.
2. **Tells you the size, the licence and the source, and asks.** Several
   gigabytes over somebody's connection is not a side effect any command should
   have. `--consent` or `--yes` answers in advance, for a script.
3. **Downloads the weights** from the publisher, over HTTPS, from a URL pinned to
   an immutable revision. An interrupted download resumes.
4. **Verifies the SHA-256** before the file is allowed to be used. A file that
   fails is moved aside rather than deleted, so the evidence survives, and rather
   than left in place, so the next run cannot mistake it for a good one.
5. **Creates a `GPUService`** — the declarative workload object.
6. **Admits it, or refuses it.** Nodeau predicts peak VRAM from the model, the
   quantisation, the context window and the concurrency, and compares it with
   what your card can actually offer. See [admission](/docs/scheduling/).
7. **Waits for the model to load** into VRAM and start serving.
8. **Brings up the local endpoint** — a loopback reverse proxy on
   `127.0.0.1:8080`.
9. **Prints a `curl` command that works**, with your API key already in it.

Re-running it is safe: an already-downloaded model is not fetched again, and an
existing service is reused rather than recreated.

## Options

| Flag | Default | What it does |
|---|---|---|
| `--model <id>` | the starter model | Which model to install and serve |
| `--name <name>` | `qwen-local` | Name for the workload |
| `--namespace`, `-n` | `nodeau-dev` | Namespace to create it in |
| `--context-size <n>` | `4096` | Context window |
| `--parallel <n>` | `1` | Concurrent sequences |
| `--port <n>` | `8080` | Loopback port for the endpoint |
| `--timeout <d>` | `10m` | How long to wait for it to become ready |
| `--consent` | off | Agree to the download without being asked |
| `--yes`, `-y` | off | Do not ask anything |

## What you should see

```text
Model        qwen3.5-4b-q4km   2.55 GiB   Apache-2.0
Admitted     nodeforge / NVIDIA GeForce RTX 5060 Ti
             predicted peak 4,812 MiB of 15,315 MiB available
Ready        1/1   after 34s
Endpoint     http://127.0.0.1:8080/v1
```

Then check it for yourself:

```bash
nodeau ps        # what is using a GPU, and where
nodeau status    # workloads, endpoints, and whether the port really answers
```

`nodeau status` reads nothing from a cache: the workload state comes from the
cluster, the endpoint state from the service manager, and "answering" from an
actual connection to the port.

## Calling it

```bash
export NODEAU_API_KEY="$(nodeau auth show --quiet)"

curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "messages": [{"role": "user", "content": "Say hello in one sentence."}],
        "max_tokens": 2048
      }'
```

Full detail, including Python and streaming:
[the API and your first request](/docs/api/).

:::warning Give a reasoning model room to think
Several curated models reason before they answer, and the monologue comes out of
the same token budget. Ask for too few tokens and you get `content: ""` with
`finish_reason: "length"` from a GPU that is working perfectly. Nodeau's own
default budget is 2048; it never rewrites a budget you set, because a client
that asked for 160 asked for 160 — but it will tell you when the one you chose
is too small to be an answer.
:::

## When quickstart stops

Each stop is a different thing and gets its own exit code, so a script can tell
them apart without reading the text.

| Exit | Meaning | What to do |
|---|---|---|
| `0` | Running, with an endpoint | — |
| `2` | The command was called wrongly — an unknown model id, a bad flag | Fix the command |
| `3` | **Refused**, and that will not change on its own | `nodeau service explain <name>` |
| `4` | **Not yet** — still starting, ran out of time to wait | Wait, then `nodeau status` |

The difference between 3 and 4 matters. A refusal is Nodeau declining; a
timeout is Nodeau still working. A script that retries on failure should retry
on 4 and never on 3.

### If it was refused

```bash
nodeau service explain qwen-local
```

That prints the whole arithmetic the controller used when it decided — what the
card can address, what else is on it, the safety reserve, and what the model
needs — plus a typed reason code and remedies. It does not recalculate: if it
did, it could disagree with the controller and you would have two answers with
no way to know which one the platform acted on.

Common outcomes:

- **`GPU_TOO_SMALL`** — try a smaller context (`--context-size 2048`) or a
  smaller model.
- **`MODEL_UNVERIFIED`** or **`MODEL_VERIFICATION_PENDING`** — the digest has not
  been established yet. The second clears by itself.
- **`GPU_ALREADY_ALLOCATED`** — something else holds the card.
  `nodeau ps` shows what.

Every code is listed in [reason codes](/docs/scheduling/#reason-codes).

## Stopping and starting again

```bash
nodeau stop qwen-local              # stop the endpoint, leave the model loaded
nodeau stop qwen-local --workload   # stop the model too, freeing the GPU
nodeau run qwen-local               # bring it back
```

Your downloaded model files are never touched by any of these.

## Next

- [The API and your first request](/docs/api/) — chat, streaming, embeddings,
  tools, structured output, images
- [Core concepts](/docs/concepts/) — the vocabulary Nodeau uses
- [Models and the catalog](/docs/models/) — what else you can run
- [CLI reference](/docs/cli/) — every command
