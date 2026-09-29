---
title: Nodeau security and privacy
heading: Security and privacy
nav: Security and privacy
description: What crosses each boundary: local inference, the loopback bind, the API key, model weights, Nodeau Cloud, fleet reports, logs, support bundles and entitlements.
lede: Precisely what crosses each boundary, and what stays put. Not a slogan, but a list of things you can check for yourself.
---

## The shape of it

```text
  your client --HTTP--> 127.0.0.1:8080 --> model server --> your GPU
                                            (your machine)

  your machines --outbound HTTPS--> api.nodeau.ai        (optional)
                  every connection starts on your side
```

## Inference is local

Your prompts go to a model running on **your own GPU**, reached over
`127.0.0.1`. They stay on your machine from request to reply.

In a fleet, a request to a model on another machine you own travels across **your
own network** to that machine, the way any service on your LAN would, and stays
within your walls.

## The endpoint binds loopback, and that is fixed

The local endpoint binds `127.0.0.1` and nothing else: not `0.0.0.0`, not a LAN
address. That is how the code is written rather than a setting, and a test finds
the machine's routable address and checks that the endpoint does **not** answer
there.

```bash
ss -tlnp | grep nodeau      # the address must be 127.0.0.1:<port>
```

`nodeau doctor` reports `NETWORK_EXPOSURE` if something on the machine makes a
model reachable from off it. Nodeau only ever binds loopback, so if you see it,
something else on the machine did it, and it is worth knowing about.

## The local API key

Generated with a CSPRNG on first use and stored `0600` in your Nodeau config
directory. It stays on the machine, because there is no server it needs to be
registered with.

It exists so that another process on the machine cannot use your GPU just by
knowing the port.

```bash
nodeau auth show      # print it
nodeau auth rotate    # replace it
```

Support bundles leave it out, both by its path and by scanning their contents for
anything shaped like a key.

It is a different thing from your Nodeau account; see
[two different credentials](/docs/accounts/#two-different-credentials).

## Model weights

| | |
|---|---|
| **Curated models** | Downloaded from the **publisher**, over HTTPS, from a URL pinned to an immutable revision, and verified against a SHA-256. Nodeau never republishes them, and no account or token is needed |
| **Your own models** | Copied from one directory to another **on your own machine**. The file, its name, and the questions qualification asks the model and its answers all stay on machines you own |

Each machine keeps its own copy of the models it runs, which is why Nodeau never
tells you to "re-download" a model you imported: the file you gave it is the only
copy there is.

## What travels to Nodeau Cloud

Nodeau Cloud is **optional**, and inference never waits on it. If it is
unreachable, or you never connect, your models keep serving and your scheduler
keeps scheduling.

| What you do | What leaves the machine |
|---|---|
| Nothing | **Nothing at all** |
| `install.sh` | A request for the release archive and its checksum |
| `nodeau install` | Requests for container images and packages, from their publishers |
| `nodeau update`, `nodeau fleet upgrade plan` | Requests for the published release channel and manifest from `get.nodeau.ai`, plus the new archive when you pass `--download` to `update` |
| `nodeau model install` | A request for the weights, from the model's publisher |
| `nodeau model import`, `nodeau model qualify` | **Nothing**: both happen entirely on your machines |
| `nodeau login` | An account association and this installation's name, in return for an installation credential |
| `nodeau plan refresh` | A request for a freshly signed entitlement |
| `nodeau fleet connect` | The fleet report, described below |

### The fleet report

After `nodeau fleet connect`, your fleet reports:

- machine and GPU inventory,
- workload names, phases and placements,
- how long each workload held its accelerators, which becomes your
  [usage](/docs/usage/),
- plan and version,
- whether anything needs attention.

It stays within that list. Prompts, completions, embeddings, images, batch inputs,
batch results, model weights and your API key never travel, and neither do the
contents of anything you compute. **Machine health readings stay on your
hardware too**: processor, memory, storage and network readings are for
`nodeau health` and the local dashboard, and the report has no field for them.

### Every connection starts on your side

Your machines reach **out** to `api.nodeau.ai`, and that is the only direction a
connection ever begins in:

- no inbound port on your machine,
- no forwarding rule on your router,
- no callback into your network,
- no remote shell, and no way to run an arbitrary command.

Operating a machine from the browser works by your machine asking what it should
do, on its own schedule, and doing only the fixed set of operations Nodeau
defines.

## Telemetry

Nodeau has no analytics, crash reporting or usage tracking of its own.

What leaves a machine is what you switch on and nothing more: after
`nodeau login`, an entitlement refresh on a timer; after `nodeau fleet connect`,
the fleet report above. Everything else in the table only happens when you run
that command.

## Logs

**Prompts, completions and batch records are never written to a log.** So they
cannot appear in `nodeau logs`, in a container log or in a support bundle, and
that is because they were never written, rather than because a filter removed
them.

## Support bundles

Made only when you run `nodeau support bundle`, written to your disk, and sent
nowhere. Model weights, your API key, kubeconfig credentials, SSH keys, PEM
material and node tokens are left out by path. Everything collected is scrubbed
for credential patterns and then **scanned again**, and a match after scrubbing
stops the bundle from being written at all.

It is a plain `.tar.gz`, so open it and look before you send it. See
[support bundles](/docs/support/).

## Entitlements

An entitlement is a **signed public claim** about what a plan allows. It is not a
credential: it cannot be used to sign in, and it opens no account. Nothing secret
is in it, which is why `nodeau plan export` can write one to a file you carry on a
stick.

It is verified **offline**, against keys compiled into the binary, so a network
outage leaves what your hardware may do exactly as it was.

Nodeau Cloud keeps only a **SHA-256 hash** of each credential it issues, so the
credential itself lives on your machine and nowhere else.

## What Nodeau installs, and what it asks you to trust

- `install.sh` downloads one archive, **verifies its SHA-256** against the
  published manifest, and unpacks it into a directory you own. It **refuses to run
  as root** and calls no `sudo`. A checksum mismatch installs nothing.
- `nodeau install` shows what it intends to change and asks first, printing every
  privileged command in full. It uses official package sources at pinned
  versions, and verifies NVIDIA's signing key against a known fingerprint.
- K3s is checked against a SHA-256 **compiled into the Nodeau binary** before
  anything runs it, so no install script is fetched and piped into a shell.
- Your NVIDIA driver, Secure Boot, the bootloader, your partitions and any
  Kubernetes cluster Nodeau did not create are left exactly as they are.
- Nodeau never runs a privileged container.

## The trust model

Two assumptions, stated plainly so you can plan around them:

- **Everyone with access to a machine is trusted.** Nodeau is built for machines
  you and your team control. Someone with a shell on the machine can read the API
  key file, import different bytes under an existing model alias, and change
  local policy.
- **A reverse proxy you put in front of the endpoint is yours.** If you publish the
  loopback endpoint through a proxy of your own, its TLS, its authentication and
  its exposure are part of your setup, and Nodeau's loopback guarantees end where
  it begins.

## Reporting a vulnerability

Email [founders@nodeau.ai](mailto:founders@nodeau.ai), and please keep a security
problem out of public issues. Include what you did, what happened and what you
expected, and if it is remotely exploitable, say so in the subject line.
