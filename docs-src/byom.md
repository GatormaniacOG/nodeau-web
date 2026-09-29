---
title: Bring your own model (BYOM)
heading: Bring your own model
nav: Bring your own model
description: Import a GGUF file of your own, then qualify it on your hardware. What import reads, how the file stays data, what qualification proves, and how to read every result.
lede: Got a GGUF you already like? Give it to Nodeau. It reads the header to work out what the model needs, hashes the bytes so the file is its own identity, and then tests it on a real card before telling you what it can do.
---

:::linux
Bring your own model runs on Linux machines with NVIDIA GPUs. A custom model is
registered in your cluster and qualified on one of its cards, so on a Mac,
which runs Nodeau standalone, you pick from the curated catalog.
:::

## The whole flow

```bash
nodeau model import ./my-model.gguf --alias finance-model
nodeau model qualify finance-model
nodeau run finance-model
```

Or import and qualify in one go:

```bash
nodeau model import ./my-model.gguf --alias finance-model --qualify
```

That's it. Three commands, and by the end you know exactly what your model can
do on your hardware, measured rather than guessed.

---

## Import

```bash
nodeau model import PATH --alias NAME [flags]
```

Import reads the file's header to work out what the model is: its architecture,
the shape its KV cache depends on, its quantisation, and whether it carries a
chat template. Then it hashes the bytes, copies them into the model cache, and
registers the result under the name you chose.

### What the bytes are is the identity

A model is identified by the **SHA-256 of its contents**. Its filename, the alias
you give it and where it came from are all just labels.

- Importing the **same bytes** twice costs no extra disk.
- Importing **different bytes** under a name you've used before creates a **new
  artifact, and Nodeau tells you so**. The old one is never quietly repointed,
  and earlier qualification evidence stays with the bytes it was about.

```text
NOTE: "finance-model" previously pointed at different bytes. This is a NEW
artifact with its own identity; the previous qualification evidence no
longer applies and is not carried across.
```

### Your file stays data

A GGUF is data. Nodeau reads the header and stops there, and the model runs on
Nodeau's own pinned runtime. There's no `trust_remote_code`, no publisher script
and no download hook. The offset to the tensors is thrown away so nothing is
tempted to seek there, and every length the file declares is treated as
untrusted until it's been bounded.

### Importing comes before qualifying

