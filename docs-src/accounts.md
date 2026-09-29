---
title: Accounts, plans and entitlements in Nodeau
heading: Accounts and plans
nav: Accounts and plans
description: Nodeau with and without an account, signing in, how a paid plan reaches a machine, offline verification, expiry and grace, and carrying an entitlement to an offline machine.
lede: Nodeau works fully without an account. Signing in links a machine to you, and that is how a paid plan reaches it, as a signed entitlement the machine checks for itself.
---

## Nodeau without an account

Local inference, the model catalog, the dashboard, artifact verification,
admission and safe scheduling all work with **no connection to Nodeau Cloud**,
and none of them will ever ask for one.

An installation with no entitlement runs the free **Home** plan. Everything that
protects you is the same on every plan: admission, artifact verification,
authentication and every integrity check.

## Two different credentials {#two-different-credentials}

This is the distinction most worth getting right, because the two live in
different security domains.

| | The local API key | The Nodeau account |
|---|---|---|
| **What it protects** | Your model endpoint, on this machine | Your Nodeau Cloud account |
| **Who issues it** | Your own machine, with a CSPRNG | Nodeau Cloud |
| **Where it lives** | `0600` in your Nodeau config directory | An installation credential, also local |
| **Where it goes** | It stays on this machine | Issued to this machine, and it stays here |
| **Commands** | `nodeau auth show`, `token`, `rotate`, `publish` | `nodeau login`, `logout`, `plan …` |
| **Needed for inference** | Yes | No |

Signing in to Nodeau Cloud leaves your API key exactly as it was, and rotating
your API key leaves your account exactly as it was.

### The local API key

```bash
nodeau auth show            # print it, creating one on first use
nodeau auth show --quiet    # only the key, nothing on stderr
nodeau auth rotate          # replace it
```

It is generated with a CSPRNG on first use, stored `0600`, and stays on the
machine. It exists so that a process on the machine cannot use your GPU just by
knowing the port.

`auth show` prints your **local** key. Which key a particular service enforces
depends on which Secret the service references, so for one service's endpoint ask
Nodeau directly:

```bash
nodeau auth token qwen-local    # the token that service will actually accept
nodeau auth publish qwen-local  # make your local key the one it enforces
```

`auth publish` restarts the workload, because the model server reads its key file
once, at startup. Expect a short gap while the model reloads.

After `auth rotate`, every saved `curl` command and SDK configuration using the
old key needs the new one, and a **running** service keeps enforcing the key it
started with until it restarts:

```bash
nodeau auth publish qwen-local   # or: nodeau restart qwen-local
```

The local endpoint itself carries on as it is. It forwards whatever
`Authorization` header it receives and never reads the key file.

## Signing in

```bash
nodeau login
```

You never paste a token. Nodeau shows a short code, you approve it in a browser
you are already signed in to, and this machine receives its own credential
directly.

