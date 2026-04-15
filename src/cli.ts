#!/usr/bin/env node
import { Command, InvalidArgumentError } from "commander";
import * as os from "os";
import * as path from "path";
import {
  authorize,
  logout as revokeAndLogout,
  type ScopeProfile,
} from "./auth.js";
import * as drv from "./drive.js";

const DEFAULT_CREDS = path.join(
  os.homedir(),
  ".config",
  "gdrive-cli",
  "credentials.json"
);

interface GlobalOptions {
  credentials: string;
  scope?: ScopeProfile;
  keychain: boolean;
}

function parseScopeProfile(value: string): ScopeProfile {
  if (value !== "readonly" && value !== "full") {
    throw new InvalidArgumentError("Scope must be either 'readonly' or 'full'.");
  }
  return value;
}

function formatSize(bytes: string | null | undefined): string {
  if (!bytes) return "—";
  const b = parseInt(bytes, 10);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function printTable(items: unknown[]) {
  console.log(JSON.stringify(items, null, 2));
}

function redactSensitive(text: string): string {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /\b(Bearer\s+)[A-Za-z0-9\-._~+/]+=*\b/gi,
      "$1[REDACTED_TOKEN]"
    )
    .replace(
      /\b(access_token|refresh_token|id_token|client_secret|api[_-]?key)\b(\s*[:=]\s*)(["']?)[^"'\s,}]+(\3)/gi,
      "$1$2$3[REDACTED]$4"
    );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

let fatalErrorHandled = false;

function handleFatalError(error: unknown): never {
  if (fatalErrorHandled) {
    process.exit(1);
  }

  fatalErrorHandled = true;
  console.error(redactSensitive(formatError(error)));
  process.exit(1);
}

function getGlobalOptions(program: Command): GlobalOptions {
  const opts = program.opts<GlobalOptions>();
  return {
    credentials: opts.credentials,
    scope: opts.scope,
    keychain: opts.keychain,
  };
}

async function withDrive(
  program: Command,
  defaultScope: ScopeProfile,
  action: (drive: ReturnType<typeof drv.getDrive>, globals: GlobalOptions) => Promise<void>
): Promise<void> {
  const globals = getGlobalOptions(program);
  const scopeProfile = globals.scope ?? defaultScope;
  const auth = await authorize(globals.credentials, {
    scopeProfile,
    useKeychain: globals.keychain,
  });
  const drive = drv.getDrive(auth);
  await action(drive, globals);
}

function resolveRemoteOutputPath(
  remoteName: string | null | undefined,
  fallbackName: string,
  dest: string | undefined,
  opts: { extension?: string; force?: boolean } = {}
): string {
  if (dest) {
    return dest;
  }

  const baseName = remoteName || fallbackName;
  const sanitizedBaseName = drv.sanitizeRemoteFilename(baseName);
  const sanitizedFallbackName = drv.sanitizeRemoteFilename(fallbackName);
  const resolvedBase = sanitizedBaseName || sanitizedFallbackName || fallbackName;

  return opts.extension ? `${resolvedBase}.${opts.extension}` : resolvedBase;
}

const program = new Command();
program
  .name("gdrive")
  .description("Google Drive CLI — all operations via official API")
  .version("1.0.0")
  .option("-c, --credentials <path>", "Path to credentials.json", DEFAULT_CREDS)
  .option(
    "--scope <profile>",
    "OAuth scope profile override (readonly or full)",
    parseScopeProfile
  )
  .option(
    "--no-keychain",
    "Disable native keychain token storage and use token files instead"
  );

process.on("uncaughtException", handleFatalError);
process.on("unhandledRejection", handleFatalError);

// ── list ────────────────────────────────────────────────────────────────────

program
  .command("list")
  .alias("ls")
  .description("List files in Drive")
  .option("-q, --query <text>", "Filter by name")
  .option("-n, --limit <number>", "Max results", "20")
  .option("-p, --parent <id>", "Parent folder ID")
  .option("--mime <type>", "Filter by MIME type")
  .option("--trashed", "Show trashed files")
  .option("--order <field>", "Order by field", "modifiedTime desc")
  .action(async (opts) => {
    await withDrive(program, "readonly", async (drive) => {
      const data = await drv.listFiles(drive, {
        query: opts.query,
        pageSize: parseInt(opts.limit, 10),
        parent: opts.parent,
        mimeType: opts.mime,
        trashed: opts.trashed || undefined,
        orderBy: opts.order,
      });
      for (const f of data.files || []) {
        const size = formatSize(f.size);
        const mod = f.modifiedTime?.slice(0, 10) || "";
        console.log(`${f.id}  ${mod}  ${size.padStart(8)}  ${f.name}`);
      }
      if (data.nextPageToken) {
        console.log("\n(more results available)");
      }
    });
  });

// ── search ──────────────────────────────────────────────────────────────────

program
  .command("search <query>")
  .description("Search files by name or content")
  .option("--full-text", "Search file contents too")
  .option("-n, --limit <number>", "Max results", "20")
  .action(async (query, opts) => {
    await withDrive(program, "readonly", async (drive) => {
      const data = await drv.searchFiles(drive, query, {
        pageSize: parseInt(opts.limit, 10),
        fullText: opts.fullText,
      });
      for (const f of data.files || []) {
        console.log(`${f.id}  ${f.name}  (${f.mimeType})`);
      }
    });
  });

// ── info ────────────────────────────────────────────────────────────────────

program
  .command("info <fileId>")
  .description("Get detailed file info")
  .action(async (fileId) => {
    await withDrive(program, "readonly", async (drive) => {
      const info = await drv.getFileInfo(drive, fileId);
      printTable([info]);
    });
  });

// ── download ────────────────────────────────────────────────────────────────

program
  .command("download <fileId> [dest]")
  .alias("dl")
  .description("Download a file (binary files only — use 'export' for Google Docs/Sheets)")
  .option(
    "-f, --force",
    "Overwrite existing files when destination is omitted"
  )
  .action(async (fileId, dest, opts) => {
    await withDrive(program, "readonly", async (drive) => {
      const info = await drv.getFileInfo(drive, fileId);
      const destPath = resolveRemoteOutputPath(info.name, fileId, dest, {
        force: opts.force,
      });
      await drv.downloadFile(drive, fileId, destPath, {
        overwrite: opts.force,
      });
      console.log(`Downloaded → ${destPath}`);
    });
  });

// ── export ──────────────────────────────────────────────────────────────────

program
  .command("export <fileId> <format> [dest]")
  .description("Export a Google Workspace file (doc, sheet, slide, drawing)")
  .option(
    "-f, --force",
    "Overwrite existing files when destination is omitted"
  )
  .action(async (fileId, format, dest, opts) => {
    await withDrive(program, "readonly", async (drive) => {
      const info = await drv.getFileInfo(drive, fileId);
      const formats = drv.getExportFormats(info.mimeType || "");
      if (!formats) {
        console.error(`Cannot export mimeType: ${info.mimeType}`);
        console.error("Use 'download' for binary files.");
        process.exit(1);
      }
      const normalizedFormat = format.toLowerCase();
      const exportMime = formats[normalizedFormat];
      if (!exportMime) {
        console.error(
          `Unknown format '${format}'. Available: ${Object.keys(formats).join(", ")}`
        );
        process.exit(1);
      }
      const destPath = resolveRemoteOutputPath(info.name, fileId, dest, {
        extension: format,
        force: opts.force,
      });
      await drv.exportFile(drive, fileId, exportMime, destPath, {
        overwrite: opts.force,
      });
      console.log(`Exported → ${destPath}`);
    });
  });

// ── upload ──────────────────────────────────────────────────────────────────

program
  .command("upload <filePath>")
  .alias("up")
  .description("Upload a file to Drive")
  .option("-n, --name <name>", "Override file name")
  .option("-p, --parent <id>", "Parent folder ID")
  .option("--mime <type>", "Set source MIME type")
  .option("--as-doc", "Convert to Google Doc on upload")
  .option("--as-sheet", "Convert to Google Sheet on upload")
  .action(async (filePath, opts) => {
    await withDrive(program, "full", async (drive) => {
      let convertTo: string | undefined;
      let mime = opts.mime;
      if (opts.asDoc) {
        convertTo = "application/vnd.google-apps.document";
        if (!mime) mime = "text/plain";
      }
      if (opts.asSheet) {
        convertTo = "application/vnd.google-apps.spreadsheet";
        if (!mime) mime = "text/csv";
      }
      const data = await drv.uploadFile(drive, filePath, {
        name: opts.name,
        parent: opts.parent,
        mimeType: mime,
        convertTo,
      });
      console.log(`Uploaded: ${data.name} (${data.id})`);
      if (data.webViewLink) console.log(data.webViewLink);
    });
  });

// ── update ──────────────────────────────────────────────────────────────────

program
  .command("update <fileId> <filePath>")
  .description("Overwrite file content with a local file")
  .action(async (fileId, filePath) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.updateFile(drive, fileId, filePath);
      console.log(`Updated: ${data.name} (${data.id})`);
    });
  });

