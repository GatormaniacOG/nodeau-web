---
title: Usage and audit in your Nodeau account
heading: Usage and audit
nav: Usage and audit
description: See how long each workload held its accelerators, attach your own rate if you like, and read who changed what across your organisation, including what was refused.
lede: Your account keeps two records for you. One says what your hardware has been doing, in accelerator-hours. The other says who changed what, and how it turned out.
---

Both live on the **Usage** page of your account at
[app.nodeau.ai](https://app.nodeau.ai/). There is nothing extra to install:
usage arrives with a connected fleet, and the audit trail is written by Nodeau
Cloud as changes happen.

:::linux Usage comes from connected fleets
Usage travels in a fleet's report, so it describes Linux machines in a fleet. A
Mac runs Nodeau standalone, so its work stays on the Mac and is not part of a
fleet report.
:::

## Usage: what your hardware did for you

### Turning it on

If your machines already appear at app.nodeau.ai, you have it. Otherwise, on the
machine that runs your fleet's control plane:

```bash
nodeau login           # link this installation to your account, once
nodeau fleet connect   # start the fleet report
```

See [seeing the fleet from a browser](/docs/fleet/#seeing-the-fleet-from-a-browser)
for what the report carries.

### What the number is

**Accelerator-time.** For each workload, how many accelerators it held and for
how long, added up across the machines you own, for the window you pick on the
page. A workload that held two cards for an hour counts as two
accelerator-hours.

Each line names the workload, what kind it was (a service or a batch job), the
machine it ran on, the model, and its accelerator-hours.

### Where it comes from

The figure is taken from **the scheduler's own record of what it reserved**. It
counts the time a workload held a card, whether that card was busy or quiet at
the time. That makes it a steady answer to "who had which card, and for how
long", and it is a different measurement from how hard a card was working.
Nodeau keeps card utilisation out of this figure entirely.

### Your own rate

If you tell Nodeau what an accelerator-hour is worth to you, in your own currency,
the page multiplies your hours by it. The rate is yours: it can stand for
electricity, for what the hardware cost you, or for an internal chargeback figure.
Nodeau applies your number and leaves the judgement to you.

Until you set a rate, the page shows the hours and **no cost at all**.

:::note Absent and zero are different answers
With no rate set, the page shows no cost, and says that nobody has entered a rate
yet. A rate you deliberately set to **zero** is a number you chose, so the page
keeps it and shows a cost of zero. And when a rate is set and nothing ran in the
window, the page says that too. Three situations, three different sentences.
:::

### A record, never a bill

Usage is a record of what your hardware did for you. What you pay for Nodeau is
your plan, and usage never turns into a charge, an invoice or an amount due.

## Audit: who changed what

The **What changed** section on the same page lists every change made to your
organisation through Nodeau Cloud: what it was, who made it, when, what it was
about, and how it turned out.

It includes **what was refused**. A refusal is usually the event an
investigation starts from, so the list can show refusals on their own with one
switch.

Events are kept for **a year**, and the page says so beside the list, so you can
tell "this is everything that happened" from "this is everything that is kept".

### What an event holds

The action, the actor, the target, the time and the outcome. That is the whole
event: an audit record never holds a key, a token, a prompt, a reply, or the
contents of anything you computed.

:::note "Not recorded" is an honest answer
Events written before Nodeau began recording outcomes show **not recorded** in the
result column. Showing them as applied would invent a fact about every one of
them, and in the direction that hides a refusal.
:::

### How it is kept

The trail is an append-oriented record in Nodeau Cloud: events are added and read
back, and there is no route for editing or deleting one. It is a working history
for you and your team, which is a different thing from a tamper-evident or
cryptographically sealed log, and Nodeau describes it only as the first.

## Who can see them

Reading usage and the audit trail is part of every plan. They are about your own
organisation, and nothing about reading them is held back by a plan.

## Related

- [Accounts and plans](/docs/accounts/): signing in, and how a plan reaches a machine
- [Limits and policies](/docs/governance/): your organisation's own limits on the fleet
- [Updates and release channels](/docs/updates/): updating machines, release channels, and what a maintenance window will mean