| Flag | Meaning |
|---|---|
| `--show` | Show this machine's account status and exit |
| `--name <name>` | Name for this installation (default: this machine's hostname) |
| `--no-browser` | Print the URL and code rather than opening a browser |
| `--wait <d>` | How long to wait for approval (default `10m`) |
| `--api <url>` | The Nodeau Cloud address (default `https://api.nodeau.ai`) |
| `--json` | Machine-readable |

Signing in gives this machine three things:

- an **account association**,
- a **registered installation**,
- a **signed entitlement**, which is how a paid plan reaches the machine.

```bash
nodeau logout
```

Removes the account link and nothing else: inference, batch and every local
capability keep working, on the free Home plan. It is a **local** operation, and
the installation stays listed in your account until you remove it there. That is
deliberate, because a machine that has lost its network connection still needs a
way to unlink itself.

## Plans

```bash
nodeau plan show
nodeau plan show --json
```

On a machine with no entitlement it looks like this:

```text
Nodeau Home
  Make my GPU useful.

  status        absent
  This installation is running the free Nodeau Home plan. Nothing is
                disabled: admission, artifact verification, authentication and every
                integrity check are the same as on a paid plan.

Capabilities
  Everything a single machine needs, and nothing that requires a
  second one. Admission, artifact verification and authentication
  are the same here as on any paid plan.

Coming soon
  · Audit
  · ModelReplication
  · PriorityQueues
  · SSO
  · ScheduledBatch
  · TeamRBAC
  Named and on the roadmap. Not included in any plan yet, and no
  entitlement grants them until they ship.

Limits
  LIMIT                  ALLOWED
  MaxNodes               1
  MaxGPUs                1
  MaxGPUsPerMachine      1
  MaxUsers               1
  MaxConcurrentServices  2
  MaxBatchJobs           0
```

`MaxGPUs` and `MaxGPUsPerMachine` carry the same number. `MaxGPUs` is the older
name for the per-machine limit, kept so that earlier releases keep reading it
correctly, and it always means **per machine**, never a fleet total.

| | Home | Home Pro | Business |
|---|---|---|---|
| **Machines** | 1 | Up to 3 | Unlimited |
| **GPUs in any one machine** | 1 | Up to 2 | Unlimited |
| **Workloads running at once** | 2 | Unlimited | Unlimited |
| **Price** | Free | $9.99 a month | Priced per organisation |

Each GPU runs one workload at a time, so the GPUs you have also set how many
workloads run at once. On a Linux machine with one GPU, that's one model at a time.

**Home Pro and Business add** several machines in one fleet, several GPUs in one
machine, batch inference, and operating your machines from the browser. Seeing
your machines from a browser is part of every plan.

Home Pro is on sale from the **Plan** page of your account at
[app.nodeau.ai](https://app.nodeau.ai/plan). Business is shaped around each
organisation, so the way in is a conversation:
[talk to us](/contact/?type=business).

### On the way

`nodeau plan show` also lists capabilities that are planned, under
**Coming soon**. A plan grants a capability only once it has shipped, because a
signed entitlement is a promise the product has to keep.

`Audit` appears in that list as a possible plan feature. The audit trail itself
is already in your account for everyone, separate from any plan: see
[usage and audit](/docs/usage/).

## How an entitlement works

An entitlement is a **signed statement of what an installation may do**, verified
**offline** against keys compiled into the binary. Nodeau Cloud plays no part at
verification time, so a network outage leaves what your hardware may do exactly
as it was.

It carries the features and limits **themselves**, rather than a plan name, so
what an installation was granted stays exactly what it was granted even as plans
evolve. The plan id rides along for display.

### Refreshing

```bash
nodeau plan refresh
```

Run it after changing plan, and to renew before the current entitlement expires.
It asks Nodeau Cloud for a freshly signed entitlement, checks the signature, and
stores it **only if it verifies**.

An installation that has been set up also refreshes on a timer, roughly every six
hours, with a little jitter.

:::note A missed refresh is never an outage
Verification is offline, so a failed refresh changes nothing: the entitlement
already on the machine keeps working until it expires, and an installation with
no entitlement at all runs the free Home plan with every safety and integrity
check intact.
:::

### Expiry and grace {#expiry-and-grace}

| State | What it means |
|---|---|
| `valid` | Current |
| `grace` | Past its expiry and inside the grace window. **Everything still works**, and you are told |
| `expired` | Past the grace window. The installation runs the free Home plan until a fresh entitlement arrives |
| `invalid` | An entitlement is present and cannot be accepted: wrong signature, wrong installation or wrong organisation |

A signed entitlement is current for about a month, followed by a couple of weeks
of grace, so a machine has plenty of time to refresh.

`nodeau doctor` reports `PLAN_REFRESH_STALLED` when an installation is linked to
an account and has stopped learning what that account entitles it to. That is
the early warning worth having, well before any grace period runs out.

### A machine with no internet

```bash
# on a machine that can reach api.nodeau.ai
nodeau plan export -o entitlement.txt

# carry the file across, then on the offline machine
nodeau plan import entitlement.txt
```

The file holds exactly the bytes Nodeau Cloud signed, and it goes through
**exactly the same checks** a fetched entitlement does: the signature against keys
compiled into the binary, the installation and organisation it names against this
machine's, and a check that it is not older than the one already held. **An
entitlement carried on a stick is exactly as verified as one fetched.**

An entitlement names the installation and organisation it was issued for, so
export and import deliver an entitlement to the machine it belongs to. They are a
way to cross an air gap, and a file exported from one machine is not a licence
for another.

**Nothing secret is in the file.** An entitlement is a signed public claim about
what a plan allows. It is not a credential, it cannot be used to sign in, and it
opens no account.

For a token issued to you directly, `nodeau plan set --from-file <path>` installs
it. The token is read from a file or from stdin, never from a command-line
argument, so it stays out of your shell history and the process list.

### When a plan changes

A change reaches a machine when `nodeau plan refresh` runs, from the timer or
because you ran it. Until then the machine keeps the entitlement it has.

**Moving to a smaller plan never stops a running workload.** The new entitlement
decides what may start from then on.

## Your account on the web

Sign in at [app.nodeau.ai](https://app.nodeau.ai/) to see:

- your **installations** and the plan each one runs under,
- your **fleet**, once you run `nodeau fleet connect`: machines, cards, what is
  running and whether anything needs attention (see
  [seeing the fleet from a browser](/docs/fleet/#seeing-the-fleet-from-a-browser)),
- **usage and audit**: what your hardware did, and who changed what (see
  [usage and audit](/docs/usage/)),
- your organisation's **limits and policies** (see
  [limits and policies](/docs/governance/)),
- your **plan** and billing.

With Home Pro or Business you can also operate the fleet from there: run and stop
workloads, set scheduling policy, drain a machine, read bounded logs, and recover
a stranded workload.

## Where the line sits

- **Your machines connect out.** Every connection to Nodeau Cloud starts on your
  machine, over HTTPS, on its own schedule. There is nothing to open on your
  router, and Nodeau Cloud has no way in.
- **Credentials are stored as hashes.** Nodeau Cloud keeps only a SHA-256 of each
  credential it issues, so the credential itself lives on your machine and
  nowhere else.
- **What you compute stays on your hardware.** Prompts, completions, embeddings,
  images and batch records are handled by your machines and stay there.

More detail, boundary by boundary: [security and privacy](/docs/security/).

## Removing an installation

From `app.nodeau.ai`, or by running `nodeau logout` on the machine. The two do
different halves: `logout` removes the local link, and removing it in your
account frees the slot it was using.
