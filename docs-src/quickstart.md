---
title: Your first model on Nodeau
heading: Your first model
nav: Your first model
description: From a set-up machine to a running model and a working endpoint in one command, with every step explained and what to do if one of them stops.
lede: One command takes a set-up machine to a local OpenAI-compatible endpoint. Here's every step it performs, and what each one tells you.
---

Install first: [Linux](/docs/install-linux/) or [a Mac](/docs/install-macos/).

:::tabs
:::: Linux / NVIDIA
```bash
nodeau quickstart
```
:::: Apple Silicon
On a Mac the same job is one `run`:

```bash
nodeau run qwen3.5-4b-q4km
```

It resolves the model, asks before downloading, checks the fit, starts the
model on the Mac's GPU through Metal and brings up the loopback endpoint. A Mac
runs standalone and serves chat models, and `nodeau model list` shows what you
can run.
:::

## What you'll see

Quickstart starts by telling you exactly what it wants to download, and asks:

```text
Recommended starter model

  Qwen3.5-4B Q4_K_M

  Download
    ~2.55 GiB

  License
    Apache-2.0

  Downloaded from
    huggingface.co/unsloth/Qwen3.5-4B-GGUF

  Nodeau checked your graphics card and expects this to fit.
  It will refuse and explain rather than crash if it turns out not to.

Download and start it? [Y/n]
```

Then it gets on with it, one step at a time:

```text
==> downloading Qwen3.5-4B-Q4_K_M.gguf
==> model ready: /var/lib/nodeau/models/Qwen3.5-4B-Q4_K_M.gguf
==> waiting for Nodeau to admit and start it (up to 10m0s)
    ...
==> starting the local endpoint
    ...

──────────────────────────────────────
Nodeau is ready.
──────────────────────────────────────

Model
  qwen3.5-4b-q4km

Local API
  http://127.0.0.1:8080/v1

  Only this computer can reach it. It is not on your network.
```

Below the banner it prints a `curl` command you can paste exactly as it is, with
your API key pulled in by `nodeau auth show` rather than pasted into the text.
The first reply can take a few seconds while the model warms up.

Then have a look for yourself:

```bash
nodeau ps        # what's using a GPU, and where
nodeau status    # workloads, endpoints, and whether the port really answers
```

`nodeau status` reads nothing from a cache. The workload state comes from the
cluster, the endpoint state from the service manager, and "answering" from a
real connection to the port.

## What quickstart does

Every step is one of the other commands, so nothing here is magic and you can
run each part on its own.

1. **Picks the starter model** from the curated catalog: a compact general
   model of about 2.6 GB that suits an 8 GB card.
2. **Shows you the size, the licence and the source, and asks.** Several
   gigabytes over your connection should always be your decision. `--consent`
   or `--yes` answers in advance, for a script.
3. **Downloads the weights** from the publisher over HTTPS, from a URL pinned to
   an immutable revision. An interrupted download resumes.
4. **Checks the SHA-256** before the file is allowed to be used. A file that
   fails is moved aside, so the evidence survives and the next run can't mistake
   it for a good one.
5. **Creates a `GPUService`**, the declarative workload object.
6. **Checks the fit.** Nodeau predicts peak GPU memory from the model, the
   quantisation, the context window and the concurrency, and compares it with
   what your card can really offer. See [how Nodeau decides](/docs/scheduling/).
7. **Waits for the model to load** into GPU memory and start serving.
8. **Brings up the local endpoint**, a loopback reverse proxy on
   `127.0.0.1:8080`.
9. **Prints a `curl` command that works**, with your API key already wired in.

Running it again is safe: a model you already downloaded isn't fetched again,
and an existing service is reused rather than recreated.

## Options

| Flag | Default | What it does |
|---|---|---|
| `--model <id>` | `qwen3.5-4b-q4km` | Which model to install and serve |
| `--name <name>` | `qwen-local` | Name for the workload |
| `--namespace`, `-n` | `nodeau-dev` | Namespace to create it in |
| `--context-size <n>` | `4096` | Context window |
| `--parallel <n>` | `1` | Concurrent sequences |
| `--port <n>` | `8080` | Loopback port for the endpoint |
| `--timeout <d>` | `10m` | How long to wait for it to become ready |
| `--consent` | off | Agree to the download without being asked |
| `--yes`, `-y` | off | Answer yes to everything |

## Talk to it

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

If text comes back, it worked, and your own graphics card wrote it. Python,
streaming and the rest are in [the OpenAI-compatible API](/docs/api/).

:::note Give a reasoning model room to think
Several curated models reason before they answer, and that thinking comes out of
the same token budget as the answer. Ask for too few tokens and you get
`content: ""` with `finish_reason: "length"` from a GPU that's working perfectly.
Nodeau's own default budget is 2048. It always sends the budget you set, exactly
as you set it, and it tells you when that budget is too small to leave room for
an answer.
:::

## If quickstart stops

Quickstart exits `0` when your endpoint is up. Otherwise it prints what
happened and exits non-zero, and nothing it downloaded is thrown away. There are
two common reasons.

### Nodeau declined the model

Quickstart prints the whole decision on the spot. To see it again at any time:

```bash
nodeau service explain qwen-local
```

That shows the arithmetic the controller used when it decided: what the card can
address, what else is on it, the safety reserve and what the model needs, plus a
typed reason code and what to try next. It reads the recorded decision rather
than recalculating it, so it always agrees with what the platform actually did.

The usual answers:

- **`GPU_TOO_SMALL`**: try a shorter context (`--context-size 2048`) or a
  smaller model.
- **`MODEL_UNVERIFIED`** or **`MODEL_VERIFICATION_PENDING`**: the checksum
  hasn't been confirmed yet. The second one clears by itself in a moment.
- **`GPU_ALREADY_ALLOCATED`**: another workload holds the card. `nodeau ps`
  shows which.

Every code is listed in [reason codes](/docs/scheduling/#reason-codes).

### It was still starting when the wait ran out

Nothing is rolled back. The model is probably still loading, and quickstart
tells you what it last saw. `nodeau status` shows when it's ready, and
`nodeau run qwen-local` brings the endpoint up once it is.

:::note For scripts
`nodeau run` has finer exit codes than quickstart: `0` running, `2` a name it
doesn't recognise, `3` declined, and `4` still starting. A script that retries
should retry on `4` and stop on `3`. See [exit codes](/docs/cli/#exit-codes).
:::

## Stopping and starting again

```bash
nodeau stop qwen-local              # stop the endpoint, keep the model loaded
nodeau stop qwen-local --workload   # stop the model too, freeing the GPU
nodeau run qwen-local               # bring it back
```

Your downloaded model files stay put through all of these.

## Next

- [The OpenAI-compatible API](/docs/api/): chat, streaming and Python
- [Embeddings, reranking, tools and vision](/docs/tasks/): the other tasks
- [The model catalog](/docs/models/): what else you can run
- [Add and run machines](/docs/fleet/): bring in a second machine
- [CLI reference](/docs/cli/): every command
