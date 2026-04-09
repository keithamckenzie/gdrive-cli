# gdrive-cli

TypeScript CLI for Google Drive API v3.

## Installation

Install globally from npm:

```bash
npm install -g gdrive-cli
```

Or clone and build locally:

```bash
git clone https://github.com/keithmckenzie/gdrive-cli.git
cd gdrive-cli
pnpm install
pnpm build
node dist/cli.js --help
```

## Setup

You must create your own Google Cloud OAuth credentials.

1. Go to Google Cloud Console.
2. Create a project or select an existing project.
3. Enable the Google Drive API.
4. Create an OAuth 2.0 Client ID with application type `Desktop app`.
5. Download the credentials JSON.
6. Place it at `~/.config/gdrive-cli/credentials.json`.

This tool uses restricted Google Drive API scopes (`drive` and `drive.readonly`). When creating your OAuth client, you may need to configure the OAuth consent screen. For personal use, Testing mode is sufficient.

## Usage

On first run, the CLI opens a browser for OAuth authorization.

```bash
gdrive list                              # list recent files
gdrive ls -q "report" -n 50             # filter by name, limit 50
gdrive search "quarterly report"         # search by name
gdrive search --full-text "budget"       # search file contents
gdrive info <fileId>                     # detailed file info
gdrive download <fileId>                 # download binary file
gdrive export <fileId> pdf               # export Google Doc as PDF
gdrive upload ./local-file.pdf           # upload a file
gdrive upload ./data.csv --as-sheet      # upload as Google Sheet
gdrive share <fileId> user@example.com reader  # share with someone
gdrive mkdir "New Folder"                # create a folder
gdrive move <fileId> <folderId>          # move a file
gdrive rename <fileId> "New Name"        # rename a file
gdrive trash <fileId>                    # move to trash
gdrive quota                             # show storage usage
gdrive logout                            # revoke tokens
```

Use `gdrive --help` and `gdrive <command> --help` for all commands and flags.

## Scope Profiles

Use `--scope readonly` for read-only access and safer day-to-day listing, searching, downloading, and exporting.

Use `--scope full` when you need write operations such as upload, update, move, delete, or share.

## Token Storage

By default, tokens are stored in the macOS Keychain via `@napi-rs/keyring` when available. If Keychain storage is unavailable or disabled, the CLI falls back to token files in `~/.config/gdrive-cli/` with `0600` file permissions.

Use `--no-keychain` if you want to skip native Keychain storage and force file-based token storage.

## License

ISC
