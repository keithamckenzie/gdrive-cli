import type { DriveAuthClient } from "./auth.js";
import { drive_v3, google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

export function getDrive(auth: DriveAuthClient): drive_v3.Drive {
  return google.drive({ version: "v3", auth });
}

export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function sanitizeRemoteFilename(name: string): string {
  const sanitized = name
    .replace(/[\\/]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  return sanitized;
}

function assertWritableRegularFile(destPath: string, overwrite: boolean): void {
  if (!overwrite || !fs.existsSync(destPath)) {
    return;
  }

  const stats = fs.lstatSync(destPath);
  if (!stats.isFile()) {
    throw new Error(`Refusing to write to non-regular file: ${destPath}`);
  }
}

function createOutputStream(destPath: string, overwrite = false): fs.WriteStream {
  assertWritableRegularFile(destPath, overwrite);

  return fs.createWriteStream(destPath, {
    flags: overwrite ? "w" : "wx",
  });
}

async function pipeDriveStreamToFile(
  stream: NodeJS.ReadableStream,
  destPath: string,
  overwrite = false
): Promise<void> {
  const dest = createOutputStream(destPath, overwrite);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    dest.on("error", onError);
    stream.on("error", onError);
    dest.on("finish", resolve);
    stream.pipe(dest);
  });
}

// ── List files ──────────────────────────────────────────────────────────────

export async function listFiles(
  drive: drive_v3.Drive,
  opts: {
    query?: string;
    pageSize?: number;
    orderBy?: string;
    parent?: string;
    mimeType?: string;
    trashed?: boolean;
  } = {}
) {
  const qParts: string[] = [];
  if (opts.query) qParts.push(`name contains '${escapeDriveQueryValue(opts.query)}'`);
  if (opts.parent) qParts.push(`'${escapeDriveQueryValue(opts.parent)}' in parents`);
  if (opts.mimeType) qParts.push(`mimeType = '${escapeDriveQueryValue(opts.mimeType)}'`);
  if (opts.trashed !== undefined)
    qParts.push(`trashed = ${opts.trashed}`);
  else qParts.push("trashed = false");

  const res = await drive.files.list({
    q: qParts.length ? qParts.join(" and ") : undefined,
    pageSize: opts.pageSize || 20,
    orderBy: opts.orderBy || "modifiedTime desc",
    fields:
      "nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, shared, webViewLink)",
  });
  return res.data;
}

// ── Search files ────────────────────────────────────────────────────────────

export async function searchFiles(
  drive: drive_v3.Drive,
  query: string,
  opts: { pageSize?: number; fullText?: boolean } = {}
) {
  const q = opts.fullText
    ? `fullText contains '${escapeDriveQueryValue(query)}' and trashed = false`
    : `name contains '${escapeDriveQueryValue(query)}' and trashed = false`;

  const res = await drive.files.list({
    q,
    pageSize: opts.pageSize || 20,
    fields:
      "files(id, name, mimeType, size, modifiedTime, parents, webViewLink)",
  });
  return res.data;
}

// ── Get file info ───────────────────────────────────────────────────────────

export async function getFileInfo(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.files.get({
    fileId,
    fields:
      "id, name, mimeType, size, createdTime, modifiedTime, parents, shared, sharingUser, owners, permissions, webViewLink, webContentLink, description, starred, trashed",
  });
  return res.data;
}

// ── Download file ───────────────────────────────────────────────────────────

export async function downloadFile(
  drive: drive_v3.Drive,
  fileId: string,
  destPath: string,
  opts: { overwrite?: boolean } = {}
) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  await pipeDriveStreamToFile(
    res.data as NodeJS.ReadableStream,
    destPath,
    opts.overwrite
  );
}

// ── Export Google Workspace file ─────────────────────────────────────────────

const EXPORT_MIME_MAP: Record<string, Record<string, string>> = {
  "application/vnd.google-apps.document": {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    html: "text/html",
    md: "text/markdown",
  },
  "application/vnd.google-apps.spreadsheet": {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
  },
  "application/vnd.google-apps.presentation": {
    pdf: "application/pdf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
  },
  "application/vnd.google-apps.drawing": {
    pdf: "application/pdf",
    png: "image/png",
    svg: "image/svg+xml",
  },
};

export function getExportFormats(mimeType: string): Record<string, string> | null {
  return EXPORT_MIME_MAP[mimeType] || null;
}

export async function exportFile(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
  destPath: string,
  opts: { overwrite?: boolean } = {}
) {
  const res = await drive.files.export(
    { fileId, mimeType },
    { responseType: "stream" }
  );
  await pipeDriveStreamToFile(
    res.data as NodeJS.ReadableStream,
    destPath,
    opts.overwrite
  );
}

// ── Upload file ─────────────────────────────────────────────────────────────

export async function uploadFile(
  drive: drive_v3.Drive,
  filePath: string,
  opts: { name?: string; parent?: string; mimeType?: string; convertTo?: string } = {}
) {
  const fileName = opts.name || path.basename(filePath);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: opts.parent ? [opts.parent] : undefined,
      mimeType: opts.convertTo || opts.mimeType,
    },
    media: {
      mimeType: opts.mimeType || "application/octet-stream",
      body: fs.createReadStream(filePath),
    },
    fields: "id, name, mimeType, webViewLink",
  });
  return res.data;
}

