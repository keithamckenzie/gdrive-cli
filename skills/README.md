# AI-agent skill for `gdrive`

This directory contains an optional skill file that teaches an AI coding agent how to drive the `gdrive` CLI safely. The CLI works perfectly well on its own — install this only if you use an agent (Claude Code, Codex, Cursor, etc.) and want it to handle Google Drive tasks for you.

## What's here

- `gdrive/SKILL.md` — the skill itself. Plain markdown, agent-agnostic.

## Prerequisites

Install and authenticate the CLI first, per the project [README](../README.md). The skill assumes `gdrive` is on your `PATH` and that you have completed the OAuth authorization flow at least once. The skill never reads or writes credentials — all auth is delegated to the CLI.

## Installation by agent

### Claude Code (user-scoped — available in every session)

From the root of this cloned repo:

```bash
mkdir -p ~/.claude/skills
cp -r skills/gdrive ~/.claude/skills/
```

Or, if you want updates as you `git pull` this repo (also from the repo root):

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/gdrive" ~/.claude/skills/gdrive
```

After installation, `/gdrive` is available, and Claude Code will reach for the skill when you ask about Google Drive tasks.

### Claude Code (project-scoped — available only inside one project)

From the root of the project where you want it available:

```bash
mkdir -p .claude/skills
cp -r /path/to/gdrive-cli/skills/gdrive .claude/skills/
```

### Other agents

`gdrive/SKILL.md` is plain markdown with YAML frontmatter. Load it through whatever skill, instruction, or system-prompt mechanism your agent supports. The body of the file makes no assumptions about a specific agent runtime.

If your agent has no skill mechanism, you can paste the contents into a system prompt or project-level instructions file.

## Updating

The skill describes the CLI's surface. If you upgrade the CLI and notice a command flag has changed, pull the latest version of this repo and re-copy (or rely on the symlink install above).

## Security notes

The skill is designed around a hard trust boundary: it orchestrates the CLI, and the CLI owns all authentication. The skill never:

- Reads, writes, or echoes credential files, OAuth tokens, or keychain entries.
- Transmits downloaded or exported file contents anywhere beyond the local path you specify.
- Suggests bypassing the CLI's auth flow.

High-impact mutations (`share`, `unshare`, `trash`, `delete`, `empty-trash`, `update`, `logout`) require explicit user confirmation per the rules in `gdrive/SKILL.md`. Force-overwrite flags (`-f` on `download` / `export`) are gated the same way.
