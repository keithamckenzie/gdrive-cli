import { randomBytes } from "crypto";
import { Entry } from "@napi-rs/keyring";
import * as fs from "fs";
import { google } from "googleapis";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { URL } from "url";

export type ScopeProfile = "readonly" | "full";
export type DriveAuthClient = InstanceType<typeof google.auth.OAuth2>;
type AuthUrlOptions = NonNullable<Parameters<DriveAuthClient["generateAuthUrl"]>[0]>;

const CONFIG_DIR = path.join(os.homedir(), ".config", "gdrive-cli");
const KEYCHAIN_SERVICE_NAME = "gdrive-cli";

const TOKEN_FILE_NAMES: Record<ScopeProfile, string> = {
  readonly: "token-readonly.json",
  full: "token-full.json",
};

const KEYCHAIN_ACCOUNT_NAMES: Record<ScopeProfile, string> = {
  readonly: "token-readonly",
  full: "token-full",
};

const DRIVE_SCOPES: Record<ScopeProfile, string[]> = {
  readonly: ["https://www.googleapis.com/auth/drive.readonly"],
  full: ["https://www.googleapis.com/auth/drive"],
};

interface CredentialsFile {
  installed?: OAuthClientConfig;
  web?: OAuthClientConfig;
}

interface OAuthClientConfig {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

interface StoredToken extends Record<string, unknown> {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

interface AuthorizeOptions {
  scopeProfile: ScopeProfile;
  useKeychain?: boolean;
}

interface LogoutOptions {
  scopeProfile?: ScopeProfile;
  useKeychain?: boolean;
}

function getOAuthClientConfig(creds: CredentialsFile): OAuthClientConfig {
  const clientConfig = creds.installed ?? creds.web;
  if (!clientConfig) {
    throw new Error("Unsupported credentials file format. Expected 'installed' or 'web' OAuth client config.");
  }
  return clientConfig;
}

function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(CONFIG_DIR, 0o700);
  } catch {
    // Best effort: chmod can fail on some filesystems.
  }
}

function ensurePrivateFilePermissions(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort: keep auth working even if chmod is unsupported.
  }
}

function getTokenFilePath(scopeProfile: ScopeProfile): string {
  return path.join(CONFIG_DIR, TOKEN_FILE_NAMES[scopeProfile]);
}

