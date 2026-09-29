---
title: Embeddings, reranking, tools and vision with Nodeau
heading: Embeddings, reranking, tools and vision
nav: Embeddings, reranking, tools and vision
description: Beyond chat: embeddings and reranking for search and RAG, tool calling, structured output and image input, with the models that do each and a working example.
lede: Chat is where most people start, and it's far from all Nodeau runs. Here's how to get vectors, rank documents, call tools, get JSON back and ask about an image, on your own GPUs.
---

Everything on this page runs on Linux machines with NVIDIA GPUs, through the
same fit check and the same kind of endpoint as chat. A Mac runs standalone and
serves chat models, and embeddings, reranking and image input on the Mac are
[in progress](/roadmap/).

The basics of the endpoint, authentication and chat are in
[the OpenAI-compatible API](/docs/api/). Set your key first:

```bash
export NODEAU_API_KEY="$(nodeau auth show --quiet)"
```

## Which model does what

| Task | Curated models | How you call it |
|---|---|---|
| Embeddings | `qwen3-embedding-0.6b-q8_0` | `/v1/embeddings` |
| Reranking | `bge-reranker-v2-m3-q8_0` | `/v1/rerank` |
| Tool calling | `qwen3.5-4b-q4km`, `qwen3.5-9b-q4km`, `qwen3.8-27b-q4km` | `tools` in a chat completion |
| Structured output | the three Qwen models above, plus `gemma-4-e4b-qat-q4-0` and `gemma-4-12b-qat-q4-0` | `response_format` in a chat completion |
| Image input | `gemma-4-e4b-qat-q4-0` (8 GB), `gemma-4-12b-qat-q4-0` (12 GB) | image parts in a chat completion |

`nodeau model info <model>` lists exactly what a model can do, and the
[model catalog](/docs/models/#the-curated-catalog) shows which size of card each
one is for.

## Starting a workload for a task

A workload serves one model for one task, on its own port. An embedding model
or a reranker does only one thing, so Nodeau works out the task for you:

```bash
nodeau run qwen3-embedding-0.6b-q8_0 --port 8081
nodeau run bge-reranker-v2-m3-q8_0 --port 8082
```

For a model that could do more than one task, say which with `--task`, for
example `--task embed`.

A GPU belongs to one workload at a time, so each workload you want running side
by side gets a card of its own. On a machine with one GPU, free the card first
with `nodeau stop <name> --workload`, then start the next model. With more
cards, in one machine or across several machines, each workload takes its own
card and its own port, and they all serve at once.

## Embeddings

Vectors for search, clustering and retrieval-augmented generation.

```bash
nodeau run qwen3-embedding-0.6b-q8_0 --port 8081
```

```bash
curl http://127.0.0.1:8081/v1/embeddings \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": ["How do I add a machine to my fleet?",
                 "Run nodeau fleet invite on the machine you already have."]}'
```

You get the usual OpenAI embeddings response, one vector per input. With the
Python SDK:

```python
import os
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8081/v1",
                api_key=os.environ["NODEAU_API_KEY"])

result = client.embeddings.create(
    model="qwen3-embedding-0.6b-q8_0",
    input=["first text", "second text"],
)
vectors = [item.embedding for item in result.data]
```

Got a whole corpus to embed? [Batch inference](/docs/batch/) takes a file of
embedding requests and works through it on your GPUs.

## Reranking

Give it a query and a handful of documents, and it scores how well each one
answers the query. It's the step that makes retrieval sharp.

```bash
nodeau run bge-reranker-v2-m3-q8_0 --port 8082
```

```bash
curl http://127.0.0.1:8082/v1/rerank \
  -H "Authorization: Bearer $NODEAU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "how do I add a machine",
       "documents": ["nodeau fleet invite prints a code for the new machine",
                     "GGUF is a model file format",
                     "Sourdough needs a long, cold fermentation"]}'
```

The reply has a `results` list, one entry per document, each with the `index`
of the document you sent and a `relevance_score`. Higher means more relevant,
and a score can be negative, so compare them with each other rather than
against zero.

:::note The reranking request shape
OpenAI's API has no reranking endpoint, so `/v1/rerank` follows the Jina and
Cohere convention that reranking clients already speak. `/v1/reranking` works
too.
:::

A common retrieval pattern puts the two together: embed your documents once,
find the nearest few for each question, rerank those, and hand the best ones to
a chat model as context.

## Tool calling

Ordinary OpenAI tool calling. You describe your tools, the model may answer with
`tool_calls`, and your code runs the tool and sends the result back in a
message with the role `tool`. Nodeau hands you the call, and running the tool is
up to you.

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

The curated models with tool calling are the Qwen3.5 family and the flagship. A
model you import claims a capability only once it has
[proved it](/docs/byom/#qualification).

## Structured output

Ask for JSON that follows your schema:

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

Give structured output a budget of at least **1024** tokens. A reasoning model
thinks first, and the JSON can't start until the thinking is done.

:::warning Generation follows the schema; checking the result is yours
The runtime turns your schema into a grammar and holds the model to it while it
generates. It doesn't parse the finished reply and check it against the schema
afterwards, so validate on your side whenever correctness matters.
:::

## Image input

Give a model an image and ask about what it sees. The two Gemma 4 models in the
catalog read images: `gemma-4-e4b-qat-q4-0` on the 8 GB rung and
`gemma-4-12b-qat-q4-0` on the 12 GB rung.

```bash
nodeau run gemma-4-e4b-qat-q4-0
```

Images go in the ordinary OpenAI content-parts shape, as a base64 data URL:

```python
import base64, os
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8080/v1",
                api_key=os.environ["NODEAU_API_KEY"])

with open("photo.png", "rb") as f:
    image = base64.b64encode(f.read()).decode()

reply = client.chat.completions.create(
    model="gemma-4-e4b-qat-q4-0",
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "What is in this picture?"},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image}"}},
        ],
    }],
    max_tokens=2048,
)
print(reply.choices[0].message.content)
```

:::note Images and imported models
A vision model comes as two files, the weights and a multimodal projector, and
[bringing your own model](/docs/byom/) imports one file. So image input on an
imported model is declined up front with a note saying why, and the curated
Gemma 4 models are the way to work with images today.
:::