// ── Update / overwrite file content ─────────────────────────────────────────

export async function updateFile(
  drive: drive_v3.Drive,
  fileId: string,
  filePath: string
) {
  const res = await drive.files.update({
    fileId,
    media: { body: fs.createReadStream(filePath) },
    fields: "id, name, mimeType, modifiedTime, webViewLink",
  });
  return res.data;
}

// ── Create folder ───────────────────────────────────────────────────────────

export async function createFolder(
  drive: drive_v3.Drive,
  name: string,
  parent?: string
) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parent ? [parent] : undefined,
    },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

// ── Copy file ───────────────────────────────────────────────────────────────

export async function copyFile(
  drive: drive_v3.Drive,
  fileId: string,
  opts: { name?: string; parent?: string } = {}
) {
  const res = await drive.files.copy({
    fileId,
    requestBody: {
      name: opts.name,
      parents: opts.parent ? [opts.parent] : undefined,
    },
    fields: "id, name, mimeType, webViewLink",
  });
  return res.data;
}

// ── Move file ───────────────────────────────────────────────────────────────

export async function moveFile(
  drive: drive_v3.Drive,
  fileId: string,
  newParentId: string
) {
  // Get current parents to remove
  const file = await drive.files.get({ fileId, fields: "parents" });
  const previousParents = (file.data.parents || []).join(",");

  const res = await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: previousParents,
    fields: "id, name, parents, webViewLink",
  });
  return res.data;
}

// ── Rename file ─────────────────────────────────────────────────────────────

export async function renameFile(
  drive: drive_v3.Drive,
  fileId: string,
  newName: string
) {
  const res = await drive.files.update({
    fileId,
    requestBody: { name: newName },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

// ── Trash / untrash / delete ────────────────────────────────────────────────

export async function trashFile(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    fields: "id, name, trashed",
  });
  return res.data;
}

export async function untrashFile(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.files.update({
    fileId,
    requestBody: { trashed: false },
    fields: "id, name, trashed",
  });
  return res.data;
}

export async function deleteFile(drive: drive_v3.Drive, fileId: string) {
  await drive.files.delete({ fileId });
}

export async function emptyTrash(drive: drive_v3.Drive) {
  await drive.files.emptyTrash();
}

// ── Share / permissions ─────────────────────────────────────────────────────

export async function shareFile(
  drive: drive_v3.Drive,
  fileId: string,
  opts: {
    email: string;
    role: "reader" | "writer" | "commenter" | "organizer";
    type?: "user" | "group" | "domain" | "anyone";
    sendNotification?: boolean;
    message?: string;
  }
) {
  const res = await drive.permissions.create({
    fileId,
    sendNotificationEmail: opts.sendNotification ?? true,
    emailMessage: opts.message,
    requestBody: {
      role: opts.role === "commenter" ? "reader" : opts.role,
      type: opts.type || "user",
      emailAddress: opts.email,
      ...(opts.role === "commenter"
        ? { additionalRoles: ["commenter"] }
        : {}),
    },
    fields: "id, role, type, emailAddress",
  });
  return res.data;
}

export async function listPermissions(
  drive: drive_v3.Drive,
  fileId: string
) {
  const res = await drive.permissions.list({
    fileId,
    fields: "permissions(id, role, type, emailAddress, displayName)",
  });
  return res.data.permissions || [];
}

export async function removePermission(
  drive: drive_v3.Drive,
  fileId: string,
  permissionId: string
) {
  await drive.permissions.delete({ fileId, permissionId });
}

// ── Starred ─────────────────────────────────────────────────────────────────

export async function starFile(drive: drive_v3.Drive, fileId: string) {
  await drive.files.update({
    fileId,
    requestBody: { starred: true },
  });
}

export async function unstarFile(drive: drive_v3.Drive, fileId: string) {
  await drive.files.update({
    fileId,
    requestBody: { starred: false },
  });
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function addComment(
  drive: drive_v3.Drive,
  fileId: string,
  content: string
) {
  const res = await drive.comments.create({
    fileId,
    fields: "id, content, createdTime, author",
    requestBody: { content },
  });
  return res.data;
}

export async function listComments(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.comments.list({
    fileId,
    fields:
      "comments(id, content, createdTime, author(displayName, emailAddress), resolved)",
  });
  return res.data.comments || [];
}

// ── Revisions ───────────────────────────────────────────────────────────────

export async function listRevisions(drive: drive_v3.Drive, fileId: string) {
  const res = await drive.revisions.list({
    fileId,
    fields: "revisions(id, modifiedTime, lastModifyingUser, size)",
  });
  return res.data.revisions || [];
}

// ── About (storage quota) ───────────────────────────────────────────────────

export async function getStorageQuota(drive: drive_v3.Drive) {
  const res = await drive.about.get({
    fields: "storageQuota, user",
  });
  return res.data;
}

// ── Shared drives ───────────────────────────────────────────────────────────

export async function listSharedDrives(drive: drive_v3.Drive) {
  const res = await drive.drives.list({
    fields: "drives(id, name, createdTime)",
  });
  return res.data.drives || [];
}
