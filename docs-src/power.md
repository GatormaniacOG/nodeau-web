---
title: GPU power limits and scheduling budgets
heading: Power limits and budgets
nav: Power limits and budgets
description: Two different things — the software power limit a card enforces, and the scheduling power budget that decides where work goes. Neither writes firmware.
lede: A power limit changes what a card draws. A power budget changes where work goes. They are different mechanisms with different requirements, and conflating them is the mistake this page exists to prevent.
---

:::linux
Both are Linux with NVIDIA GPUs.
:::

## Two different things

| | Power limit | Scheduling budget |
|---|---|---|
| **Changes** | What a card **draws** | Where work **goes** |
| **Command** | `nodeau power set` | `nodeau scheduling constraints --power-budget` |
| **Scope** | One card, on the machine you run it on | One machine |
| **Needs privilege** | Yes, through NVIDIA's own interface | No |
| **Works where power control is unsupported** | No | Yes |
| **Survives a reboot** | No — it is reconciled | Yes, it is recorded policy |

## Reading what a card allows

```bash
nodeau power
nodeau power --json
```

Every card has a power limit it enforces and a range it will accept. Nodeau reads
both and reports them, and changes nothing unless you ask.

## Setting a limit

```bash
nodeau power set --device GPU-c080d9be-9a09-0895-7162-fdb28011a7fd --limit 250
nodeau power set --device GPU-c080d9be-… --clear
```

| Flag | Meaning |
|---|---|
| `--device <uuid>` | The card's **exact physical UUID**. Never an index |
| `--limit <watts>` | The power limit, inside that card's own accepted range |
| `--clear` | Remove the limit and report the original |

Rules Nodeau holds itself to:

- The card is named by **UUID**, never by an index, because an index moves.
- The requested watts must lie inside **that device's own currently reported
  range**, read from the device at the moment of the write.
- The current and default limits are **recorded before** any change.
- A **failed application is never reported as applied**.
- The desired state is **declarative and reconciled**, because a power limit
  survives no reboot, no driver reload and no device reset.

This is **local**: it applies to a card in the machine you run it on and never
crosses the network. There is no way to set a power limit remotely, and the
capability to do so is not built.

### What it will never write

No firmware. No VBIOS. No voltage. No clocks. No unsupported sysfs. Nodeau uses
NVIDIA's own supported power-limit interface and nothing else, and there is no
"run this privileged GPU command" surface, local or remote.

### If the card does not support it

A card whose reported range does not admit the value you asked for refuses, and
says what the range is. A card that does not support software power limits at all
is reported as such rather than silently unchanged.

## The scheduling power budget

```bash
nodeau scheduling constraints --node nodeforge --power-budget 400
nodeau scheduling constraints --node nodeforge --idle-watts 60
nodeau scheduling constraints --node nodeforge --clear
```

An operator ceiling on **predicted** power that makes a candidate infeasible. It
needs no privilege, writes nothing to any device, and works on hardware where
power-limit mutation is unsupported.

`--idle-watts` tells Nodeau what a machine draws with nothing running, so waking
it is counted as a cost rather than as free.

Constraints are **hard**: Nodeau refuses to place work rather than exceed one, and
no scheduling mode can score around them.

## Power and scheduling modes

The [scheduling mode](/docs/scheduling/#scheduling-modes) decides how much weight
predicted power carries when choosing between candidates:

| Mode | Weight |
|---|---|
| `efficiency` | The most work per unit of energy, never much slower |
| `balanced` | Fastest, while staying near the best efficiency. **The default** |
| `performance` | Fastest, whatever it costs |

`nodeau placement explain <name>` prints the predicted power of the placement it
chose and of the ones it did not.

:::note Predicted, not guaranteed
Nodeau predicts power from observations collected on your own machines. It does
not promise an energy saving, and it does not do thermal-aware scheduling.
:::
