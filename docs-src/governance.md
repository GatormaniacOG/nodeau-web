---
title: Limits and policies for your Nodeau fleet
heading: Limits and policies
nav: Limits and policies
description: Quotas, GPU pools, fleet groups and model policy: the limits your organisation can set on its own fleet, how refusals are worded, and why lowering one never stops running work.
lede: Your organisation can set its own limits on what its fleet may run, inside what your plan already allows. Set them from any machine in the fleet, or from your account on the web.
---

:::linux Policies apply to fleets of Linux machines
Limits and policies travel as settings the fleet's controller reads. A Mac runs
standalone, so on a Mac `nodeau governance` explains that and exits.
:::

## Three different things

A workload refused by a quota **would have fitted**, and your plan **would have
permitted it**. Keeping these three apart sends a refused person straight to the
right place.

| | What it is | Who can change it |
|---|---|---|
| **Limit** | What your plan grants | A plan change |
| **Quota** | Your organisation's own number, set inside the limit | A colleague, this minute |
| **Permission** | What a person in your organisation may do | An administrator |

Refusals carry their own codes: a plan limit is `LIMIT_REACHED` or
`FEATURE_NOT_ENTITLED`, and a quota is `QUOTA_EXCEEDED`. A governance refusal
never borrows a capacity or plan code, so the sentence you read always points at
the thing that actually said no.

## Setting a policy

```bash
nodeau governance                          # show the current policy
nodeau governance --max-workloads 4
nodeau governance --max-gpus 2
nodeau governance --max-batch-workers 2
nodeau governance --allow-model qwen3.5-4b-q4km --allow-model finance-model
nodeau governance --allow-device GPU-c080d9be-9a09-0895-7162-fdb28011a7fd
nodeau governance --allow-node nodeforge
nodeau governance --clear
nodeau governance --json
```

| Flag | What it sets |
|---|---|
| `--max-workloads <n>` | The most workloads that may run at once. `0` removes the quota |
| `--max-gpus <n>` | The most graphics cards in use at once. `0` removes the quota |
| `--max-batch-workers <n>` | The most batch workers at once. `0` removes the quota |
| `--allow-model <id>` | Permit a model, by **the id a workload runs under**. Repeatable |
| `--allow-device <uuid>` | Permit a graphics card, by UUID. Repeatable. The cards you permit are your **GPU pool** |
| `--allow-node <name>` | Permit a machine, by name. Repeatable. The machines you permit are your **fleet group** |
| `--clear` | Remove every governance setting from this fleet |

With no policy set, `nodeau governance` says so, and adds that nothing is limited
beyond what your plan already allows. A fleet with no policy is a working fleet,
and nothing here needs setting unless you want it.

### From the web

The same policy can be set from your account at
[app.nodeau.ai](https://app.nodeau.ai/). Changing it there is remote management,
which comes with **Home Pro** and **Business**, like every other change made from
the browser. Setting it locally with `nodeau governance` works on every plan.
**Reading** a policy is open to everyone, because somebody refused by a number
should always be able to see that number.

## Lowering a limit leaves running work alone

**A quota decides what may start.** Workloads already placed keep running, and
you can stop them the ordinary way whenever you want the capacity back.

A policy never evicts, moves, stops or restarts anything.

## Naming a model in a policy

Use **the id a workload runs under**: a catalog id, or the alias you imported a
custom model as.

```bash
nodeau governance --allow-model qwen3.5-4b-q4km
nodeau governance --allow-model finance-model
```

:::important A policy names models by the id they run under
An entry shaped like an artifact SHA-256 is **refused when it is written**, and
the message names the alias to use instead.

A model's identity really is the SHA-256 of its bytes, and that rule holds
everywhere else. What a policy governs is the **name** a workload runs under, and
somebody with access to a machine can point a name at different bytes by
importing them under it. `--allow-node` works the same way, by name.
:::

## Naming a card

By its own UUID, which stays with the card, rather than by a number that can move.

```bash
nodeau fleet list                       # shows each card's UUID
nodeau governance --allow-device GPU-…
```

A card left out of your pool is **healthy, and simply not one this workload may
use**. Nodeau says it that way.

## What a pool is

A GPU pool or a fleet group is a **filter on where work may go**. It narrows the
candidates, and it reserves nothing: a pool is never "full" or "busy", it either
leaves an eligible machine or it does not.

When it leaves none, the refusal is `POOL_RESTRICTED`.

## Where governance sits in the decision

Governance narrows the candidates **before** any capacity arithmetic. That order
is what keeps the refusal honest: a workload refused by a limit is told it was a
limit, in your organisation's own words, and never that it did not fit.

The scheduler then chooses from what is left, with exactly the arithmetic it
would have used anyway. A policy decides where work **may** go; the hardware still
decides what fits there.

## Finding out which policy refused you

```bash
nodeau service explain <name>
```

The refusal names the code, says which of the three it was, and for a model policy
prints what **is** permitted here.

| Code | Meaning |
|---|---|
| `QUOTA_EXCEEDED` | The organisation's own number is spent |
| `POOL_RESTRICTED` | A pool or fleet group left no eligible machine |
| `MODEL_NOT_PERMITTED` | The organisation's model policy leaves this model out. Distinct from `MODEL_UNSUPPORTED`, which is a fact about the runtime rather than a decision somebody made |
| `BATCH_QUOTA_EXHAUSTED` | The organisation's batch allowance is spent |

## Scope

A policy narrows where work may go and decides what may start. It never stops,
moves or evicts work that is already running.

Governance belongs to every plan: it is your organisation's own rule, and no plan
sells or withholds it. Changing it from the browser is remote management, which
comes with Home Pro and Business.

Your organisation's other settings live elsewhere:

- what your hardware has been doing, and who changed what:
  [usage and audit](/docs/usage/)
- updating machines and release channels:
  [updates and release channels](/docs/updates/)
- what your plan grants: [accounts and plans](/docs/accounts/)
