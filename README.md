# gdrive-cli

A TypeScript CLI for Google Drive API v3. List, search, upload, download, export, share, and manage files from the terminal.

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Linux](#linux)
- [Google Cloud Setup](#google-cloud-setup)
  - [1. Create a Google Cloud project](#1-create-a-google-cloud-project)
  - [2. Configure the OAuth consent screen](#2-configure-the-oauth-consent-screen)
  - [3. Create OAuth credentials](#3-create-oauth-credentials)
  - [4. Place the credentials file](#4-place-the-credentials-file)
- [Authorization](#authorization)
- [Commands](#commands)
  - [Listing and searching](#listing-and-searching)
  - [File info](#file-info)
  - [Downloading and exporting](#downloading-and-exporting)
  - [Uploading and updating](#uploading-and-updating)
  - [Organizing files](#organizing-files)
  - [Sharing and permissions](#sharing-and-permissions)
  - [Trash management](#trash-management)
  - [Comments and revisions](#comments-and-revisions)
  - [Account](#account)
- [Global Options](#global-options)
- [Scope Profiles](#scope-profiles)
- [Token Storage](#token-storage)
  - [macOS — Keychain](#macos--keychain)
  - [Windows — Credential Manager](#windows--credential-manager)
  - [Linux — Secret Service](#linux--secret-service)
  - [File-based fallback](#file-based-fallback)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Using a Different Package Manager](#using-a-different-package-manager)
- [Uninstalling](#uninstalling)
- [Feedback](#feedback)
- [License](#license)

## Features

- Full Google Drive v3 API coverage: list, search, download, export, upload, update, copy, move, rename, trash, delete, share, comment, and more
- Scope profiles: `readonly` for safe day-to-day use, `full` only when writing
- Native keychain integration on macOS, Windows, and Linux
- PKCE-secured OAuth 2.0 flow with local callback server
- Error output automatically redacts tokens, keys, and emails
- Works with personal Google accounts and Google Workspace

## Requirements

- **Node.js 18+** (LTS recommended)
- **pnpm** (recommended — the lockfile is `pnpm-lock.yaml`). npm, Yarn, and Bun also work; see [Using a Different Package Manager](#using-a-different-package-manager).
- A Google Cloud project with Drive API enabled (see [Google Cloud Setup](#google-cloud-setup))

## Installation

### macOS

```bash
# Install Node.js and pnpm if you don't have them
brew install node
npm install -g pnpm

# Clone and build
git clone https://github.com/keithamckenzie/gdrive-cli.git
cd gdrive-cli
pnpm install
pnpm run build

# Link globally so 'gdrive' is available everywhere
pnpm link --global
```

Verify the installation:

```bash
gdrive --version
```

### Windows

```powershell
# Install Node.js from https://nodejs.org (LTS)
# Then in PowerShell or Command Prompt:
npm install -g pnpm
git clone https://github.com/keithamckenzie/gdrive-cli.git
cd gdrive-cli
pnpm install
pnpm run build
pnpm link --global
```

Verify the installation:

```powershell
gdrive --version
```

> **Note:** On Windows, tokens are stored in Windows Credential Manager by default. No extra configuration needed.

### Linux

```bash
# Install Node.js via your package manager or nvm
# Debian/Ubuntu:
sudo apt install nodejs npm
npm install -g pnpm

# Then:
git clone https://github.com/keithamckenzie/gdrive-cli.git
cd gdrive-cli
pnpm install
pnpm run build
pnpm link --global
```

Verify the installation:

```bash
gdrive --version
```

> **Note:** On Linux, native keychain storage uses the Secret Service API (GNOME Keyring / KDE Wallet). If you're running a headless server or a desktop without Secret Service, tokens fall back to file-based storage with `0600` permissions. See [Linux — Secret Service](#linux--secret-service).

## Google Cloud Setup

You must create your own Google Cloud OAuth credentials. This tool does not ship shared credentials — you control your own API access.

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Name it something like "gdrive-cli" and click **Create**.
4. Once created, make sure it's selected in the project dropdown.
5. Go to **APIs & Services > Library**, search for **Google Drive API**, and click **Enable**.

### 2. Configure the OAuth consent screen

Go to **Google Auth Platform** (or **APIs & Services > OAuth consent screen**):

1. **Branding:** Set an app name (e.g., "gdrive-cli") and your email as the support contact.

2. **Audience:** Choose **External**. Set publishing status to **Testing**. Add your Google account email as a **test user**.

   > **Why Testing mode?** In Testing mode, only accounts you explicitly add as test users can authorize. This is fine for personal use and avoids Google's app verification process.

3. **Data Access:** Click **Add or remove scopes**. Scroll to **Manually add scopes** at the bottom of the panel and paste these two scopes:

   ```
   https://www.googleapis.com/auth/drive
   https://www.googleapis.com/auth/drive.readonly
   ```

   Click **Add to table**, then **Update**, then **Save** on the main page.

   > **Important:** Both scopes must be registered here before authorization will work. If you skip this step, the OAuth flow will fail with a scope error.

### 3. Create OAuth credentials

1. Go to **Clients** (or **APIs & Services > Credentials**).
2. Click **Create Credentials > OAuth 2.0 Client ID**.
3. Set application type to **Desktop app**.
4. Name it (e.g., "gdrive-cli") and click **Create**.
5. Click **Download JSON** on the confirmation dialog.

### 4. Place the credentials file

Move the downloaded JSON file to the config directory:

**macOS / Linux:**

```bash
mkdir -p ~/.config/gdrive-cli
mv ~/Downloads/client_secret_*.json ~/.config/gdrive-cli/credentials.json
chmod 600 ~/.config/gdrive-cli/credentials.json
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.config\gdrive-cli"
Move-Item ~\Downloads\client_secret_*.json "$env:USERPROFILE\.config\gdrive-cli\credentials.json"
```

You can also place it elsewhere and use the `--credentials` flag:

```bash
gdrive --credentials /path/to/my/credentials.json list
```

> **Never commit `credentials.json` to version control.** It contains your OAuth client secret.

## Authorization

On first run, the CLI starts a local HTTP server and prints an authorization URL:

```
Open this URL in your browser to authorize:

https://accounts.google.com/o/oauth2/v2/auth?...

Waiting for authorization...
```

1. Open the URL in your browser.
2. Sign in with the Google account you added as a test user.
3. Grant the requested Drive permissions.
4. The browser redirects to `localhost` and displays "Authorization successful!"
5. The CLI saves the token and is ready to use.

The authorization flow uses PKCE and state validation for security. It times out after 120 seconds if no response is received.

**Re-authorization:** Tokens auto-refresh. You only need to re-authorize if you revoke access (via `gdrive logout` or Google Account settings) or if the refresh token expires.

## Commands

### Listing and searching

```bash
# List recent files (default: 20, sorted by modified time)
gdrive list
gdrive ls

# Filter by name, change limit and sort order
gdrive ls -q "report" -n 50
gdrive ls --order "name"

# Filter by parent folder
gdrive ls -p <folderId>

# Filter by MIME type
gdrive ls --mime "application/pdf"

# Show trashed files
gdrive ls --trashed

# Search by filename
gdrive search "quarterly report"

# Search file contents
gdrive search --full-text "budget forecast"
gdrive search --full-text "Q4 revenue" -n 10

# List shared drives
gdrive shared-drives
```

### File info

```bash
# Get detailed metadata for a file
gdrive info <fileId>
```

Returns JSON with: ID, name, MIME type, size, created/modified dates, parents, sharing status, owners, permissions, and links.

### Downloading and exporting

```bash
# Download a binary file (PDF, image, zip, etc.)
gdrive download <fileId>
gdrive dl <fileId>

# Download to a specific path
gdrive download <fileId> ./reports/file.pdf

# Overwrite existing file (when no explicit dest)
gdrive download <fileId> -f

# Export a Google Doc as PDF
gdrive export <fileId> pdf

# Export a Google Sheet as CSV
gdrive export <fileId> csv

# Export to a specific path
gdrive export <fileId> docx ./output.docx

# Overwrite existing export
gdrive export <fileId> pdf -f
```

**Download vs. export:** Use `download` for regular files (PDFs, images, etc.). Use `export` for Google Workspace files (Docs, Sheets, Slides, Drawings) which must be converted to a downloadable format.

**Available export formats:**

| Google Workspace type | Formats |
|---|---|
| Document | `pdf`, `docx`, `txt`, `html`, `md` |
| Spreadsheet | `pdf`, `xlsx`, `csv`, `tsv` |
| Presentation | `pdf`, `pptx`, `txt` |
| Drawing | `pdf`, `png`, `svg` |

### Uploading and updating

```bash
# Upload a file
gdrive upload ./report.pdf
gdrive up ./report.pdf

# Upload with a custom name
gdrive upload ./report.pdf -n "Q4 Report 2026.pdf"

# Upload to a specific folder
gdrive upload ./report.pdf -p <folderId>

# Upload and convert to Google Doc
gdrive upload ./notes.txt --as-doc

# Upload and convert to Google Sheet
gdrive upload ./data.csv --as-sheet

# Upload with explicit MIME type
gdrive upload ./data.tsv --mime "text/tab-separated-values"

# Overwrite an existing file's content
gdrive update <fileId> ./report-v2.pdf
```

### Organizing files

```bash
# Create a folder
gdrive mkdir "Project Files"

# Create a folder inside another folder
gdrive mkdir "Subproject" -p <parentFolderId>

# Copy a file
gdrive copy <fileId>
gdrive cp <fileId>

# Copy with a new name
gdrive copy <fileId> -n "Copy of Report"

# Copy into a specific folder
gdrive copy <fileId> -p <folderId>

# Move a file to a different folder
gdrive move <fileId> <targetFolderId>
gdrive mv <fileId> <targetFolderId>

# Rename a file
gdrive rename <fileId> "New Name"

# Star / unstar a file
gdrive star <fileId>
gdrive unstar <fileId>
```

### Sharing and permissions

```bash
# Share with a user (roles: reader, writer, commenter, organizer)
gdrive share <fileId> user@example.com reader
gdrive share <fileId> user@example.com writer

# Share without sending an email notification
gdrive share <fileId> user@example.com reader --no-notify

# Share with a custom message
gdrive share <fileId> user@example.com reader -m "Here's the report"

# List who has access to a file
gdrive permissions <fileId>
gdrive perms <fileId>

# Remove a permission (use the permission ID from 'permissions' output)
gdrive unshare <fileId> <permissionId>
```

### Trash management

```bash
# Move to trash (recoverable)
gdrive trash <fileId>

# Restore from trash
gdrive untrash <fileId>

# Permanently delete (skips trash — cannot be undone)
gdrive delete <fileId>
gdrive rm <fileId>

# Empty the entire trash (cannot be undone)
gdrive empty-trash
```

### Comments and revisions

```bash
# Add a comment to a file
gdrive comment <fileId> "Looks good, approved."

# List comments on a file
gdrive comments <fileId>

# List revision history
gdrive revisions <fileId>
```

### Account

```bash
# Show storage quota
gdrive quota

# Revoke tokens and log out all scope profiles
gdrive logout

# Log out a specific scope profile only
gdrive --scope readonly logout
```

## Global Options

| Flag | Description | Default |
|---|---|---|
| `-c, --credentials <path>` | Path to your OAuth credentials JSON | `~/.config/gdrive-cli/credentials.json` |
| `--scope <profile>` | Override the scope profile (`readonly` or `full`) | Per-command default |
| `--no-keychain` | Disable native keychain, use file-based token storage | Keychain enabled |
| `-V, --version` | Print version | |
| `-h, --help` | Print help | |

## Scope Profiles

The CLI uses two OAuth scope profiles to follow the principle of least privilege:

| Profile | Scope | Used by default for |
|---|---|---|
| `readonly` | `drive.readonly` | `list`, `search`, `info`, `download`, `export`, `permissions`, `comments`, `revisions`, `quota`, `shared-drives` |
| `full` | `drive` | `upload`, `update`, `mkdir`, `copy`, `move`, `rename`, `trash`, `delete`, `share`, `star`, `comment` |

Each profile gets its own stored token. You can override the default with `--scope`:

```bash
# Force read-only access even for a command that defaults to full
gdrive --scope readonly info <fileId>
```

Using `--scope readonly` for browsing means that even if a token were compromised, it couldn't modify your Drive.

## Token Storage

The CLI stores OAuth tokens using native OS keychain integration when available, with a file-based fallback.

### macOS — Keychain

Tokens are stored in **Keychain Access** under the service name `gdrive-cli`. You can view them by opening Keychain Access and searching for "gdrive-cli".

To remove tokens manually:

```bash
# Via the CLI
gdrive logout

# Or via Keychain Access app:
# Open Keychain Access > search "gdrive-cli" > delete the entries
```

### Windows — Credential Manager

Tokens are stored in **Windows Credential Manager** under the generic credential `gdrive-cli`. You can view them in Control Panel > Credential Manager > Windows Credentials.

To remove tokens manually:

```powershell
# Via the CLI
gdrive logout

# Or via Credential Manager:
# Control Panel > Credential Manager > Windows Credentials > find "gdrive-cli" > Remove
```

### Linux — Secret Service

On desktops with GNOME Keyring or KDE Wallet, tokens are stored via the **Secret Service D-Bus API**.

**GNOME (Ubuntu, Fedora, etc.):** Works out of the box. Tokens appear in Seahorse (Passwords and Keys).

**KDE:** Works via KDE Wallet integration with Secret Service.

**Headless / no desktop:** Secret Service is unavailable. The CLI automatically falls back to file-based storage. To explicitly disable keychain attempts (avoids D-Bus errors in logs):

```bash
gdrive --no-keychain list
```

**If you see D-Bus errors** like `Failed to connect to secret service`:

```bash
# Option 1: Install and start gnome-keyring
sudo apt install gnome-keyring
eval $(gnome-keyring-daemon --start)
export GNOME_KEYRING_CONTROL GNOME_KEYRING_PID

# Option 2: Just use file-based storage
gdrive --no-keychain list
```

### File-based fallback

When keychain storage is unavailable or disabled with `--no-keychain`, tokens are stored as JSON files:

| File | Contents |
|---|---|
| `~/.config/gdrive-cli/token-readonly.json` | Read-only scope token |
| `~/.config/gdrive-cli/token-full.json` | Full scope token |

These files are created with `0600` permissions (owner read/write only). The config directory is created with `0700` permissions.

> **Never commit token files to version control.** The `.gitignore` in this repo already excludes them, but if you're integrating into your own project, add `token*.json` to your `.gitignore`.

## Troubleshooting

### "Credentials file not found"

The CLI can't find your OAuth credentials JSON.

```bash
# Check the default location
ls -la ~/.config/gdrive-cli/credentials.json

# Or specify the path explicitly
gdrive -c /path/to/credentials.json list
```

### "Credentials file is not valid JSON"

The downloaded file may be corrupted or you may have downloaded an HTML page instead of the JSON file. Go back to Google Cloud Console > Clients, click the download button on your OAuth client, and save the JSON file again.

### "Access blocked: This app's request is invalid" or scope errors

The required scopes aren't registered on the OAuth consent screen.

1. Go to Google Cloud Console > **Google Auth Platform > Data Access**.
2. Verify both scopes are listed:
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/drive.readonly`
3. If missing, add them via **Manually add scopes** at the bottom of the panel.

### "Access blocked: app has not completed the Google verification process"

You're not added as a test user for your app.

1. Go to Google Cloud Console > **Google Auth Platform > Audience**.
2. Under **Test users**, add the Google account email you're trying to authorize.

### "Authorization timed out after 120 seconds"

The browser OAuth flow didn't complete in time. Common causes:

- **Firewall/proxy blocking localhost:** The callback server binds to `localhost` (or `127.0.0.1`, depending on your credentials file). Make sure nothing blocks loopback connections.
- **Browser didn't open:** Copy the printed URL and paste it into your browser manually.
- **Wrong Google account:** If you have multiple Google accounts, make sure you authorize with the one listed as a test user.

### "Error: listen EADDRINUSE"

Another process is using the port. The CLI uses a random port, so this is rare. Try again — it will pick a different port.

### Google Doc/Sheet won't download

Google Workspace files (Docs, Sheets, Slides, Drawings) can't be downloaded as raw files. Use `export` instead:

```bash
# Wrong — this will fail for a Google Doc
gdrive download <docId>

# Right
gdrive export <docId> pdf
gdrive export <docId> docx
```

### Token refresh errors

If your token stops working:

```bash
# Log out and re-authorize
gdrive logout
gdrive list   # triggers fresh authorization
```

This can happen if you revoke access from [Google Account permissions](https://myaccount.google.com/permissions), or if the refresh token expires (Google expires tokens for apps in Testing mode after 7 days if the project has not been verified).

### macOS: "keychain" errors or prompts

If Keychain Access prompts you to allow access, click **Always Allow** to avoid repeated prompts. If you prefer not to use the keychain:

```bash
gdrive --no-keychain list
```

### Linux: D-Bus or Secret Service errors

See [Linux — Secret Service](#linux--secret-service) above.

### Windows: long path issues

If you encounter path-related errors on Windows, ensure long paths are enabled:

```powershell
# Run as Administrator
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

## Known Limitations

### Not published to npm

This package is not currently available on npm. You must build from source (see [Installation](#installation)).

### Google Cloud setup is involved

Before using the CLI, you need to create a Google Cloud project, enable the Drive API, configure an OAuth consent screen with scopes, add yourself as a test user, and create/download OAuth credentials. This is a one-time setup but involves 15+ steps across multiple Google Cloud Console pages. The most common mistakes:

- **Forgetting to register scopes** on the Data Access page — the OAuth flow fails with a cryptic scope error
- **Forgetting to add yourself as a test user** — you get "Access blocked" with no clear cause
- **Choosing "Web application" instead of "Desktop app"** when creating the OAuth client — causes redirect URI mismatches

### Tokens expire weekly in Testing mode

Google expires refresh tokens after **7 days** for OAuth apps in Testing mode (i.e., apps that haven't gone through Google's verification process). This means you'll need to re-authorize roughly once a week:

```bash
gdrive logout
gdrive list   # triggers fresh authorization
```

To avoid this, you can submit your Google Cloud project for verification, but that requires a privacy policy and domain — overkill for personal use.

### No structured output option

Most commands produce human-readable text output. The `info` command outputs JSON, but other commands have no `--json` flag. If you need to script with `gdrive`, you'll need to parse the text output for most commands.

### No pagination

`list` and `search` return a single page of results (default 20, adjustable with `-n`). When more results exist, the CLI prints "(more results available)" but there is no `--page-token` or `--all` flag to fetch additional pages.

### Download vs. export isn't automatic

Google Workspace files (Docs, Sheets, Slides, Drawings) cannot be downloaded as raw files — they must be exported to a specific format. The CLI requires you to use `export` instead of `download` for these files:

```bash
# This fails for a Google Doc
gdrive download <docId>

# Use export instead
gdrive export <docId> pdf
```

Other Drive CLIs handle this automatically. This one doesn't — you need to know which command to use.

### Headless Linux environments

On Linux servers, Docker containers, WSL1, and other environments without a desktop, the native keychain module (`@napi-rs/keyring`) may fail to load. The CLI falls back to file-based token storage, but you may see D-Bus or Secret Service errors in the process. Use `--no-keychain` to suppress these:

```bash
gdrive --no-keychain list
```

### Windows config directory

The default credentials and token path is `~/.config/gdrive-cli/` on all platforms. On Windows this resolves to `C:\Users\<name>\.config\gdrive-cli\` — which works but is unconventional (Windows apps typically use `%APPDATA%`).

## Using a Different Package Manager

This repo ships with a `pnpm-lock.yaml` lockfile and a `packageManager` field pointing to pnpm. If you prefer npm, Yarn, or Bun, make these changes after cloning:

### npm

```bash
# Remove the pnpm lockfile and packageManager field
rm pnpm-lock.yaml
npm pkg delete packageManager

# Install, build, and link
npm install
npm run build
npm link
```

Unlink later with `npm unlink -g gdrive-cli`.

### Yarn

```bash
# Remove the pnpm lockfile and switch packageManager
rm pnpm-lock.yaml
npm pkg set packageManager="yarn@4.9.1"   # or your preferred version

# Install, build, and link
yarn install
yarn run build
yarn link
```

Unlink later with `yarn unlink`.

### Bun

```bash
# Remove the pnpm lockfile and packageManager field
rm pnpm-lock.yaml
npm pkg delete packageManager

# Install, build, and link
bun install
bun run build
bun link
```

Unlink later with `bun unlink`.

> **Note:** Whichever package manager you choose, the `prepack` script in `package.json` references `pnpm run build`. Update it to match your package manager (e.g., `npm run build`, `yarn run build`, or `bun run build`) if you plan to pack or publish the package.

## Uninstalling

**Remove the CLI:**

```bash
# From the repo directory (use whichever package manager you installed with)
cd gdrive-cli
pnpm unlink --global
```

**Remove stored tokens:**

```bash
# Via the CLI (also revokes tokens with Google)
gdrive logout

# Or manually delete the config directory
rm -rf ~/.config/gdrive-cli
```

On macOS, also remove keychain entries: open Keychain Access, search for "gdrive-cli", and delete the entries.

On Windows, also remove credentials from Credential Manager: Control Panel > Credential Manager > Windows Credentials > find "gdrive-cli" > Remove.

**Remove the Google Cloud project (optional):**

If you no longer need the project, go to Google Cloud Console > IAM & Admin > Settings > Shut down project.

## Feedback

For bugs and feature requests, open an issue on GitHub. For general questions or feedback, email `keith@mckenzieconsultants.com`.

For security vulnerabilities, see [SECURITY.md](SECURITY.md).

## License

ISC
