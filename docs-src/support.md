---
title: Nodeau support bundles
heading: Support bundles
nav: Support bundles
description: What nodeau support bundle collects, what it leaves out, how redaction works, and how to look inside one before you send it.
lede: One file with what somebody would need in order to help, and nothing else. It is written to your disk, and it goes wherever you choose to send it.
---

```bash
nodeau support bundle
```

Writes `nodeau-support-<timestamp>.tar.gz` to the current directory.

| Flag | Meaning |
|---|---|
| `--output`, `-o` | Write to this path instead of a timestamped name |
| `--namespace`, `-n` | Namespace to collect workloads from |

## It stays on your disk

The bundle is yours. Nodeau has no endpoint to upload it to and sends it nowhere,
so if you would like us to see it, you attach it to an email yourself.

## What is in it

| Path in the archive | What |
|---|---|
| `nodeau/version.txt` | The build identity of this binary |
| `nodeau/install-state.json` | The ownership ledger: what Nodeau installed and what it adopted |
| `host/environment.yaml` | OS, kernel, processor, memory, GPUs, network, disk classification |
| `host/os-release.txt`, `host/uname.txt` | The operating system release and kernel |
| `host/doctor.yaml` | Every doctor check, with its code and detail |
| `host/container-stack.txt` | The container runtime and Kubernetes versions |
| `user/paths.txt` | Where Nodeau's directories are on this machine |
| `user/endpoints.txt` | Recorded local endpoints |
| `cluster/gpuservices.yaml` | Your services and the decisions recorded on them |
| `cluster/gpunodes.yaml` | Each machine's hardware report |
| `logs/runtime-*.txt` | Recent endpoint and runtime output |

A step that could not run is recorded as an **error entry** rather than quietly
left out, so a missing section can never be mistaken for a section with nothing in
it.

## What stays out of it

| | How |
|---|---|
| **Model weights** | By path. They are gigabytes, and nothing about them is diagnostic |
| **Your API key file** | By path, and the bundle records that it was skipped |
| **The cluster-admin kubeconfig** | By path, recorded as skipped with the reason |
| **Kubernetes Secrets** | Never collected: Nodeau's CLI has no read access to them, by design |
| **SSH keys, PEM material, node tokens** | By path and by pattern |
| **Prompts and model responses** | Nodeau never collects them at all, because they are never written to a log in the first place |
| **Batch inputs and results** | Left where they are |

## How redaction works

Redaction is a **final pass over everything assembled**, rather than something
each collector is trusted to do, so a collector added later is scrubbed like every
other.

Every secret is replaced with one fixed placeholder, so you can see at a glance
that redaction ran, and two bundles compare cleanly. Where it can, a rule **keeps
the setting name and replaces only the value**: `api_key: [REDACTED]` tells a
support engineer which setting was present, which a blank line would not.

The rules are deliberately broad: Nodeau's own key format, `Authorization` and
`Proxy-Authorization` headers however they are spelled, bearer tokens, and generic
credential assignments in JSON, YAML and environment-variable form. A false
positive costs a support engineer one question; a missed secret would cost you a
credential rotation, so the rules lean hard toward the first.

### A second scan, before anything is written

After scrubbing, the assembled content is **scanned again**, and a match at that
point **stops the bundle** rather than writing it. A support archive is the file
most likely to be emailed to a stranger without being read first, so it gets the
extra check.

:::important Take a look before you send it
Redaction is a safety net. The bundle is a plain `.tar.gz`, and reading it takes
a minute:

```bash
tar tzf nodeau-support-*.tar.gz          # what is in it
tar xzf nodeau-support-*.tar.gz -C /tmp  # read it
```
:::

## Before you send one

A few lines in the message save a round trip:

- what you ran, and what you expected,
- what happened instead, with the exact text if it is short,
- whether it happens again,
- the reason code, if there was one.

```bash
nodeau doctor --json > doctor.json
nodeau support bundle
```

Send them to [founders@nodeau.ai](mailto:founders@nodeau.ai), or use the
[contact form](/contact/?type=install).

A report from a machine we have never seen is the most useful thing we get, so
thank you!
