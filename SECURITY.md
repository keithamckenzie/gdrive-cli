# Security Policy

## Reporting Vulnerabilities

Report security vulnerabilities by email to `keith@mckenzieconsultants.com`.

## Token Storage

OAuth tokens are stored in the macOS Keychain via native bindings when available. If the CLI falls back to file-based storage, it uses `0600` file permissions for token files under `~/.config/gdrive-cli/`.

## OAuth Credentials

This tool does not ship shared OAuth credentials. Users must supply and manage their own Google Cloud OAuth client credentials.
