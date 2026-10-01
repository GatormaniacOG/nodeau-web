---
title: The Nodeau Playground
heading: The Playground
nav: The Playground
description: Talk to the models running on your own machine from your browser: streamed chat, questions about an image, embeddings, reranking and side by side comparison, with the machine, the GPU and the speed beside every answer.
lede: Start a model, open the Playground, and use it. Everything happens on your own machine, and every answer shows which machine and GPU produced it and how fast.
---

## Open it

On the machine where you run `nodeau`, which is the control-plane machine of a
fleet, or your Mac:

```bash
nodeau playground                 # every model running here
nodeau playground qwen-local      # with that model already chosen
```

It prints an address with a one-time sign-in token. Open it in your browser on
the same machine. The Playground is served by the same local server as
`nodeau dashboard`, on loopback only, so if the dashboard is already running,
`nodeau playground` prints the Playground's address on it and you're done.
Press Ctrl+C to stop it.

The list on the left shows the models that are **running** here, never the
whole catalog, because a model has to be running to answer. Each one says what
it does (chat, images, embeddings or reranking), which machine it's on and
which GPU it holds. A model that can't take a request right now is listed with
the reason and what to do about it.

Nothing running yet? Start something first:

```bash
nodeau run qwen3.5-4b-q4km
nodeau playground
```

## Chat

Type a message and press **Send**, or Ctrl+Enter (Cmd+Enter on a Mac). The
answer streams in as the model writes it, and Markdown and code are rendered
for reading, with a copy button on every code block. **Stop** ends the answer
there and frees the model straight away. **Retry** asks the last question again
and replaces the answer it gave. A reasoning model's thinking is kept apart from
its answer, folded away until you open it.

**Settings** holds only what a request can change: temperature, max tokens,
top-p, a seed, and whether to stream. Leave a field empty for the runtime's own
default. Context size and parallel requests belong to the running model and are
set when it starts, so they aren't offered here.

If you set **Max tokens** and a reasoning model spends them all on thinking,
the Playground tells you, so you can give it more room.

## Images

With a model that reads images, such as `gemma-4-e4b-qat-q4-0`, the chat has a
place to add an image: choose a PNG, JPEG or WebP up to 10 MB, or drop one on
it. A WebP is redrawn as a PNG on the page, because that's what the model's
runtime reads. The image goes from your browser to Nodeau on your machine and
to the model, and is held only for that request. Models that don't read images
don't offer it.

## Embeddings

Add one or more texts and press **Create embeddings**. For each text you see
how many dimensions the vector has, its first few values and its length.
**Copy the full JSON** copies every value exactly as the model returned it,
ready to paste into your own code.

## Reranking

Write a query, add the passages you want ranked, and press **Rank passages**.
They come back in the order of the model's own scores, highest first, with
each score shown beside its passage.

Batch jobs run from the command line; see [batch inference](/docs/batch/).

## Where the answer came from

Beside every model the Playground shows where it runs: the machine, the GPU,
and on Linux the memory Nodeau predicted for it when it admitted it. **Why
this GPU?** shows the placement Nodeau recorded: the machine and card it chose,
the rule that decided, the scheduling mode, and the speed it predicted.

Under every answer, each figure says who measured it:

| Figure | Measured by |
|---|---|
| Time to first token, total time | the Playground page, in your browser |
| Prompt processing time, tokens generated, tokens per second, runtime build | the model's runtime, which reports them with the answer |
| Predicted peak memory | Nodeau's admission check, when the model was placed |

A figure nobody reported is shown as missing, never as zero.

## Inspect and copy

**Inspect the request and the response** shows the exact request the page
sent and the response it got back, the model's own endpoint and the HTTP
status. A streamed answer is shown assembled into one response.

**Copy this call as code** gives you the same request as cURL or Python, aimed
at the model's own endpoint, ready to run on this machine. On Linux it fills
the key the endpoint checks with:

```bash
export NODEAU_API_KEY="$(nodeau auth token qwen-local)"
```

On a Mac the endpoint answers only programs on the Mac itself and checks no
key, so the snippet has none. Python uses the official OpenAI client for chat
and embeddings; reranking uses a plain HTTP request.

## Compare

**Compare** sends one request to two or more running models at once and shows
the answers side by side, each with its own machine, GPU and figures. Choose
models that do the same kind of work: chat models together, or embedding
models together. An image is offered only when every chosen model reads images.
Each column has its own **Stop**, and stopping one leaves the others to finish.
The Playground shows what each model did and leaves the judging to you.

A **preset** saves the chosen models, the system prompt and the settings in
this browser, so a comparison you run often is one click away. A preset never
keeps a prompt or an answer.

## Your prompts stay on your machine

- The page is served by Nodeau on your machine, and your browser only ever
  talks to it. The page's content security policy holds it there.
- Nodeau sends each request to the chosen model's own endpoint on the same
  machine, and before it does, it checks that the endpoint really is that
  model's.
- Nodeau attaches your API key itself. Your browser never holds it, and it
  never appears in a copied snippet.
- No conversation is kept: closing the tab ends it.
- Nodeau Cloud never sees a prompt, an answer or an image.

## From your account

In your account at app.nodeau.ai, a running model on a connected fleet has
**Open in Playground**, which tells you the command to run and on which
machine. The Playground itself always runs on that machine, so your prompts
stay there.

## If something goes wrong

| What you see | What to do |
|---|---|
| A model isn't in the list | It isn't running on this installation. Check with `nodeau ps`, and start it with `nodeau run` |
| "has no local endpoint on this machine" | The model runs in your fleet but has no endpoint here. `nodeau run <name>` gives it one |
| "checks an API key Nodeau did not issue" | The model checks a key Nodeau did not publish. See which with `nodeau auth token <name>` |
| "answers with the identity …, so nothing was sent" | Something else is answering on that model's port. `nodeau status` shows each endpoint |
| The address doesn't open | Use the address `nodeau playground` printed, on the same machine, and keep it running |
| Port already in use | Another program has the port. Choose another with `--addr 127.0.0.1:7381` |