// ── mkdir ───────────────────────────────────────────────────────────────────

program
  .command("mkdir <name>")
  .description("Create a folder")
  .option("-p, --parent <id>", "Parent folder ID")
  .action(async (name, opts) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.createFolder(drive, name, opts.parent);
      console.log(`Created folder: ${data.name} (${data.id})`);
    });
  });

// ── copy ────────────────────────────────────────────────────────────────────

program
  .command("copy <fileId>")
  .alias("cp")
  .description("Copy a file")
  .option("-n, --name <name>", "Name for the copy")
  .option("-p, --parent <id>", "Destination folder ID")
  .action(async (fileId, opts) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.copyFile(drive, fileId, {
        name: opts.name,
        parent: opts.parent,
      });
      console.log(`Copied → ${data.name} (${data.id})`);
    });
  });

// ── move ────────────────────────────────────────────────────────────────────

program
  .command("move <fileId> <parentId>")
  .alias("mv")
  .description("Move a file to a different folder")
  .action(async (fileId, parentId) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.moveFile(drive, fileId, parentId);
      console.log(`Moved: ${data.name} → folder ${parentId}`);
    });
  });

// ── rename ──────────────────────────────────────────────────────────────────

program
  .command("rename <fileId> <newName>")
  .description("Rename a file")
  .action(async (fileId, newName) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.renameFile(drive, fileId, newName);
      console.log(`Renamed → ${data.name}`);
    });
  });

