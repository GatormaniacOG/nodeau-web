---
title: Accounts, plans and entitlements
heading: Accounts, plans and entitlements
nav: Accounts, plans and entitlements
description: Nodeau without an account, signing in, how a paid plan reaches a machine, offline verification, expiry and grace, air-gapped delivery, and the two kinds of credential.
lede: Nodeau runs completely without an account. Signing in adds an account association, a registered installation and a signed entitlement — which is how a paid plan reaches a machine.
---

## Nodeau without an account

Local inference, the model catalog, batch's local half, the dashboard, artifact
verification, admission and safe scheduling all work with **no connection to
Nodeau Cloud at all**, and none of them will ask for one.

An installation with no entitlement runs the free **Home** plan. Nothing that
protects you is disabled: admission, artifact verification, authentication and
every integrity check are identical on every plan.

## Two different credentials {#two-different-credentials}

This is the distinction most worth getting right, because the two live in
different security domains.

| | The local API key | The Nodeau account |
|---|---|---|
| **What it protects** | Your model endpoint, on this machine | Your Nodeau Cloud account |
| **Who issues it** | Your own machine, with a CSPRNG | Nodeau Cloud |
| **Where it lives** | `0600` in your Nodeau config directory | An installation credential, also local |
| **Does it leave the machine?** | **Never** | The installation credential is issued to this machine and stays here |
| **Commands** | `nodeau auth show`, `token`, `rotate`, `publish` | `nodeau login`, `logout`, `plan …` |
| **Needed for inference** | Yes | No |

Signing in to Nodeau Cloud does not change your API key, and rotating your API
key does not touch your account.

### The local API key

```bash
nodeau auth show            # print it, creating one on first use
nodeau auth show --quiet    # only the key, nothing on stderr
nodeau auth rotate          # replace it
```

It is generated with a CSPRNG on first use and stored `0600`. It never leaves the
machine: there is no server to register it with and nothing to log in to.

`auth show` prints your **local** key, which is not automatically the key any
particular service enforces — that depends on which Secret the service references.

```bash
nodeau auth token qwen-local    # the token that service will actually accept
nodeau auth publish qwen-local  # make your local key the one it enforces
```

`auth publish` restarts the workload, because the model server reads its key file
once at startup. Expect a short gap while the model reloads.

After `auth rotate`, every saved `curl` command and SDK configuration using the
old key stops working immediately, and a **running** service keeps enforcing the
key it started with until it restarts:

```bash
nodeau auth publish qwen-local   # or: nodeau restart qwen-local
```

The endpoint itself does not need restarting — it forwards whatever
`Authorization` header it receives and never reads the key file.

## Signing in

```bash
nodeau login
```

You are never asked to paste a token. Nodeau shows a short code, you approve it
in a browser you are already signed in to, and this machine receives its own
credential directly.