function loadCredentials(credPath: string): CredentialsFile {
  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Credentials file not found at ${credPath}. Download it from Google Cloud Console.`
    );
  }

  ensurePrivateFilePermissions(credPath);

  let raw: string;
  try {
    raw = fs.readFileSync(credPath, "utf-8");
  } catch {
    throw new Error(`Cannot read credentials file at ${credPath}. Check file permissions.`);
  }

  try {
    return JSON.parse(raw) as CredentialsFile;
  } catch {
    throw new Error(`Credentials file at ${credPath} is not valid JSON.`);
  }
}

function shouldUseKeychain(useKeychain = true): boolean {
  return useKeychain;
}

function loadTokenFromKeychain(scopeProfile: ScopeProfile): StoredToken | null {
  try {
    const entry = new Entry(
      KEYCHAIN_SERVICE_NAME,
      KEYCHAIN_ACCOUNT_NAMES[scopeProfile]
    );
    const raw = entry.getPassword();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredToken;
  } catch {
    return null;
  }
}

function saveTokenToKeychain(scopeProfile: ScopeProfile, token: StoredToken): boolean {
  try {
    const entry = new Entry(
      KEYCHAIN_SERVICE_NAME,
      KEYCHAIN_ACCOUNT_NAMES[scopeProfile]
    );
    entry.setPassword(JSON.stringify(token));
    return true;
  } catch {
    return false;
  }
}

function removeTokenFromKeychain(scopeProfile: ScopeProfile): void {
  try {
    const entry = new Entry(
      KEYCHAIN_SERVICE_NAME,
      KEYCHAIN_ACCOUNT_NAMES[scopeProfile]
    );
    entry.deletePassword();
  } catch {
    // Best effort: deletion should not block logout.
  }
}

function loadTokenFromFile(scopeProfile: ScopeProfile): StoredToken | null {
  const tokenPath = getTokenFilePath(scopeProfile);
  if (!fs.existsSync(tokenPath)) {
    return null;
  }

  ensurePrivateFilePermissions(tokenPath);
  return JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as StoredToken;
}

function writeTokenFileAtomically(scopeProfile: ScopeProfile, token: StoredToken): void {
  ensureConfigDir();

  const tokenPath = getTokenFilePath(scopeProfile);
  const tempPath = path.join(
    CONFIG_DIR,
    `.${path.basename(tokenPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, JSON.stringify(token, null, 2), { mode: 0o600 });
    ensurePrivateFilePermissions(tempPath);
    fs.renameSync(tempPath, tokenPath);
    ensurePrivateFilePermissions(tokenPath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function removeTokenFile(scopeProfile: ScopeProfile): void {
  const tokenPath = getTokenFilePath(scopeProfile);
  if (fs.existsSync(tokenPath)) {
    fs.unlinkSync(tokenPath);
  }
}

function loadStoredToken(
  scopeProfile: ScopeProfile,
  useKeychain = true
): StoredToken | null {
  if (shouldUseKeychain(useKeychain)) {
    const keychainToken = loadTokenFromKeychain(scopeProfile);
    if (keychainToken) {
      return keychainToken;
    }
  }

  return loadTokenFromFile(scopeProfile);
}

function saveStoredToken(
  scopeProfile: ScopeProfile,
  token: StoredToken,
  useKeychain = true
): "keychain" | "file" {
  if (shouldUseKeychain(useKeychain) && saveTokenToKeychain(scopeProfile, token)) {
    return "keychain";
  }

  writeTokenFileAtomically(scopeProfile, token);
  return "file";
}

function removeStoredTokenEverywhere(scopeProfile: ScopeProfile): void {
  removeTokenFromKeychain(scopeProfile);
  removeTokenFile(scopeProfile);
}

function mergeTokens(
  previousToken: StoredToken | null,
  currentCredentials: StoredToken,
  incomingToken: StoredToken
): StoredToken {
  const merged: StoredToken = {
    ...previousToken,
    ...currentCredentials,
    ...incomingToken,
  };

  if (!merged.refresh_token) {
    merged.refresh_token =
      currentCredentials.refresh_token ?? previousToken?.refresh_token ?? null;
  }

  return merged;
}

function createOAuth2Client(credPath: string): DriveAuthClient {
  const creds = loadCredentials(credPath);
  const { client_id, client_secret, redirect_uris } = getOAuthClientConfig(creds);

  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function getNewToken(
  oAuth2Client: DriveAuthClient,
  scopeProfile: ScopeProfile,
  credPath: string,
  useKeychain = true
): Promise<StoredToken> {
  const state = randomBytes(64).toString("hex");
  const { codeVerifier, codeChallenge } =
    await oAuth2Client.generateCodeVerifierAsync();

  // Derive loopback hostname from credentials file to match Google's registered redirect URI.
  const creds = loadCredentials(credPath);
  const configuredRedirect = getOAuthClientConfig(creds).redirect_uris[0] || "http://localhost";
  const loopbackHost = new URL(configuredRedirect).hostname;
  let redirectUri = `http://${loopbackHost}`;

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const finish = (cb: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      server.close();
      cb();
    };

    const server = http.createServer((req, res) => {
      const callbackUrl = new URL(req.url || "/", redirectUri);
      const returnedState = callbackUrl.searchParams.get("state");
      const authCode = callbackUrl.searchParams.get("code");

      const securityHeaders = {
        "Content-Security-Policy": "default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      };

      if (!returnedState || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain", ...securityHeaders });
        res.end("Invalid OAuth state");
        finish(() =>
          reject(new Error("OAuth callback rejected because the state parameter was missing or invalid."))
        );
        return;
      }

      if (!authCode) {
        res.writeHead(400, { "Content-Type": "text/plain", ...securityHeaders });
        res.end("Missing code parameter");
        finish(() => reject(new Error("OAuth callback did not include an authorization code.")));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html", ...securityHeaders });
      res.end("<h1>Authorization successful!</h1><p>You can close this tab.</p>");
      finish(() => resolve(authCode));
    });

    server.on("error", (error) => {
      finish(() => reject(error));
    });

    server.listen(0, loopbackHost, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(() => reject(new Error("Failed to bind the local OAuth callback server.")));
        return;
      }

      redirectUri = `http://${loopbackHost}:${address.port}`;
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: DRIVE_SCOPES[scopeProfile],
        state,
        redirect_uri: redirectUri,
        code_challenge_method:
          "S256" as AuthUrlOptions["code_challenge_method"],
        code_challenge: codeChallenge,
      });

      console.log("\nOpen this URL in your browser to authorize:\n");
      console.log(authUrl);
      console.log("\nWaiting for authorization...\n");
    });

    timeout = setTimeout(() => {
      finish(() =>
        reject(new Error("Authorization timed out after 120 seconds."))
      );
    }, 120_000);
  });

  const { tokens } = await oAuth2Client.getToken({
    code,
    codeVerifier,
    redirect_uri: redirectUri,
  });

  const mergedToken = mergeTokens(
    null,
    oAuth2Client.credentials as StoredToken,
    tokens as StoredToken
  );
  oAuth2Client.setCredentials(mergedToken);

  const backend = saveStoredToken(scopeProfile, mergedToken, useKeychain);
  if (backend === "keychain") {
    console.log(`Token saved to system keychain (${KEYCHAIN_ACCOUNT_NAMES[scopeProfile]}).`);
  } else {
    console.log(`Token saved to ${getTokenFilePath(scopeProfile)}`);
  }

  return mergedToken;
}

