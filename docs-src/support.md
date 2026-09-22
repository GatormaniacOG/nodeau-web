---
title: Nodeau support bundles
heading: Support bundles
nav: Support bundles
description: What nodeau support bundle collects, what it deliberately excludes, how redaction works, and how to inspect one before you send it.
lede: Collect what somebody would need in order to help, and nothing else. The bundle is written to your disk and sent nowhere.
---

```bash
nodeau support bundle
```

Writes `nodeau-support-<timestamp>.tar.gz` to the current directory.

| Flag | Meaning |
|---|---|
| `--output`, `-o` | Write to this path instead of a timestamped name |
| `--namespace`, `-n` | Namespace to collect workloads from |

## Nothing is uploaded

The bundle stays on your disk. **Nodeau has no endpoint to upload it to**, and
nothing in the product sends one. If you want us to see it, you attach it to an
email yourself.

## What is in it

| Path in the archive | What |
|---|---|
| `nodeau/version.txt` | The build identity of this binary |
| `nodeau/install-state.json` | The ownership ledger — what Nodeau installed and what it adopted |
| `host/environment.yaml` | OS, kernel, processor, memory, GPUs, network, disk classification |
| `host/doctor.yaml` | Every doctor check, with its code and detail |
| `host/container-stack.txt` | The container runtime and Kubernetes versions |
| `user/paths.txt` | Where Nodeau's directories are on this machine |
| `user/endpoints.txt` | Recorded local endpoints |
| `cluster/gpuservices.yaml` | Your services and the decisions recorded on them |
| `cluster/gpunodes.yaml` | Each machine's hardware report |
| `logs/runtime-*.txt` | Recent endpoint and runtime output |

A step that could not run is recorded as an **error entry** rather than being
omitted, so a missing section is never mistaken for a section with nothing in it.

## What is deliberately excluded

| | How |
|---|---|
| **Model weights** | By path. They are gigabytes and they are not diagnostic |
| **Your API key file** | By path, and the bundle records that it was skipped |
| **The cluster-admin kubeconfig** | By path, recorded as skipped: *"it is a cluster-admin credential, excluded by path"* |
| **Kubernetes Secrets** | Never collected. Nodeau's CLI has no read access to them by design |
| **SSH keys, PEM material, node tokens** | By path and by pattern |
| **Prompts and model responses** | Nodeau **never collects them at all** — they are not written to a log in the first place |
| **Batch inputs and results** | Not collected |

## How redaction works

Redaction is a **final pass over the assembled text**, not something each
collector is trusted to do. A new collector added later that forgets to redact
still gets scrubbed.

Every secret is replaced with one fixed placeholder, so you can tell at a glance
that redaction ran, and so a diff between two bundles does not turn into noise.
Where a rule can, it **keeps the setting name and replaces only the value** —
`api_key: [REDACTED]` tells a support engineer which setting was present, which a
blank line does not.

The rules are deliberately broad: Nodeau's own key format, `Authorization` and
`Proxy-Authorization` headers however they are spelled, bearer tokens, and generic
credential assignments in JSON, YAML and environment-variable form. **A false
positive costs a support engineer one question; a false negative costs you a
credential rotation.**

### It re-scans, and aborts rather than writing

After scrubbing, the assembled content is **scanned again**. A match after
scrubbing **aborts the bundle** rather than writing it — because a support archive
is the one file most likely to be emailed to a stranger without being read first.

:::important Redaction is a safety net, not a guarantee about a file nobody has seen
It is a plain `.tar.gz`. Please do look inside before sending it.

```bash
tar tzf nodeau-support-*.tar.gz          # what is in it
tar xzf nodeau-support-*.tar.gz -C /tmp  # read it
```
:::

## Before you send one

Worth including in the message, because it saves a round trip:

- what you ran, and what you expected,
- what happened instead, with the exact text if it is short,
- whether it is reproducible,
- the reason code, if there was one.

```bash
nodeau doctor --json > doctor.json
nodeau support bundle
```

Send them to [founders@nodeau.ai](mailto:founders@nodeau.ai), or use the
[contact form](/contact/?type=install).

A report from a machine we have never seen is the most useful thing we get.