// ── trash ───────────────────────────────────────────────────────────────────

program
  .command("trash <fileId>")
  .description("Move a file to trash")
  .action(async (fileId) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.trashFile(drive, fileId);
      console.log(`Trashed: ${data.name}`);
    });
  });

program
  .command("untrash <fileId>")
  .description("Restore a file from trash")
  .action(async (fileId) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.untrashFile(drive, fileId);
      console.log(`Restored: ${data.name}`);
    });
  });

program
  .command("empty-trash")
  .description("Permanently delete all trashed files")
  .action(async () => {
    await withDrive(program, "full", async (drive) => {
      await drv.emptyTrash(drive);
      console.log("Trash emptied.");
    });
  });

// ── delete ──────────────────────────────────────────────────────────────────

program
  .command("delete <fileId>")
  .alias("rm")
  .description("Permanently delete a file (skips trash)")
  .action(async (fileId) => {
    await withDrive(program, "full", async (drive) => {
      await drv.deleteFile(drive, fileId);
      console.log(`Deleted: ${fileId}`);
    });
  });

// ── share ───────────────────────────────────────────────────────────────────

program
  .command("share <fileId> <email> <role>")
  .description("Share a file (roles: reader, writer, commenter, organizer)")
  .option("--no-notify", "Don't send email notification")
  .option("-m, --message <text>", "Notification message")
  .action(async (fileId, email, role, opts) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.shareFile(drive, fileId, {
        email,
        role,
        sendNotification: opts.notify,
        message: opts.message,
      });
      console.log(`Shared with ${email} as ${role} (permission: ${data.id})`);
    });
  });

program
  .command("permissions <fileId>")
  .alias("perms")
  .description("List permissions on a file")
  .action(async (fileId) => {
    await withDrive(program, "readonly", async (drive) => {
      const perms = await drv.listPermissions(drive, fileId);
      for (const p of perms) {
        console.log(
          `${p.id}  ${p.role?.padEnd(10)}  ${p.type?.padEnd(8)}  ${
            p.emailAddress || p.displayName || ""
          }`
        );
      }
    });
  });