export async function authorize(
  credPath: string,
  options: AuthorizeOptions
): Promise<DriveAuthClient> {
  const oAuth2Client = createOAuth2Client(credPath);
  let storedToken = loadStoredToken(options.scopeProfile, options.useKeychain);

  oAuth2Client.on("tokens", (tokens) => {
    const mergedToken = mergeTokens(
      storedToken,
      oAuth2Client.credentials as StoredToken,
      tokens as StoredToken
    );
    saveStoredToken(options.scopeProfile, mergedToken, options.useKeychain);
    storedToken = mergedToken;
  });

  if (storedToken) {
    oAuth2Client.setCredentials(storedToken);
    return oAuth2Client;
  }

  storedToken = await getNewToken(
    oAuth2Client,
    options.scopeProfile,
    credPath,
    options.useKeychain
  );
  oAuth2Client.setCredentials(storedToken);
  return oAuth2Client;
}

export async function logout(
  credPath: string,
  options: LogoutOptions = {}
): Promise<void> {
  const scopeProfiles = options.scopeProfile
    ? [options.scopeProfile]
    : (["readonly", "full"] as ScopeProfile[]);

  const tokensToRevoke = new Set<string>();
  for (const scopeProfile of scopeProfiles) {
    const storedTokens = [
      loadTokenFromFile(scopeProfile),
      loadTokenFromKeychain(scopeProfile),
    ];

    for (const token of storedTokens) {
      const revocableToken = token?.refresh_token || token?.access_token;
      if (revocableToken) {
        tokensToRevoke.add(revocableToken);
      }
    }
  }

  const oAuth2Client = createOAuth2Client(credPath);
  let revokeError: Error | null = null;

  for (const token of tokensToRevoke) {
    try {
      await oAuth2Client.revokeToken(token);
    } catch (error) {
      revokeError =
        error instanceof Error
          ? error
          : new Error("Failed to revoke one or more OAuth tokens.");
    }
  }

  for (const scopeProfile of scopeProfiles) {
    removeStoredTokenEverywhere(scopeProfile);
  }

  if (revokeError) {
    throw revokeError;
  }
}
