---
title: Bring your own model (BYOM)
heading: Bring your own model
nav: Bring your own model
description: Import a GGUF file of your own, then qualify it on your hardware — what import reads, what it never executes, what qualification proves, and every failure case.
lede: Give Nodeau a GGUF file of your own. It reads the header to work out what the model needs, hashes the bytes so the file is its own identity, and then measures and probes it on a real card before saying what it can do.
---

:::linux
BYOM is qualified on Linux with an NVIDIA GPU. It builds and passes its checks
on macOS, and no Mac has run it — qualification needs a cluster a Mac deliberately
does not have. Treat it as unproven there.
:::

## The whole flow

```bash
nodeau model import ./my-model.gguf --alias finance-model
nodeau model qualify finance-model
nodeau run finance-model
```

Or in one step:

```bash
nodeau model import ./my-model.gguf --alias finance-model --qualify
```

---

## Import

```bash
nodeau model import PATH --alias NAME [flags]
```

Import reads the file's header to work out what the model is — its architecture,
the shape its KV cache depends on, its quantisation, whether it carries a chat
template — hashes the bytes, copies them into the model cache, and registers the
result under the name you choose.

### What the bytes are is the identity

A model is identified by the **SHA-256 of its contents**, not by its filename, the
alias you give it, or where it came from.

- Importing the **same bytes** twice costs no extra disk.
- Importing **different bytes** under a name you have used before creates a **new
  artifact and says so**. It never silently repoints the old one, and the previous
  qualification evidence does not carry across — because it was evidence about
  different bytes.

```text
NOTE: "finance-model" previously pointed at different bytes. This is a NEW
artifact with its own identity; the previous qualification evidence no
longer applies and is not carried across.
```

### Nothing in the file is executed

A GGUF is data. Nodeau reads the header and stops, and the model runs on Nodeau's
own pinned runtime. There is no `trust_remote_code`, no publisher script and no
download hook. The tensor offset is discarded so nothing can be tempted to seek
there, and every length declared in the file is treated as hostile until bounded.

### Importing is not qualifying

After an import, Nodeau knows what your file **says about itself**. It does not
yet know what the model can actually do on your hardware. That is what
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

Hints come from metadata and are never evidence. **Tools and structured output
are never hinted at all**: no key distinguishes a tool-trained model, and the
runtime will apply a grammar to anything and produce valid nonsense.

Nothing is inferred from a model's name, family or id.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--alias <name>` | **required** | The name you will type to run this model |
| `--namespace`, `-n` | `nodeau-dev` | Where to register it. **Must be where its workloads run** |
| `--sha256 <digest>` | — | The digest you expect. A mismatch refuses the import and copies nothing |
| `--qualify` | off | Run qualification immediately after importing |
| `--probe <list>` | — | Capabilities to try during qualification, beyond what the file suggests |
| `--no-register` | off | Place and verify the weights on this machine only, without registering a model — for a worker that should be able to run a model the control plane registered |
| `--cache-dir <path>` | `/var/lib/nodeau/models` | Model cache directory |
| `--json` | off | Machine-readable |

`--alias` and `--no-register` cannot be used together.

### What import cannot do {#what-import-cannot-do}

| | |
|---|---|
| **GGUF only** | No Safetensors, no PyTorch, no ONNX. There is **no conversion step** |
| **One file** | A **split multi-part GGUF** is not supported. Nodeau fetches and verifies one file against one SHA-256 |
| **No vision** | A vision model is two files — the weights and a multimodal projector — and Nodeau imports one. The model registers and serves **text**; image input is refused up front rather than started and broken later |
| **No licence review** | Nodeau did not choose your file and has not reviewed its licence. Custom models are listed separately from curated ones for exactly that reason |
| **Nothing is uploaded** | Your file is copied from one directory to another on your own machine. It is not sent to Nodeau Cloud, its name is not reported, and Nodeau will never tell you to "re-download" it — because it never downloaded it |

### Import failure cases

| What happened | What Nodeau does |
|---|---|
| The file is not a GGUF | Refused: magic mismatch, naming what it found instead |
| An unsupported GGUF container version | Refused, stating which versions this reader accepts |
| The header is truncated, or declares a length past the end | Refused. Every length in the file is bounded before it is trusted |
| A metadata key appears twice | Refused |
| The path is not a regular file | Refused |
| `--sha256` was given and does not match | Refused, and **nothing is copied** |
| Not enough free disk | Refused before copying, with a margin |
| The file declares no shape Nodeau can size | **Imported and intact.** Admission will refuse to schedule it rather than invent a memory figure — a guess that is too low is an out-of-memory kill |
| A valid GGUF whose architecture the runtime does not implement | Imports cleanly, phase `Unsupported`. **Your file is fine**, and a later Nodeau with a newer runtime may well run it |

The last two are worth reading twice. **Unknown is not unsupported, and
unsupported is not corrupt.**

---

## Qualification {#qualification}

```bash
nodeau model qualify finance-model [flags]
```

Nodeau starts the model, watches how much memory it really takes, exercises each
capability with a probe designed to fail if the model cannot do it, cleans up, and
records what it proved.

