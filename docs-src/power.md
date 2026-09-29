---
title: GPU power limits and scheduling budgets in Nodeau
heading: Power limits and budgets
nav: Power limits and budgets
description: The software power limit a card enforces, and the scheduling power budget that decides where work goes. Two different tools, and how to use each.
lede: A power limit changes what a card draws. A power budget changes where work goes. They are two different tools, and knowing which is which makes both easy.
---

:::linux On Linux with NVIDIA GPUs
Both tools work on Linux machines with NVIDIA GPUs.
:::

## Two different tools

| | Power limit | Scheduling budget |
|---|---|---|
| **Changes** | What a card **draws** | Where work **goes** |
| **Command** | `nodeau power set` | `nodeau scheduling constraints --power-budget` |
| **Scope** | One card, on the machine you run it on | One machine |
| **Privilege** | Uses NVIDIA's own supported interface | None needed |
| **Needs the card to support software power limits** | Yes | No, it works on any card |
| **After a reboot** | Nodeau applies it again, because the card forgets | Kept as recorded policy |

## Reading what a card allows

```bash
nodeau power
nodeau power --json
```

Every card has a power limit it enforces and a range it accepts. Nodeau reads
both and reports them, and changes nothing until you ask.

## Setting a limit

```bash
nodeau power set --device GPU-<uuid> --limit 150
nodeau power set --device GPU-<uuid> --clear
```

Use the UUID `nodeau power` prints for your card, and a wattage inside the range
it reports.

| Flag | Meaning |
|---|---|
| `--device <uuid>` | The card's **exact physical UUID**, which stays with the card |
| `--limit <watts>` | The power limit, inside that card's own accepted range |
| `--clear` | Remove the limit and report the original |

The rules Nodeau holds itself to:

- The card is named by **UUID**, never by an index, because an index can move.
- The watts you ask for must sit inside **that card's own reported range**, read
  from the card at the moment of the write.
- The current and default limits are **recorded before** any change.
- A limit that did not apply is **never reported as applied**.
- The limit you want is **recorded and reconciled**, because a card forgets its
  power limit on every reboot, driver reload and device reset.

It is **local** by design: run it on the machine that holds the card, and the
change stays on that machine.

### What it writes

One value, through NVIDIA's own supported power-limit interface, inside the
range the card itself reports. That is the whole of it: firmware, VBIOS, voltage,
clocks and sysfs are left exactly as they are, and there is no general "run a
privileged GPU command" surface, local or remote.

### When a card has other ideas

If the value you ask for sits outside the card's reported range, Nodeau refuses
and tells you the range, so you can pick a number that fits. A card that offers no
software power limit at all is reported that way, clearly, rather than being left
to look unchanged.

## The scheduling power budget

```bash
nodeau scheduling constraints --node nodeforge --power-budget 400
nodeau scheduling constraints --node nodeforge --idle-watts 60
nodeau scheduling constraints --node nodeforge --clear
```

A ceiling on **predicted** power for one machine. Placing work there must keep
the prediction under the budget, or the machine is not a candidate for that work.
It needs no privilege, writes nothing to any device, and works on every card.

`--idle-watts` tells Nodeau what a machine draws with nothing running, so waking
it counts as a real cost rather than a free one.

Constraints are **hard**: Nodeau refuses to place work rather than exceed one, and
no scheduling mode can score its way around them. See
[hard constraints](/docs/scheduling/#hard-constraints).

## Power and scheduling modes

The [scheduling mode](/docs/scheduling/#scheduling-modes) decides how much weight
predicted power carries when Nodeau chooses between candidates:

| Mode | What it favours |
|---|---|
| `efficiency` | The most work per unit of energy, never much slower |
| `balanced` | Fastest, while staying near the best efficiency. **The default** |
| `performance` | Fastest, whatever it costs |

`nodeau placement explain <name>` prints the predicted power of the placement it
chose, and of the ones it passed over.

:::note A prediction, stated as one
Nodeau predicts power from observations collected on your own machines. It is an
estimate for choosing well, so treat any saving as something to measure on your
own meter rather than a promise.
:::
