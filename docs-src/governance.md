---
title: Organisation limits (governance)
heading: Organisation limits
nav: Organisation limits
description: Quotas, GPU pools, fleet groups and model policy — what an organisation can limit on its own fleet, how refusals are worded, and what lowering a limit does not do.
lede: Governance is your organisation's policy over its own fleet, inside what your plan already allows. It is not your plan, and it is not the hardware.
---

:::linux
`nodeau governance` refuses on a native installation and says so. Governance
travels as annotations a Kubernetes controller reads, and a Mac does not run one.
:::

## Three different things

A workload refused by a quota **would have fitted**, and your plan **would have
permitted it**. Collapsing any two of these sends a refused person to the wrong
place.

| | What it is | Remedy | Reason code |
|---|---|---|---|
| **Limit** | What your plan grants | A purchase | `LIMIT_REACHED`, `FEATURE_NOT_ENTITLED` |
| **Quota** | Your organisation's own number, set inside the limit | A colleague, this minute | `QUOTA_EXCEEDED` |
| **Permission** | What a principal in your organisation may do | An administrator | — |

Each has its own code, and a governance refusal can never carry a capacity or an
entitlement code — because the code being right is no help if the sentence sends
somebody to a plan.

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

| Flag | What it limits |
|---|---|
| `--max-workloads <n>` | The most workloads that may run at once. `0` removes the quota |
| `--max-gpus <n>` | The most graphics cards in use at once. `0` removes the quota |
| `--max-batch-workers <n>` | The most batch workers at once. `0` removes the quota |
| `--allow-model <id>` | Permit a model, by **the id a workload runs under**. Repeatable |
| `--allow-device <uuid>` | Permit a graphics card, by UUID. Repeatable |
| `--allow-node <name>` | Permit a machine, by name. Repeatable |
| `--clear` | Remove every governance setting from this fleet |

The same policy can be set from `app.nodeau.ai`. Setting it there is remote
management and needs `FeatureRemoteManagement` — Home Pro or Business. Setting it
locally with `nodeau governance` is ungated, and **reading** a policy is free on
every plan, because somebody refused by a number has to be able to see the number
that refused them.

## Lowering a limit never stops anything

**A quota decides what may START.** Workloads already placed keep running, and you
can stop them the ordinary way when you want the capacity back.

A policy never evicts, moves, stops or restarts anything.

## Naming a model in a policy

Use **the id a workload runs under** — a catalog id, or the alias you imported a
custom model as.

```bash
nodeau governance --allow-model qwen3.5-4b-q4km
nodeau governance --allow-model finance-model
```

:::important A policy cannot name a model by its digest
An entry shaped like an artifact SHA-256 is **refused when it is written**, naming
the alias to use instead.

A model's identity really is the SHA-256 of its bytes — that rule is unchanged
everywhere else. What a policy governs is the **name**, which somebody with
machine access can re-point by importing different bytes under it. That is the
same property `--allow-node` has, and it must not be claimed away.
:::

## Naming a card

By its own UUID, never by a number that moves.

```bash
nodeau fleet list                       # shows each card's UUID
nodeau governance --allow-device GPU-…
```

A card left out of a set is **healthy and simply not one this workload may use**.

## What a pool is, and is not

A GPU pool or fleet group is a **filter on candidates**, not a reservation over
them. Nodeau holds no devices at all, so a pool can never be "full", "busy", "in
use" or "unavailable" — it either leaves an eligible machine or it does not.

If it leaves none, the refusal is `POOL_RESTRICTED`.

## Where governance sits in the decision

Governance narrows the candidate set **before** any capacity arithmetic. That
ordering is what makes the refusal honest: a workload refused by a limit is told
it was a limit, in your organisation's own words, and never as though it did not
fit.

A policy cannot make hardware that cannot hold a model able to hold it, and it is
not a scheduling decision — it narrows the set, and the scheduler still chooses,
with the arithmetic it would have used anyway.

## Finding out which policy refused you

```bash
nodeau service explain <name>
```

The refusal names the code, says which of the three it was, and — for a model
policy — prints what **is** permitted here.

| Code | Meaning |
|---|---|
| `QUOTA_EXCEEDED` | The organisation's own number is spent |
| `POOL_RESTRICTED` | A pool or fleet group left no eligible machine |
| `MODEL_NOT_PERMITTED` | An organisation's model policy disallows this model. Distinct from `MODEL_UNSUPPORTED`, which is a fact about the runtime rather than a decision somebody made |
| `BATCH_QUOTA_EXHAUSTED` | The organisation's batch allowance is spent |

## What governance is not

No priorities, no priority queues, no preemption. A policy does not evict, move,
stop or restart anything, and it is not an entitlement feature — nothing can
withhold it.

Audit, usage accounting, cost attribution, controlled release channels,
maintenance windows and air-gapped licensing are separate capabilities and are not
set here.
