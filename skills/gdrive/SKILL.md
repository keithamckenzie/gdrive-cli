---
name: gdrive
description: Interact with Google Drive via gdrive-cli. List, search, upload, download, export, organize, and manage files and permissions.
---

# /gdrive — Google Drive CLI

This is an optional AI-agent skill file for the `gdrive` CLI. It teaches an agent (Claude Code, Codex, or any agent that can load a markdown instruction file) how to drive the CLI safely. It is not a replacement for the project README — install, authentication, and credential setup live there.

## Prerequisites

Before this skill is useful, the user must have:

1. Installed the CLI (see the project README's Installation section).
2. Created Google Cloud OAuth credentials and placed the credentials file (see the README's Google Cloud Setup section).
3. Run the initial authorization flow (see the README's Authorization section).

If any command fails with an authentication or scope error, instruct the user to re-run the CLI's documented authorization flow. Do not attempt to read, write, or repair credential files, OAuth tokens, or keychain entries.

## Invocation

Detect availability before invoking:

```bash
command -v gdrive
```

- If it returns a path, run commands as `gdrive <command>`.
- If it returns nothing, the CLI is not on the user's `PATH`. Stop and direct the user to the project README's Installation section. Do not guess at alternate entrypoints, project paths, or build artifacts.

Global flags (available on all commands):

- `-c, --credentials <path>` — credentials file (CLI default applies if omitted)
- `--scope <readonly|full>` — override OAuth scope (the CLI auto-selects `readonly` for read commands and `full` for mutating commands; override only when needed)
- `--no-keychain` — use file-based token storage instead of the OS keychain

---

## Command Chooser

| Goal | Command |
|------|---------|
| Browse by folder, MIME type, or trash status | `ls` |
| Find by name or content keywords | `search` |
| Inspect MIME type and metadata for a known ID | `info` |
| Download a binary file (PDF, image, zip, etc.) | `download` |
| Export a Google Workspace file (Doc, Sheet, Slides, Drawing) | `export` |
| Replace file content | `update` |

Short aliases: `list`/`ls`, `download`/`dl`, `upload`/`up`, `copy`/`cp`, `move`/`mv`, `delete`/`rm`, `permissions`/`perms`.

---

## Commands Reference

### Listing & Discovery

```bash
gdrive ls                          # List 20 most recently modified files
gdrive ls -q "budget"              # Filter by name substring
gdrive ls -p <folderId>            # List contents of a specific folder
gdrive ls -n 50                    # Increase result limit
gdrive ls --mime application/pdf   # Filter by MIME type
gdrive ls --trashed                # Show trashed files
gdrive ls --order name             # Order results (default: modifiedTime desc)

gdrive search "Q4 report"          # Search by name
gdrive search "quarterly revenue" --full-text   # Search file contents too
gdrive search "invoice" -n 10      # Limit results

gdrive info <fileId>               # Full metadata for a file (mimeType, size, parents, etc.)
gdrive quota                       # Show storage usage
gdrive shared-drives               # List shared drives
```

### Download & Export

**Critical distinction:**
- Binary files (PDF, images, zip, etc.) → `gdrive download`
- Google Workspace files (Docs, Sheets, Slides, Drawings) → `gdrive export`

When in doubt: run `gdrive info <fileId>` and check the `mimeType`. If it starts with `application/vnd.google-apps.*`, use `export`. Otherwise use `download`.

```bash
gdrive download <fileId>                     # Download binary file to CWD
gdrive download <fileId> /tmp/output.pdf     # Specify destination
gdrive download -f <fileId>                  # Force overwrite (confirm with user first)

# Export formats by file type:
# Google Doc:    pdf, docx, txt, html, md
gdrive export <fileId> pdf                   # Google Doc → PDF
gdrive export <fileId> docx                  # Google Doc → Word
gdrive export <fileId> txt                   # Google Doc → plain text
gdrive export <fileId> html                  # Google Doc → HTML
gdrive export <fileId> md                    # Google Doc → Markdown

# Google Sheet:  pdf, xlsx, csv, tsv
gdrive export <fileId> xlsx                  # Google Sheet → Excel
gdrive export <fileId> csv                   # Google Sheet → CSV
gdrive export <fileId> tsv                   # Google Sheet → TSV

# Google Slides: pdf, pptx, txt
gdrive export <fileId> pptx                  # Google Slides → PowerPoint
gdrive export <fileId> txt                   # Google Slides → plain text

# Google Drawing: pdf, png, svg
gdrive export <fileId> png                   # Google Drawing → PNG
gdrive export <fileId> svg                   # Google Drawing → SVG

gdrive export <fileId> pdf /tmp/deck.pdf     # Export with explicit destination
gdrive export -f <fileId> pdf                # Force overwrite (confirm with user first)
```

### Upload & Update

```bash
gdrive upload report.pdf                     # Upload to Drive root
gdrive upload report.pdf -p <folderId>       # Upload into a folder
gdrive upload report.pdf -n "Q4 Report"      # Override filename
gdrive upload notes.txt --as-doc             # Convert to Google Doc
gdrive upload data.csv --as-sheet            # Convert to Google Sheet
gdrive upload file.csv --mime text/csv       # Set source MIME type explicitly

gdrive update <fileId> new-version.pdf       # Overwrite file content with a local file
```

### Organizing

```bash
gdrive mkdir "Project Docs"                  # Create folder in root
gdrive mkdir "Invoices" -p <parentFolderId>  # Create inside a folder

gdrive copy <fileId>                         # Copy a file
gdrive copy <fileId> -p <folderId>           # Copy into a folder
gdrive copy <fileId> -n "Copy of Report"     # Copy with a new name

gdrive move <fileId> <newParentId>           # Move file to folder
gdrive rename <fileId> "New Name"            # Rename a file
```

**Note:** Recursive folder upload/download is not supported. Handle folder trees manually by creating folders and uploading files individually.

### Trash & Delete

```bash
gdrive trash <fileId>       # Move to trash (recoverable)
gdrive untrash <fileId>     # Restore from trash
gdrive empty-trash          # Permanently delete all trashed files — confirm with user first
gdrive delete <fileId>      # Permanently delete, skipping trash — confirm with user first
```

### Sharing & Permissions

```bash
gdrive share <fileId> user@example.com reader      # Share read-only
gdrive share <fileId> user@example.com writer      # Share with edit access
gdrive share <fileId> user@example.com commenter   # Share as commenter
gdrive share <fileId> user@example.com organizer   # Share as organizer (shared drives)
gdrive share <fileId> user@example.com writer --no-notify         # Skip email notification
gdrive share <fileId> user@example.com writer -m "FYI, shared!"   # Custom notification message

gdrive permissions <fileId>                        # List current permissions (shows permissionIds)
gdrive unshare <fileId> <permissionId>             # Revoke a permission
```

### Misc

```bash
gdrive star <fileId>              # Star a file
gdrive unstar <fileId>            # Unstar a file
gdrive comment <fileId> "text"    # Add a comment
gdrive comments <fileId>          # List comments
gdrive revisions <fileId>         # List revision history (read-only; restoring revisions is not supported)
gdrive logout                     # Revoke OAuth tokens for both scopes — confirm with user first
gdrive --scope readonly logout    # Revoke ONLY the readonly token (leaves full-scope token intact)
gdrive --scope full logout        # Revoke ONLY the full-scope token (leaves readonly token intact)
```

---

## Common Workflows

### Find a file and download or export it
```bash
# 1. Find it
gdrive search "Q4 Budget"
# 2. Inspect the MIME type to choose the right command
gdrive info <fileId>
# 3a. Binary file (mimeType does NOT start with application/vnd.google-apps)
gdrive download <fileId>
# 3b. Google Workspace file (mimeType starts with application/vnd.google-apps)
gdrive export <fileId> xlsx   # or pdf, csv, docx, etc. — pick format for the type
```

### Replace file content
```bash
# 1. Find the file
gdrive search "Monthly Report"
# 2. Confirm the ID and name with info
gdrive info <fileId>
# 3. Overwrite — confirm with user before running
gdrive update <fileId> monthly-report-v2.pdf
```

### Upload into a folder
```bash
# 1. Find or create the target folder
gdrive ls -q "Client Docs"
gdrive mkdir "Client Docs"   # if it doesn't exist
# 2. Upload with parent
gdrive upload report.pdf -p <folderId>
```

### Revoke a specific share
```bash
# 1. Find the file
gdrive search "Proposal Draft"
# 2. List permissions to get the permissionId
gdrive permissions <fileId>
# 3. Revoke — confirm with user before running
gdrive unshare <fileId> <permissionId>
```

### Share a file with a teammate
```bash
gdrive search "Proposal Draft"
# Confirm with user before sharing
gdrive share <fileId> teammate@company.com writer
```

---

## Rules

**Read-only commands** (`ls`, `search`, `info`, `quota`, `shared-drives`, `permissions`, `comments`, `revisions`, `download`, `export`) may run without confirmation.

**Mutating commands** require explicit user intent before running. Do not infer intent — the user must have asked for the mutation.

**High-impact mutations** — always echo the action and confirm with the user before executing:
- `share` / `unshare` — changing who has access
- `trash` / `delete` / `empty-trash` — data loss risk
- `update` — overwrites file content
- `logout` — revokes auth tokens

**Low-impact mutations** (`star`, `unstar`, `rename`, `move`, `copy`, `mkdir`, `comment`) — require explicit user intent but do not need a confirmation echo. Proceed once the user has clearly asked for the action.

**`-f` (force overwrite)** — never use `-f` on `download` or `export` without explicit user confirmation that overwriting the local file is intended.

**`export` vs `download`** — use `export` for any Google Workspace file (Doc, Sheet, Slides, Drawing); use `download` for everything else. When uncertain, run `gdrive info <fileId>` and check `mimeType` first.

**File IDs** — always come from `gdrive ls`, `gdrive search`, or an explicit user-provided value. Never guess or fabricate them. (`gdrive info` consumes an ID; `gdrive permissions` produces permission IDs, not file IDs; `gdrive shared-drives` produces shared-drive IDs, not file IDs.)

**Auth errors** — if a command fails with an auth or token error, instruct the user to re-authenticate via the CLI's documented flow. Do not read, write, or repair credential files, OAuth tokens, or keychain entries.

**Large result sets** — default limit is 20. Use `-n` to increase. Warn the user if results may be truncated.

**Scope auto-selection** — the CLI automatically uses `readonly` scope for read-only commands and `full` scope for mutating ones. If a read command fails with an auth or scope error, the stored readonly token may be invalid — re-authenticate. For write commands failing with scope errors, the stored token may not have `full` scope — re-authenticate.

---

## Trust boundary

This skill orchestrates the CLI; the CLI owns all authentication and credential handling. The skill must never:

- Read, write, parse, or echo credential files, OAuth tokens, refresh tokens, or keychain entries.
- Transmit downloaded or exported file contents anywhere beyond the local filesystem path the user specified.
- Suggest workarounds that bypass the CLI's auth flow (e.g. crafting tokens, editing credential JSON, or invoking Google APIs directly).

If something appears broken at the auth layer, the correct response is always to direct the user to the CLI's documented re-authorization flow.

---

## Agent compatibility

This file is plain markdown skill instructions and is agent-agnostic.

- **Claude Code** loads it from `~/.claude/skills/gdrive/SKILL.md` (user-scoped) or `<project>/.claude/skills/gdrive/SKILL.md` (project-scoped). Once installed, the user can invoke it via `/gdrive` or by asking about Google Drive tasks.
- **Other agents** (Codex, Cursor, custom agents, etc.) can load this file through whatever skill, instruction, or system-prompt mechanism they support. Nothing in the body assumes a specific agent runtime.

See `skills/README.md` in this repo for per-agent installation steps.
