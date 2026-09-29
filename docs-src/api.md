---
title: The Nodeau OpenAI-compatible API
heading: The OpenAI-compatible API
nav: The OpenAI-compatible API
description: The local endpoint: base URL, authentication, chat completions, streaming, Python with the OpenAI SDK, which routes an endpoint answers, and the errors you might meet.
lede: Nodeau gives you an OpenAI-compatible HTTP endpoint on 127.0.0.1. Any client that can talk to OpenAI can talk to it, with a base URL and a key.
---

## The endpoint

```text
http://127.0.0.1:8080/v1
```

The port is whichever one `nodeau run` or `nodeau quickstart` used: `8080`
unless you chose another. `nodeau ps` and `nodeau status` always print the real
one.

It binds `127.0.0.1` and nothing else, and the bind address isn't a setting.
Installing Nodeau never puts an inference endpoint, or a GPU, on your network by
accident. It works the same way on Linux and on a Mac.

This page covers the endpoint and chat. For vectors, ranking, tool calls, JSON
output and images, see
[embeddings, reranking, tools and vision](/docs/tasks/).

## Authentication

Every request carries a bearer token in the `Authorization` header, so another
process on the machine can't use your GPU just by knowing the port.

```bash
export NODEAU_API_KEY="$(nodeau auth show --quiet)"
```

`nodeau auth show` prints your **local** key, creating one the first time. It's
generated from a cryptographic random source, stored with mode `0600` in your
Nodeau config directory, and stays on the machine.

A service can be set up to enforce a different credential, for example one
created by hand. To print the token a particular service will actually accept:

```bash
export NODEAU_API_KEY="$(nodeau auth token qwen-local)"
```

That one checks which credential the service enforces, and tells you plainly if
your local key isn't it. See
[the two kinds of credential](/docs/accounts/#two-different-credentials).

:::important A browser isn't an API client
Opening `http://127.0.0.1:8080/v1` in a browser isn't the same as an
authenticated API call. A browser can't attach your key, so the server answers
"Invalid API Key". Seen in a browser tab, that almost never means your key is
wrong.
:::

## Chat completions

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "messages": [
          {"role": "system", "content": "You are concise."},
          {"role": "user",   "content": "What is a GGUF file?"}
        ],
        "max_tokens": 2048
      }'
```

### The `model` field

One Nodeau endpoint serves exactly one model, so `model` is optional. When you
do send it, Nodeau checks it. A request naming a different model gets a clear
`404` in OpenAI's own error shape, so your client's error handling makes sense
of it, and you're never quietly answered by the wrong model:

```json
{"error":{"message":"This Nodeau endpoint serves \"qwen3.5-4b-q4km\", not \"qwen3.5-9b-q4km\". One endpoint serves exactly one model, so the request was refused rather than answered by a different one. Set model to \"qwen3.5-4b-q4km\", or run \"qwen3.5-9b-q4km\" and use its own endpoint.","type":"invalid_request_error","param":"model","code":"model_not_found"}}
```

To use a second model, run it. It gets its own endpoint on its own port.

### Token budgets

`max_tokens` is how many tokens the model may **generate**. A reasoning model
thinks first, and that thinking comes out of the same budget before any answer
exists. So asking for a short answer by asking for few tokens works backwards: a
short answer from a reasoning model needs a generous budget, because the answer
is whatever's left.

- When Nodeau chooses the budget itself, it uses **2048**.
- Below **512**, Nodeau tells you the budget is too small to leave room for an
  answer.
- Structured output has its own floor of **1024**, because the constrained part
  can't start until the thinking is done.

Nodeau sends the budget you set exactly as you set it, so the `usage` block in
every reply stays true.

## Streaming

```bash
curl -N http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Count to five."}],
       "max_tokens":2048,"stream":true}'
```

Server-sent events in the usual OpenAI shape, flushed as they arrive.

## Python, with the OpenAI SDK

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8080/v1",
    api_key=os.environ["NODEAU_API_KEY"],
)

reply = client.chat.completions.create(
    model="qwen3.5-4b-q4km",          # the model this endpoint serves
    messages=[{"role": "user", "content": "What is a GGUF file?"}],
    max_tokens=2048,
)
print(reply.choices[0].message.content)
```

Streaming works the same way:

```python
stream = client.chat.completions.create(
    model="qwen3.5-4b-q4km",
    messages=[{"role": "user", "content": "Count to five."}],
    max_tokens=2048,
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

Any OpenAI-compatible client works like this: point its base URL at
`http://127.0.0.1:8080/v1` and give it the key. Set `NODEAU_API_KEY` first, as in
[authentication](#authentication).

## Which routes an endpoint answers {#which-routes-an-endpoint-answers}

A workload is started for a **task**, and it answers that task's routes:

| Task | Routes |
|---|---|
| `chat` | `/v1/chat/completions` · `/v1/completions` · `/v1/models` |
| `embed` | `/v1/embeddings` · `/v1/models` |
| `rerank` | `/v1/rerank` · `/v1/reranking` · `/v1/models` |

That keeps every reply the kind you asked for. The model server underneath would
answer an embedding model's chat request with `HTTP 200` and fluent-looking
nonsense, so Nodeau answers a request for another task's route with a `404`
(`invalid_request_error`, code `model_not_found`) and a message listing the
routes this endpoint does serve. A route Nodeau doesn't recognise is passed
through unchanged.

To start a workload for a particular task:

```bash
nodeau run qwen3-embedding-0.6b-q8_0 --task embed --port 8081
```

## Batches of requests

For a whole file of requests, Nodeau's [batch inference](/docs/batch/) runs them
on your GPUs and hands back one result per record. It has its own command and
JSONL format, rather than the OpenAI Batch API.

## Errors

| Status | From | Usually means |
|---|---|---|
| `401` | The model server | The key doesn't match, or the URL was opened in a browser. See [troubleshooting](/docs/troubleshooting/#the-api-rejects-my-key) |
| `404` `model_not_found`, `param: model` | Nodeau | The request named a different model than this endpoint serves |
| `404` `model_not_found`, `param: path` | Nodeau | This endpoint's task uses different routes |
| `502` | Nodeau | The endpoint is up and the model behind it isn't answering yet. Try `nodeau status`, then `nodeau doctor` |

An empty `content` with `"finish_reason": "length"` means the token budget ran
out before an answer existed. Raise `max_tokens`.

## Changing the port

```bash
nodeau run qwen-local --port 8123
```

:::note `--port` is part of what the workload *is*
It sets the loopback port **and** the in-cluster service port, and the service
port is part of the workload's identity. So running `run` again on a different
port restarts the model. Expect a short gap while the weights reload.
:::

## Reaching it from another machine

The endpoint lives on `127.0.0.1` by design, so a GPU never ends up on your
network by accident. When you want a model reachable from elsewhere on a
network you control, put your own reverse proxy in front of the loopback
endpoint, with your own TLS and your own authentication.
[Security and privacy](/docs/security/) is worth a read first.
