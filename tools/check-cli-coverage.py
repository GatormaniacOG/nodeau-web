#!/usr/bin/env python3
"""Fail when a shipped Nodeau command is not documented in /docs.

    python3 tools/check-cli-coverage.py

docs-src/cli-commands.txt is generated from the binary by the platform
repository's scripts/docs/dump-cli-commands.sh — one line per command, then a
tab, then every flag that command accepts. This compares it against the docs and
reports three things:

  MISSING   a command exists and the reference does not mention it
  INVENTED  the docs name a `nodeau …` command that is not in the tree
  BAD FLAG  the docs name a `--flag` that no command accepts

The second direction is the one worth having. Documentation that names a flag or
a command which does not exist is worse than documentation that is merely
incomplete: a reader types it, it fails, and they stop trusting the page. This
project has shipped that defect before — a remedy naming `nodeau model download`,
a command that has never existed — and the fix was a guard that resolves every
mention against the real command tree.

Standard library only, matching check-site.py and build-docs.py.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "docs-src" / "cli-commands.txt"
REFERENCE = ROOT / "docs-src" / "cli.md"

# Commands that exist only on macOS, so a Linux-generated list cannot contain
# them. `nodeau native` is hidden and is in NOT_PUBLIC instead.
DARWIN_ONLY: set[str] = set()

# Deliberately not part of the public surface. Each carries why, because a bare
# skip list rots into "things somebody once found inconvenient".
NOT_PUBLIC = {
    "nodeau completion": "cobra's own shell-completion generator",
    "nodeau fleet refresh-connector": "hidden; install.sh calls it, customers do not",
    "nodeau native": "hidden, macOS only; a diagnostic below the supported vocabulary",
}


def listed() -> tuple[set[str], set[str]]:
    """Every shipped command, and every flag any of them accepts."""
    commands, flags = set(), set()
    for line in LIST.read_text().splitlines():
        line = line.rstrip()
        if not line or line.startswith("#"):
            continue
        cmd, _, rest = line.partition("\t")
        commands.add(cmd.strip())
        flags.update(rest.split())
    return commands, flags


# Flags that exist only on macOS, where `nodeau install` and `nodeau uninstall`
# have different bodies. A Linux-generated list cannot contain them, so each is
# declared with the file that proves it — an exception that names its evidence
# rather than a list of things somebody found inconvenient.
DARWIN_ONLY_FLAGS = {
    "--runtime": "internal/cli/install_darwin.go",
    "--skip-path": "internal/cli/install_darwin.go",
    "--skip-binary": "internal/cli/install_darwin.go",
    "--models": "internal/cli/uninstall_darwin.go",
    "--keep-path": "internal/cli/uninstall_darwin.go",
}

# Accepted by the bootstrap script, which is not a cobra command.
BOOTSTRAP_FLAGS = {"--version", "--dir", "--yes", "--help"}

FLAG_IN_DOCS = re.compile(r"`(--[a-z0-9-]+)")


WORD = re.compile(r"^[a-z][a-z0-9-]*$")


def documented_commands(text: str, shipped: set[str]) -> tuple[set[str], set[str]]:
    """Every `nodeau …` command the reference presents, and every one it invents.

    Taken from headings and from fenced code blocks, which is where a command is
    actually shown to be typed. Prose mentions are deliberately NOT counted: a
    command named only in a sentence has not been documented, it has been
    referred to.
    """
    found: set[str] = set()
    invented: set[str] = set()

    def note(invocation: str) -> None:
        cmd, bad = resolve(invocation, shipped)
        if cmd:
            found.add(cmd)
        if bad:
            invented.add(bad)

    for m in re.finditer(r"^#{2,4}\s+`(nodeau [^`]+)`", text, re.M):
        note(m.group(1))

    for block in re.findall(r"^```[a-z]*\n(.*?)^```", text, re.S | re.M):
        for line in block.splitlines():
            line = line.strip()
            if line.startswith("nodeau "):
                note(line)

    return found, invented


def resolve(invocation: str, shipped: set[str]) -> tuple[str, str]:
    """Split an invocation into the command it names and any invented child.

    RESOLVED AGAINST THE REAL TREE, not against a shape. A sample reads
    `nodeau run qwen-local`, and `qwen-local` is a lowercase word exactly like a
    subcommand is — so a rule that stops at "the first token that is not a
    lowercase word" turns every realistic example into a command that does not
    exist. That was this checker's first version, and it reported five.

    So: descend while the next word really is a child of where we are. When it
    is not, the command is what we have — unless the command we have HAS
    children, in which case a lowercase word after it is a subcommand somebody
    has invented. `nodeau run qwen-local` resolves to `nodeau run`, which has no
    children; `nodeau model download x` resolves to `nodeau model`, which does,
    and `download` is not one of them.
    """
    parts = invocation.replace("`", "").split()
    if not parts or parts[0] != "nodeau":
        return "", ""

    current = "nodeau"
    rest = parts[1:]
    while rest and WORD.match(rest[0]) and f"{current} {rest[0]}" in shipped:
        current = f"{current} {rest[0]}"
        rest = rest[1:]

    has_children = any(c.startswith(current + " ") for c in shipped)
    if rest and WORD.match(rest[0]) and has_children:
        return (current if current != "nodeau" else ""), f"{current} {rest[0]}"
    return (current if current != "nodeau" else ""), ""


def main() -> int:
    if not LIST.exists():
        print(f"{LIST} is missing — regenerate it with dump-cli-commands.sh")
        return 2

    shipped, real_flags = listed()
    documented, invented_raw = documented_commands(REFERENCE.read_text(), shipped)

    # A parent command counts as documented when its children are: `nodeau auth`
    # is a group, and its page section is the four subcommands under it.
    covered = set(documented)
    for cmd in documented:
        parts = cmd.split()
        for i in range(2, len(parts)):
            covered.add(" ".join(parts[:i]))

    missing = sorted(shipped - covered - set(NOT_PUBLIC))
    invented = sorted(
        c for c in invented_raw
        if c not in shipped and c not in NOT_PUBLIC and c not in DARWIN_ONLY
    )

    # Flags are checked across EVERY docs page, not just the reference: an
    # invented flag in a walkthrough is the one a reader actually copies.
    allowed = real_flags | set(DARWIN_ONLY_FLAGS) | BOOTSTRAP_FLAGS
    bad_flags = []
    for md in sorted((ROOT / "docs-src").glob("*.md")):
        text = md.read_text()
        for m in FLAG_IN_DOCS.finditer(text):
            if m.group(1) in allowed:
                continue
            bad_flags.append(f"{md.name}:{text[:m.start()].count(chr(10)) + 1}  {m.group(1)}")

    for cmd in missing:
        print(f"MISSING   {cmd!r} ships and docs-src/cli.md does not document it")
    for cmd in invented:
        print(f"INVENTED  {cmd!r} is documented and is not in the command tree")
    for f in sorted(set(bad_flags)):
        print(f"BAD FLAG  {f} — no command accepts it")

    total = len(shipped)
    print(
        f"\n{total} public commands · {total - len(missing)} documented · "
        f"{len(missing)} missing · {len(invented)} invented · "
        f"{len(real_flags)} real flags · {len(set(bad_flags))} invented"
    )
    return 1 if (missing or invented or bad_flags) else 0


if __name__ == "__main__":
    sys.exit(main())
