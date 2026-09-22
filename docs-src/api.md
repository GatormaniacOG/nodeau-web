---
title: The Nodeau API and your first request
heading: The API and your first request
nav: The API and your first request
description: The OpenAI-compatible local endpoint — base URL, authentication, chat, streaming, embeddings, reranking, tool calling, structured output, images, and the errors you will meet.
lede: Nodeau gives you an OpenAI-compatible HTTP endpoint on 127.0.0.1. Any client that can talk to OpenAI can talk to it, with a base URL and a key.
---

## The endpoint

```text
http://127.0.0.1:8080/v1
```

The port is whatever `nodeau run` or `nodeau quickstart` used — `8080` unless you
chose otherwise or that port was busy. `nodeau ps` and `nodeau status` print the
real one.

It binds `127.0.0.1` and nothing else. Not `0.0.0.0`, not a LAN address, and the
bind address is **not a setting**. Installing Nodeau must never put an inference
endpoint, or a GPU, on somebody's home network by accident.

## Authentication

Every request needs a bearer token. The endpoint forwards the `Authorization`
header to the model server, which is what enforces it — so that any process on
the machine cannot use your GPU just by knowing the port.

```bash
export NODEAU_API_KEY="$(nodeau auth show --quiet)"
```

`nodeau auth show` prints your **local** key, creating one on first use. It is
generated with a CSPRNG, stored `0600` in your Nodeau config directory, and never
leaves the machine.

That is not automatically the key a particular service enforces — a service can
reference a credential Nodeau did not publish. To get the token that will
actually be accepted:

```bash
export NODEAU_API_KEY="$(nodeau auth token qwen-local)"
```

That one checks which credential the service enforces, and refuses rather than
printing one that would be rejected. See
[the two kinds of credential](/docs/accounts/#two-different-credentials).

:::important A browser is not an API client
Opening `http://127.0.0.1:8080/v1` in a browser is not the same as making an
authenticated API call. A browser cannot attach your key, so the server
correctly refuses — and "Invalid API Key" in a browser tab almost never means
your key is wrong.
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

One Nodeau endpoint serves exactly one model, so `model` is optional. If you do
send it, it is **checked**: a request naming a different model is refused with
`404 invalid_request_error / model_not_found` rather than answered by the model
that happens to be there.

```json
{"error":{"message":"This Nodeau endpoint serves \"qwen3.5-4b-q4km\", not \"gpt-4\". One endpoint serves exactly one model, so the request was refused rather than answered by a different one.","type":"invalid_request_error","param":"model","code":"model_not_found"}}
```

Run a second model to get a second endpoint on a second port.

### Token budgets

`max_tokens` is the number of tokens the model may **generate**. On a reasoning
model the internal monologue is drawn from that same budget *before* any answer
exists, so asking for a short answer by asking for few tokens is exactly
backwards: a short answer from a reasoning model needs a large budget, because
the answer is what is left.

- Nodeau's own default, when Nodeau is the one choosing, is **2048**.
- Below **512** it will tell you the budget is too small to be an answer.
- Structured output has its own floor of **1024**, because the constrained part
  cannot begin until the thinking is done.

Nodeau never rewrites a budget you set. A client that asked for 160 asked for
160, and silently raising it would make the `usage` block a lie.

## Streaming

```bash
curl -N http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Count to five."}],
       "max_tokens":2048,"stream":true}'
```

Server-sent events, in the ordinary OpenAI shape, flushed as they arrive.

## Python, with the OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8080/v1",
    api_key="<paste the output of: nodeau auth show --quiet>",
)

reply = client.chat.completions.create(
    model="qwen3.5-4b-q4km",          # must match what this endpoint serves
    messages=[{"role": "user", "content": "What is a GGUF file?"}],
    max_tokens=2048,
)
print(reply.choices[0].message.content)
```

Any OpenAI-compatible client works the same way: point `base_url` at
`http://127.0.0.1:8080/v1` and give it the key.

## Which routes an endpoint answers

A workload is started for a **task**, and it answers that task's routes and
refuses the others. This is not a security boundary — it is there because the
model server underneath does *not* refuse: an embedding model asked for a chat
completion returns `HTTP 200` and fluent-looking nonsense.

| Task | Routes |
|---|---|
| `chat` | `/v1/chat/completions` · `/v1/completions` · `/v1/models` |
| `embed` | `/v1/embeddings` · `/v1/models` |
| `rerank` | `/v1/rerank` · `/v1/reranking` · `/v1/models` |