| Flag | Meaning |
|---|---|
| `--show` | Show this machine's account status and exit |
| `--name <name>` | Name for this installation (default: this machine's hostname) |
| `--no-browser` | Print the URL and code instead of opening a browser |
| `--wait <d>` | How long to wait for approval (default `10m`) |
| `--json` | Machine-readable |

Signing in gives you:

- an **account association**,
- a **registered installation**,
- a **signed entitlement**, which is how a paid plan reaches the machine.

```bash
nodeau logout
```

Removes the account link. It does not stop anything: inference, batch and every
local capability keep working, on the free Home plan. It is a **local**
operation — the installation still exists in your Nodeau account until you remove
it there, which is deliberate: a machine that has lost its network connection
must still be able to unlink itself.

## Plans

```bash
nodeau plan show
nodeau plan show --json
```

```text
Nodeau Home Pro
  Make all my GPUs work together.

  status        valid
  refreshed     2026-09-22 03:14 UTC (automatic)

Limits
  LIMIT                  ALLOWED
  MaxNodes               3
  MaxGPUs                2
  MaxGPUsPerMachine      2
  MaxUsers               1
  MaxConcurrentServices  unlimited
  MaxBatchJobs           unlimited
```

| | Home (free) | Home Pro | Business |
|---|---|---|---|
| Machines | 1 | 3 | Unlimited |
| GPUs in any one machine | 1 | 2 | Unlimited |
| Models serving at once | 2 | Unlimited | Unlimited |
| Batch jobs | — | Unlimited | Unlimited |
| Users | 1 | 1 | Unlimited |
| Several machines | — | Yes | Yes |
| Several GPUs in one machine | — | Yes | Yes |
| Batch inference | — | Yes | Yes |
| Operating a fleet from a browser | — | Yes | Yes |

**Seeing** your machines from a browser is free on every plan; **changing** one
from there is what a paid plan buys.

Home Pro is on sale. Business is priced per organisation and the way to it is
[contact](/contact/?type=business) — there is no self-service checkout, by design.

### Capabilities Nodeau has named and not built

`nodeau plan show` lists these under **Coming soon**: scheduled batch, priority
queues, model replication across machines, team RBAC, SSO and audit as a plan
difference. **No plan grants them until they exist** — a signed entitlement is the
one place the product cannot later disown a claim, so nothing is granted on a
promise.

## How an entitlement works

An entitlement is a **signed statement of what an installation may do**, verified
**offline** against keys compiled into the binary. Nothing is asked of Nodeau
Cloud at verification time, so a network outage cannot change what your hardware
is allowed to do.

It carries the features and limits **themselves**, not a plan name — so an
installation that has not updated cannot have what it is entitled to change
retroactively when the plan table moves. The plan id rides along for display.

### Refreshing

```bash
nodeau plan refresh
```

Run it after changing plan, and to renew before the current entitlement expires.
It asks Nodeau Cloud for a freshly signed entitlement, checks the signature, and
stores it **only if it verifies**.

An installation that has been set up also refreshes on a timer, roughly every six
hours with jitter.

:::note A missed refresh is never an outage
Verification is offline, so a failed refresh changes nothing: the entitlement
already on the machine keeps working until it expires, and an installation with no
entitlement at all runs the free Home plan with every safety and integrity check
intact.
:::

### Expiry and grace

| State | What it means |
|---|---|
| `valid` | Current |
| `grace` | Past its expiry and inside the grace window. **Everything still works**, and you are told |
| `expired` | Past the grace window. Paid capabilities stop being granted and the installation falls back to the free Home plan |
| `invalid` | An entitlement is present and cannot be accepted — wrong signature, wrong installation, wrong organisation |

A signed entitlement is current for about a month, with a further couple of weeks
of grace. Nothing stops working the moment it expires.

`nodeau doctor` reports `PLAN_REFRESH_STALLED` when an installation is linked to
an account and has stopped learning what that account entitles it to — which is
the condition that precedes a surprise, and the one you want to see early.

### A machine with no internet

```bash
# on a machine that can reach api.nodeau.ai
nodeau plan export -o entitlement.txt

# carry the file across, then on the offline machine
nodeau plan import entitlement.txt
```

The file holds exactly the bytes Nodeau Cloud signed. It goes through **exactly
the same checks** a fetched entitlement does — the signature against keys compiled
into the binary, the installation and organisation it names against this
machine's, and an entitlement older than the one already held is refused. **An
entitlement carried on a stick is never less verified than one fetched.**

The entitlement names the installation and organisation it was issued for, so a
file exported from one machine is **not a licence another machine can use**. This
is a way to deliver an entitlement without a network, not a way to copy one.

**Nothing secret is in the file.** An entitlement is a signed public claim about
what a plan allows — it is not a credential, it cannot be used to sign in, and it
gives nobody access to an account.

There is also `nodeau plan set --from-file`, for a token issued to you out of
band. The token is read from a file or stdin, never from a command-line argument,
so it does not reach your shell history or the process list.

### When a plan changes

A change reaches a machine when `nodeau plan refresh` runs — from the timer, or
because you ran it. Until then the machine keeps the entitlement it has.

**Lowering a plan never stops a running workload.** The new entitlement decides
what may start.

## What an account adds beyond entitlements

Signing in and [connecting a fleet](/docs/fleet/#seeing-the-fleet-from-a-browser)
gives you `app.nodeau.ai`: your machines, what is running on them, and — with
`FeatureRemoteManagement` — the ability to operate them from a browser.

Three things live there rather than in the CLI.

### What your hardware has been doing

Nodeau can tell you which workloads held which accelerators, for how long, added
up across the machines you own.

The figure is **accelerator-time taken from the scheduler's own record of what
was reserved** — not sampled from the cards. There is no GPU-utilisation
measurement behind it, and none is claimed.

If you tell Nodeau what an accelerator-hour is worth to you, it multiplies your
number by what it measured. **Until you do, it shows nothing at all.**

:::note Absent is not zero
A cost appears only where somebody entered a rate. A zero would render as "this
cost you nothing", which is a claim Nodeau is in no position to make; an absence
renders as nothing, which is the truth. A rate you deliberately set to zero is a
number you chose, and it survives.
:::

This is not billing. Nodeau does not meter, invoice or charge anything, does not
know what power, hardware or a cloud instance costs, and never produces an amount
due.

### What changed, and who changed it

Your organisation can see what changed and who changed it — **including what was
refused**, which is the event an investigation usually starts from. Kept for a
year.

It records the action, the actor and the outcome. It does not record a key, a
token, a prompt, a reply, or the contents of anything you computed.

:::note An event with no result is not a success
Events written before the trail recorded outcomes have none, and the console
shows **"not recorded"** rather than "applied". Rendering a missing outcome as a
success would invent a fact about every event that predates the field, in the
direction that hides a refusal.
:::

It is an append-oriented table with no delete route. That is not the same as a
tamper-evident or cryptographically immutable log, and Nodeau does not describe
it as one.

### Which build your fleet should be on

You can record which build your fleet should be on, and see which build it is on.
**A channel only ever moves forward.**

You can also say when Nodeau may act on your machines on its own, in your own
time zone.

:::warning Recording a desired build does not upgrade anything
It is a statement of intent you can read back. Nodeau does not upgrade a fleet
remotely — the capability is not built — and a maintenance window does not
schedule work. Updating is [the installer, on each machine](/docs/updates/).
:::

None of this is qualified on Apple Silicon: a Mac runs standalone and cannot join
a fleet, usage travels as a fleet report, and audit is a hosted surface.

## Removing an installation

From `app.nodeau.ai`, or by running `nodeau logout` on the machine. The two do
different halves: `logout` removes the local link, the console removes the
account-side record and frees the slot.

## What Nodeau Cloud cannot do

- It cannot **reproduce a credential it issued**. Only a SHA-256 is stored.
- It cannot **initiate a connection** to your machine. There is no inbound port,
  no callback and no remote shell.
- It cannot **see what you compute**. Prompts, completions, embeddings, images and
  batch records never leave your hardware.

See [security and privacy](/docs/security/).