program
  .command("unshare <fileId> <permissionId>")
  .description("Remove a permission from a file")
  .action(async (fileId, permissionId) => {
    await withDrive(program, "full", async (drive) => {
      await drv.removePermission(drive, fileId, permissionId);
      console.log(`Permission ${permissionId} removed.`);
    });
  });

// ── star ────────────────────────────────────────────────────────────────────

program
  .command("star <fileId>")
  .description("Star a file")
  .action(async (fileId) => {
    await withDrive(program, "full", async (drive) => {
      await drv.starFile(drive, fileId);
      console.log("Starred.");
    });
  });

program
  .command("unstar <fileId>")
  .description("Unstar a file")
  .action(async (fileId) => {
    await withDrive(program, "full", async (drive) => {
      await drv.unstarFile(drive, fileId);
      console.log("Unstarred.");
    });
  });

// ── comments ────────────────────────────────────────────────────────────────

program
  .command("comment <fileId> <text>")
  .description("Add a comment to a file")
  .action(async (fileId, text) => {
    await withDrive(program, "full", async (drive) => {
      const data = await drv.addComment(drive, fileId, text);
      console.log(`Comment added (${data.id})`);
    });
  });

program
  .command("comments <fileId>")
  .description("List comments on a file")
  .action(async (fileId) => {
    await withDrive(program, "readonly", async (drive) => {
      const comments = await drv.listComments(drive, fileId);
      for (const c of comments) {
        const author = c.author?.displayName || "unknown";
        const date = c.createdTime?.slice(0, 10) || "";
        const resolved = c.resolved ? " [resolved]" : "";
        console.log(`${c.id}  ${date}  ${author}${resolved}`);
        console.log(`    ${c.content}`);
      }
    });
  });

// ── revisions ───────────────────────────────────────────────────────────────

program
  .command("revisions <fileId>")
  .description("List revisions of a file")
  .action(async (fileId) => {
    await withDrive(program, "readonly", async (drive) => {
      const revs = await drv.listRevisions(drive, fileId);
      for (const r of revs) {
        const user = r.lastModifyingUser?.displayName || "unknown";
        const size = formatSize(r.size);
        console.log(
          `${r.id}  ${r.modifiedTime?.slice(0, 10)}  ${size.padStart(8)}  ${user}`
        );
      }
    });
  });

// ── quota ───────────────────────────────────────────────────────────────────

program
  .command("quota")
  .description("Show storage quota")
  .action(async () => {
    await withDrive(program, "readonly", async (drive) => {
      const about = await drv.getStorageQuota(drive);
      const q = about.storageQuota;
      if (q) {
        console.log(`Usage:      ${formatSize(q.usage)}`);
        console.log(`Drive:      ${formatSize(q.usageInDrive)}`);
        console.log(`Trash:      ${formatSize(q.usageInDriveTrash)}`);
        console.log(`Limit:      ${formatSize(q.limit)}`);
      }
      if (about.user) {
        console.log(`User:       ${about.user.displayName} (${about.user.emailAddress})`);
      }
    });
  });

// ── shared drives ───────────────────────────────────────────────────────────

program
  .command("shared-drives")
  .description("List shared drives")
  .action(async () => {
    await withDrive(program, "readonly", async (drive) => {
      const drives = await drv.listSharedDrives(drive);
      for (const d of drives) {
        console.log(`${d.id}  ${d.name}`);
      }
    });
  });

// ── logout ──────────────────────────────────────────────────────────────────

program
  .command("logout")
  .description("Revoke OAuth tokens and remove them from local storage")
  .action(async () => {
    const globals = getGlobalOptions(program);
    await revokeAndLogout(globals.credentials, {
      scopeProfile: globals.scope,
      useKeychain: globals.keychain,
    });
    if (globals.scope) {
      console.log(`Logged out ${globals.scope} scope profile.`);
    } else {
      console.log("Logged out all scope profiles.");
    }
  });

program.parseAsync().catch(handleFatalError);