After an import, Nodeau knows what your file **says about itself**. What the
model can actually do on your hardware is the next step, and that's what
[qualification](#qualification) is for.

### What you get back

```text
alias         finance-model
digest        9f2c4e…
architecture  llama
quantisation  Q4_K_M
parameters    7.6B
max context   32768
chat template yes

What the file suggests it can do — these are HINTS, not proof:
  chat              the file carries a chat template
  embed             the architecture is an encoder
```

Hints come from metadata, and qualification is where they become facts. **Tool
calling and structured output are never hinted at all**: no metadata key marks a
tool-trained model, and the runtime will happily apply a grammar to any model and
produce well-formed nonsense, so those two are always proven by a probe.

Nothing is inferred from a model's name, family or id.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--alias <name>` | **required** | The name you'll type to run this model |
| `--namespace`, `-n` | `nodeau-dev` | Where to register it. **It has to be where its workloads will run** |
| `--sha256 <digest>` | unset | The digest you expect. If it doesn't match, the import stops and nothing is copied |
| `--qualify` | off | Run qualification straight after importing |
| `--probe <list>` | unset | Capabilities to try during qualification, beyond what the file suggests |
| `--no-register` | off | Place and verify the weights on this machine only, without registering a model. Use it on a worker that should be able to run a model the control plane registered |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Model cache directory |
| `--json` | off | Machine-readable |

Use `--alias` or `--no-register`, one or the other.

### What import works with {#what-import-cannot-do}

| | |
|---|---|
| **GGUF files** | Import takes GGUF, the format Nodeau's llama.cpp runtime serves, and uses the file exactly as it is, with no conversion step in between |
| **One file per model** | Import takes a model that lives in a single GGUF file, and verifies that file against one SHA-256 |
| **Text from imported models** | A vision model comes as two files, the weights and a multimodal projector, and import takes one. An imported vision model registers and serves text, and Nodeau says so up front if you ask it for image input. For images, the catalog has [vision models](/docs/tasks/) ready to go |
| **Your licence, your call** | Nodeau didn't choose your file and hasn't reviewed its licence. That's why your models are listed separately from the curated ones |
| **It stays on your machine** | Your file is copied from one directory to another on your own machine. It isn't sent to Nodeau Cloud and its name isn't reported. Nodeau never downloaded it, so no remedy will ever tell you to "re-download" it |

### When an import stops

Each of these stops the import with a message saying exactly what it found.

| What happened | What Nodeau does |
|---|---|
| The file isn't a GGUF | Stops, naming what it found instead |
| The GGUF container version is one this reader doesn't know | Stops, listing the versions it accepts |
| The header is truncated, or declares a length past the end of the file | Stops. Every length in the file is bounded before it's trusted |
| A metadata key appears twice | Stops |
| The path isn't a regular file | Stops |
| `--sha256` was given and doesn't match | Stops, and **nothing is copied** |
| There isn't enough free disk | Stops before copying, with a margin |
| The file declares no shape Nodeau can size | **Imports, intact.** Admission then declines to schedule it rather than invent a memory figure, because a guess that's too low ends in an out-of-memory kill |
| A valid GGUF for an architecture the runtime doesn't implement yet | Imports cleanly, in phase `Unsupported`. **Your file is fine**, and a later Nodeau with a newer runtime may well run it |

The last two are worth a second read. **Unknown isn't unsupported, and
unsupported isn't corrupt.**

---

## Qualification {#qualification}

```bash
nodeau model qualify finance-model [flags]
```

Nodeau starts the model, watches how much memory it really takes, tries each
capability with a probe designed to fail if the model can't do it, cleans up,
and records what it proved.

### A probe has to prove the capability

Loading a model and getting an HTTP 200 back only tells you the server is up.
Every probe checks for something a model without the capability would get
wrong:

| Capability | What the probe checks |
|---|---|
| `chat` | **Non-empty content first**, then a coherent answer. An empty 200 is exactly the failure this is looking for |
| `tools` | A tool call whose arguments **parse** and reflect the question: it names the city you asked about |
| `embed` | Related texts really do score **closer** than unrelated ones, repeatably, with finite values and no constant vector |
| `rerank` | The ordering responds to the query |
| `structured-output` | A `json_schema` reply **checked against the schema** afterwards, because the runtime constrains generation with a grammar and leaves validation to the caller |
| `vision-input` | **Two different images** under a byte-identical prompt give different answers |

### Safety margins stay yours to spend

If the model doesn't fit under the ordinary arithmetic, the run **reports that
and stops**. Qualification keeps Nodeau's safety margins exactly where they are,
because a qualifier that spent them would always succeed and prove nothing.

Accepting that risk is your decision to make, with `--accept-estimate-risk` or
`--spend-safety-reserve`, spelled exactly as they are on `nodeau run`. A run that
used either **records the fact permanently**. The prediction, the amount you
waived, which waivers you used and the observed peak are four separate fields,
so a number you chose is never shown as something Nodeau measured.

### It uses free capacity

Qualification leaves healthy workloads running. If your cards are busy,
admission says so and the run reports it straight away.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--probe <list>` | what the model declares | Which capabilities to probe |
| `--task <task>` | `chat`, or the model's own | Task to qualify |
| `--context-size <n>` | `4096` | Context window to qualify at |
| `--parallel <n>` | `1` | Concurrent sequences to qualify at |
| `--gpus <n>` | `1` | Accelerators for this one workload |
| `--dry-run` | off | Print the plan and stop, without touching a GPU |
| `--ready-timeout <d>` | `8m` | How long the runtime may take to start |
| `--timeout <d>` | `20m` | How long the whole run may take |
| `--namespace`, `-n` | `nodeau-dev` | Namespace the qualification workload runs in |
| `--json` | off | Machine-readable |

### Outcomes

Each model ends in one phase, and each capability gets its own result.

| Phase | Meaning |
|---|---|
| `Imported` | The bytes are verified and registered. What they can do comes next |
| `Inspected` | The header was read and a profile worked out. Admission arithmetic is possible; the model hasn't been run yet |
| `Qualifying` | A qualification run owns this model right now |
| `Qualified` | Every capability that was probed passed |
| `Partial` | The model runs, and some probed capabilities passed while others didn't. **A first-class outcome** |
| `Unsupported` | A valid file this build can't serve yet. Your file is fine |
| `Failed` | Qualification ran and the model couldn't serve |
| `Disabled` | Taken out of service by its owner. The evidence is kept |

| Capability result | Meaning |
|---|---|
| `Pass` | Probed, and the probe's checks held |
| `Fail` | Probed, and they didn't |
| `Untested` | Not probed yet. It's never shown as a pass |
| `NotApplicable` | The question doesn't arise for this model |
| `Unsupported` | The runtime or platform can't do it here |

:::important Partial means "exactly what it proved"
A model whose chat passed and whose tool calling failed is claimed **for chat,
and only chat**. It stays usable for exactly what it proved, and Nodeau only ever
describes an imported model by the capabilities it has demonstrated.
:::

### The evidence belongs to an execution

A qualification record names the bytes, the runtime digest, the task, the
context size, the parallelism, the cards and the schema version. Change any of
those and the record no longer describes what would happen.

In practice: **evidence at a 4K context says nothing about 128K**. Qualify again
at the configuration you mean to run.

Re-qualify when:

- you change the **context size** or **parallelism** you plan to serve at;
- you change the **hardware**, whether that's a different card or a card moved
  between machines;
- you re-import **different bytes** under the same alias (the old evidence is
  dropped automatically, and Nodeau tells you);
- Nodeau's **runtime** changes in a release.

### If a run is interrupted

The model stays in whatever phase it had reached, and the workload is cleaned
up, so no card is left held. Run `nodeau model qualify` again whenever you're
ready.

---

## Running an imported model

```bash
nodeau run finance-model
nodeau run finance-model --task embed --port 8081
```

Exactly like a curated model, through the same admission engine, with the same
answers for the same reasons.

```bash
nodeau model list             # your own models are listed separately
nodeau model info finance-model
```

A custom model is **custom qualified**, which is its own trust class, separate
from "Nodeau curated". The two are listed separately. The origin is stamped by
the loader rather than declared by the file, so it can't be forged, and a
missing stamp reads as unknown rather than curated.

## Where a diagnosis points

If Nodeau can't run your model, the message says **whose gap it is**. "A gap in
Nodeau's catalog" is true for a curated model and wrong for a file you supplied,
and a remedy that sends you to fix the wrong thing costs you an afternoon. So
Nodeau names the right one.
