---
title: Nodeau security and privacy
heading: Security and privacy
nav: Security and privacy
description: What crosses each boundary and what does not — local inference, the loopback bind, the API key, Nodeau Cloud, telemetry, model weights, support bundles and entitlements.
lede: Precisely what crosses each boundary, and what does not. Not "100% private" — a list of things, each of which is checkable.
---

## The shape of it

```text
  your client ──HTTP──▶ 127.0.0.1:8080 ──▶ model server ──▶ your GPU
                                             (your machine)

  your machines ──outbound HTTPS──▶ api.nodeau.ai        (optional)
                  ◀── nothing ever connects in
```

## Inference is local

Your prompts go to a model running on **your own GPU**, reached over
`127.0.0.1`. They do not traverse your network, and they do not reach Nodeau.

On a fleet, a request to a model on another machine you own crosses **your own
network** to that machine, the same way any service on your LAN would. It does not
leave for us.

## The endpoint binds loopback, and that is not a setting

The local endpoint binds `127.0.0.1` and nothing else. Not `0.0.0.0`, not a LAN
address. There is no configuration option to bind another interface.

This is enforced in code, and covered by a test that finds the machine's routable
address and asserts the endpoint does **not** answer there.

```bash
ss -tlnp | grep nodeau      # the address must be 127.0.0.1:<port>
```

`nodeau doctor` reports `NETWORK_EXPOSURE` if something on the machine makes a
model reachable from off it. **Nodeau never creates one** — if you see it,
something else did, and it is worth knowing about.

## The local API key

Generated with a CSPRNG on first use, stored `0600` in your Nodeau config
directory. It never leaves the machine: there is no server to register it with and
nothing to log in to.

It exists so that **any process on the machine cannot use your GPU just by knowing
the port**.

```bash
nodeau auth show      # print it
nodeau auth rotate    # replace it
```

It is excluded from support bundles by **both** path and content scanning.

This is a different thing from your Nodeau account — see
[two different credentials](/docs/accounts/#two-different-credentials).

## Model weights

| | |
|---|---|
| **Curated models** | Downloaded from the **publisher**, over HTTPS, from a URL pinned to an immutable revision, and verified against a SHA-256. Nodeau never republishes them, and no account or token is needed |
| **Your own models** | Copied from one directory to another **on your own machine**. Not uploaded, the name is not reported, and the questions qualification asks the model — and the answers it gives — go no further than machines you own |

Nodeau does not fetch or replicate a custom model, which is why no message will
ever tell you to "re-download" one.

## What crosses the boundary to Nodeau Cloud

Nodeau Cloud is **optional** and nothing about inference depends on it. If it is
unreachable, or you never connect, your models keep serving and your scheduler
keeps scheduling.

| What you do | What leaves the machine |
|---|---|
| Nothing | **Nothing.** No telemetry, no analytics, no crash reporting, no licence check |
| `install.sh` | A request for the release archive and its checksum |
| `nodeau install` | Requests for container images and packages, from their publishers |
| `nodeau model install` | A request for the weights, from the model's publisher |
| `nodeau model import` | **Nothing** |
| `nodeau model qualify` | **Nothing** |
| `nodeau login` | An account association and this installation's name; you receive an installation credential |
| `nodeau plan refresh` | A request for a freshly signed entitlement |
| `nodeau fleet connect` | Fleet state: which machines exist, what is plugged into them, what is running, and whether anything is wrong |

### What `fleet connect` does and does not send

**Sends**: machine and GPU inventory, workload names, phases and placements, plan
and version, whether anything needs attention.

**Does not send**: prompts, completions, embeddings, images, batch inputs, batch
results, model weights, your API key, or the contents of anything you compute.
Machine health readings stay on your hardware too — the machines appear in the
hosted console; those readings do not.

### The arrow only points out

Your machines reach **out** to `api.nodeau.ai`. Nothing ever connects **in**:

- no inbound port on your machine,
- no port forwarding on your router,
- no callback,
- no remote shell, and no arbitrary remote command,
- no way for Nodeau Cloud to initiate a connection into your network.

Operating a machine from the browser works by your machine asking what it should
do, on its own schedule.

## Telemetry

There is none. Nodeau sends nothing anywhere unless you run one of the commands
in the table above.

If opt-in telemetry is ever added it will be off by default, will state exactly
what it sends, and will never include prompts or responses. Nothing of the kind
exists.

## Logs

**Prompts, completions and batch records are never written to a log**, by design.
So they cannot appear in `nodeau logs`, in a container log, or in a support
bundle — not because a filter removes them, but because they were never written.

## Support bundles

Generated only when you run `nodeau support bundle`, written to your disk, and
sent nowhere. Model weights, your API key, kubeconfig credentials, SSH keys, PEM
material and node tokens are excluded by path; everything collected is scrubbed for
credential patterns and then **re-scanned**, and a match after scrubbing aborts the
bundle rather than writing it.

It is a plain `.tar.gz`. Open it and look before you send it. See
[support bundles](/docs/support/).

## Entitlements

An entitlement is a **signed public claim** about what a plan allows. It is not a
credential, it cannot be used to sign in, and it gives nobody access to an
account. Nothing secret is in it, which is why `nodeau plan export` can write one
to a file you carry on a stick.

It is verified **offline**, against keys compiled into the binary. Nodeau Cloud is
not consulted at verification time, so a network outage cannot change what your
hardware is allowed to do.

Nodeau Cloud **cannot reproduce a credential it issued** — only a SHA-256 is
stored.

## What Nodeau installs, and the trust you have to extend

- `install.sh` downloads one archive, **verifies its SHA-256** against the
  published manifest, and unpacks it into a directory you own. It **refuses to run
  as root** and calls no `sudo`. A checksum mismatch installs nothing.
- `nodeau install` shows what it intends to change and asks first. Every
  privileged command is printed in full. It uses your distribution's official
  package sources and pinned versions, and verifies NVIDIA's signing key against a
  known fingerprint.
- K3s is checked against a SHA-256 **compiled into the Nodeau binary** before
  anything runs it. No install script is fetched and piped into a shell.
- It will not modify your NVIDIA driver, Secure Boot, the bootloader, partitions,
  or a Kubernetes cluster it did not create.
- No privileged container is ever run.

## Your own boundaries

Two things Nodeau assumes, which are worth stating plainly:

- **Nodeau assumes the people with access to a machine are trusted.** Someone with
  a shell on your machine can read the API key file, import different bytes under
  an existing model alias, and change local policy.
- **If you put a reverse proxy in front of the loopback endpoint**, its TLS, its
  authentication and its exposure are yours. Nodeau does not create one and cannot
  reason about one.

## Reporting a vulnerability

Email [founders@nodeau.ai](mailto:founders@nodeau.ai). Please do not open a public
issue for a security problem. Include what you did, what happened, and what you
expected; if it is remotely exploitable, say so in the subject line.
