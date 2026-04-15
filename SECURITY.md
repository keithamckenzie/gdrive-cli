# Security Policy

## Reporting Vulnerabilities

Report security vulnerabilities by email to `keith@mckenzieconsultants.com`. Include steps to reproduce and any relevant logs (with tokens/credentials redacted).

Please allow up to 72 hours for an initial response. Do not open a public issue for security vulnerabilities.

## Feedback

For general feedback, feature requests, or questions, email `keith@mckenzieconsultants.com` or open an issue on GitHub.

## Supported Versions

Only the latest release on the `main` branch is supported with security fixes.

## Token Storage

OAuth tokens are stored in the macOS Keychain via native bindings when available. If the CLI falls back to file-based storage, it uses `0600` file permissions for token files under `~/.config/gdrive-cli/`. The config directory itself is created with `0700` permissions.

## OAuth Credentials

This tool does not ship shared OAuth credentials. Users must supply and manage their own Google Cloud OAuth client credentials. Never commit your `credentials.json` or token files to version control.

## Error Handling

Error output is passed through a redaction filter that strips emails, API keys, bearer tokens, and credential fields before display.