### Loading is not qualifying, and HTTP 200 is not a capability

Every probe asserts something a model without the capability would fail:

| Capability | What the probe asserts |
|---|---|
| `chat` | **Non-empty content first**, then a coherent answer. A 200 with nothing in it is the failure this exists for |
| `tools` | A tool call whose arguments **parse** and reflect the question — it names the city you asked about |
| `embed` | Related texts really do score **closer** than unrelated ones: repeatable, finite, and not a constant vector |
| `rerank` | The ordering responds to the query |
| `structured-output` | A `json_schema` reply **checked against the schema**, because the runtime constrains sampling and does not post-validate |
| `vision-input` | **Two different images** under a byte-identical prompt must give different answers |

### It will not waive safety on your behalf

If the model does not fit under the ordinary arithmetic, the run **reports that
and stops**. It will never quietly reduce Nodeau's safety margin to make a model
fit — a qualifier that spent the margin would always succeed and prove nothing.

Accepting that risk is a decision only you can make, with
`--accept-estimate-risk` or `--spend-safety-reserve`, spelled exactly as they are
on `nodeau run`. A qualification run that used either **records the fact
permanently**, and prediction, waived amount, which waivers were used and observed
peak are four separate fields — so a number you chose is never printed as
something Nodeau measured.

### It uses free capacity

Qualification never evicts a healthy workload. If your cards are busy, admission
refuses and the run reports it rather than waiting for ever.

### Flags

| Flag | Default | Meaning |
|---|---|---|
| `--probe <list>` | what the model declares | Which capabilities to probe |
| `--task <task>` | `chat`, or the model's own | Task to qualify |
| `--context-size <n>` | `4096` | Context window to qualify at |
| `--parallel <n>` | `1` | Concurrent sequences to qualify at |
| `--gpus <n>` | `1` | Accelerators for this one workload |
| `--dry-run` | off | Print the plan and stop, without touching a GPU |
| `--ready-timeout <d>` | `8m` | Bound on how long the runtime may take to start |
| `--timeout <d>` | `20m` | Bound on the whole run |
| `--namespace`, `-n` | `nodeau-dev` | Namespace the qualification workload runs in |
| `--json` | off | Machine-readable |

### Outcomes

Each model ends in one phase, and each capability gets its own result.

| Phase | Meaning |
|---|---|
| `Imported` | The bytes are verified and registered. Nothing is known about what they can do |
| `Inspected` | The header was read and a profile synthesised. Admission arithmetic is possible; the model has not been proven to run |
| `Qualifying` | A qualification run owns this model right now |
| `Qualified` | Every capability that was probed passed |
| `Partial` | The model runs, some probed capabilities passed and others did not. **A first-class outcome** |
| `Unsupported` | A valid artifact this build cannot serve. Not an error — your file is fine |
| `Failed` | Qualification ran and the model could not serve |
| `Disabled` | Taken out of service by its owner. Evidence is kept |

| Capability result | Meaning |
|---|---|
| `Pass` | Probed, and the probe's own assertions held |
| `Fail` | Probed, and they did not |
| `Untested` | Not probed. The zero-information state, and never rendered as a pass |
| `NotApplicable` | The question does not arise for this model |
| `Unsupported` | The runtime or platform cannot do it here |

:::important Partial is not a pass, and it is not a failure either
A model whose chat passed and whose tool calling failed is claimed **for chat and
for nothing else**. It stays usable for exactly what it proved. Nodeau will not
imply that an imported model supports a capability it has not demonstrated.
:::

### The evidence is keyed to an execution, not to a model

A qualification record names the bytes, the runtime digest, the task, the context
size, the parallelism, the cards and the schema version. Change any of those and
the record stops describing what would happen.

Concretely: **4K-context evidence never claims 128K**. Qualify again at the
configuration you intend to run.

You should re-qualify when:

- you change the **context size** or **parallelism** you intend to serve at;
- you change the **hardware** — a different card, or a card moved between machines;
- you re-import **different bytes** under the same alias (the evidence is dropped
  automatically, and Nodeau says so);
- Nodeau's **runtime** changes in a release.

### If a run is interrupted

The model stays in whatever phase it had reached, and the workload is cleaned up.
Run `nodeau model qualify` again — nothing is left holding a card.

---

## Running an imported model

```bash
nodeau run finance-model
nodeau run finance-model --task embed --port 8081
```

Exactly like a curated model, and through the same admission engine. It is
refused the same way and for the same reasons.

```bash
nodeau model list             # your own models are listed separately
nodeau model info finance-model
```

A custom model is **custom qualified**, never "Nodeau curated". Different trust
classes, listed separately, and the origin is stamped by the loader rather than
declared by the file — so the claim cannot be forged, and a forgotten stamp reads
as unknown rather than as curated.

## Where a diagnosis points

If Nodeau cannot run your model, the message says **whose gap it is**. "A gap in
Nodeau's catalog" is true for a curated model and wrong for a file you supplied,
and a remedy that sends you to fix the wrong thing costs you an afternoon.