A request to another task's route gets `404` with
`invalid_request_error / model_not_found`, and a message saying what this
endpoint does answer. A route Nodeau does not know about is forwarded unchanged.

```bash
nodeau run <embedding-model> --task embed --port 8081
```

## Embeddings

```bash
curl http://127.0.0.1:8081/v1/embeddings \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": ["a sentence to embed", "and another"]}'
```

The curated catalog has a dedicated embedding model on the 8 GB rung.

## Reranking

```bash
curl http://127.0.0.1:8082/v1/rerank \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "how do I add a machine",
       "documents": ["nodeau fleet invite prints a code",
                     "GGUF is a model file format"]}'
```

:::note Reranking is not an OpenAI API
There is no OpenAI reranking endpoint. `/v1/rerank` follows the
Jina/Cohere convention, which is what reranking clients expect. `/v1/reranking`
is accepted as well.
:::

## Tool calling

Ordinary OpenAI tool calling: you pass `tools`, the model may answer with
`tool_calls`, and **you** execute the tool and send the result back. Nodeau does
not execute anything.

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role":"user","content":"What is the weather in Oslo?"}],
    "max_tokens": 2048,
    "tools": [{
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Current weather for a city",
        "parameters": {
          "type": "object",
          "properties": {"city": {"type": "string"}},
          "required": ["city"]
        }
      }
    }]
  }'
```

Not every model can do this. A curated model's capabilities are listed by
`nodeau model info <model>`; an imported model claims a capability only after it
has [proved it](/docs/byom/#qualification).

## Structured output

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role":"user","content":"Describe a GPU as JSON."}],
    "max_tokens": 2048,
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "gpu",
        "schema": {
          "type": "object",
          "properties": {"name": {"type":"string"}, "vram_gb": {"type":"integer"}},
          "required": ["name", "vram_gb"]
        }
      }
    }
  }'
```

:::warning This constrains sampling; it does not validate the reply
The runtime turns the schema into a grammar and restricts what the model is
allowed to emit. It does **not** parse the finished reply and check it against
the schema afterwards. Validate on your side if correctness matters to you.
:::

## Image input

Multimodal models take an image in the ordinary OpenAI content-parts shape:

```json
{
  "messages": [{
    "role": "user",
    "content": [
      {"type": "text", "text": "What is in this picture?"},
      {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KG..."}}
    ]
  }],
  "max_tokens": 2048
}
```

The curated catalog has multimodal models on the 8 GB and 12 GB rungs.

:::note An imported model cannot do images yet
A vision model is two files — the weights and a multimodal projector — and
Nodeau imports one. Image input on an imported model is refused up front, with a
notice saying whose limit that is, rather than started and broken later. See
[bring your own model](/docs/byom/#what-import-cannot-do).
:::

## What is not here

There is no supported speech, transcription, audio, text-to-speech or
image-generation capability, and no `/v1/batches`. Nodeau's own
[batch inference](/docs/batch/) is a different thing with its own CLI and is not
OpenAI Batch API compatible.

## Errors

| Status | Shape | Usually means |
|---|---|---|
| `401` | The runtime's own error | The key is wrong, or you opened the URL in a browser. See [troubleshooting](/docs/troubleshooting/#the-api-rejects-my-key) |
| `404` `model_not_found`, `param: model` | Nodeau | The request named a different model than this endpoint serves |
| `404` `model_not_found`, `param: path` | Nodeau | This endpoint's task does not answer that route |
| `413` | Nodeau | The upload is larger than the endpoint accepts |
| `502` | Nodeau | The endpoint is up and the model behind it is not. `nodeau status`, then `nodeau doctor` |

An empty `content` with `"finish_reason": "length"` is not an error — it is the
token budget running out before an answer existed. Raise `max_tokens`.

## Changing the port

```bash
nodeau run qwen-local --port 8123
```

:::note `--port` is part of what the workload *is*
It sets the loopback port **and** the in-cluster service port, and the service
port is part of the workload's identity. Re-running `run` on a different port
therefore restarts the model. Expect a short gap while the weights reload.
:::

## Reaching it from another machine

Nodeau does not do this for you, and will not put a GPU on your network by
accident. If you want a model reachable from elsewhere on a network you control,
that is your own reverse proxy in front of the loopback endpoint, with your own
TLS and your own authentication — and the
[security page](/docs/security/) is worth reading first.
