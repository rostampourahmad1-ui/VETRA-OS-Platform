import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * VETRA-SEC-03: Safe file storage helpers for document uploads.
 *
 * Untrusted client-supplied filenames and MIME types must never be trusted
 * for authorization, path construction, or content-type decisions. This
 * module centralizes the allowlist, safe filename generation, and path
 * containment checks used by the documents upload/download routes.
 */

export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg",
  ".png", ".gif", ".svg", ".dwg", ".dxf", ".rvt", ".ifc",
  ".txt", ".csv", ".zip",
]);

export const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/svg+xml",
  "image/vnd.dwg",
  "image/vnd.dxf",
  "application/octet-stream",
  "text/plain",
  "text/csv",
  "application/zip",
]);

export function isAllowedUploadExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.has(ext);
}

export function isAllowedUploadMimeType(mime: string): boolean {
  return ALLOWED_UPLOAD_MIME_TYPES.has(mime);
}

/**
 * Generates a random, collision-resistant storage filename that preserves
 * only the validated extension from the original upload. The original
 * filename is never used to build the on-disk path; it is stored separately
 * in the database purely as a display name.
 */
export function generateStorageFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${randomUUID()}${ext}`;
}

/**
 * Resolves `storageFilename` inside `uploadDir` and verifies the resolved
 * path stays within `uploadDir`, preventing path traversal even if a
 * caller-controlled value ever reaches this function.
 */
export function resolveSafeStoragePath(uploadDir: string, storageFilename: string): string {
  const resolvedDir = path.resolve(uploadDir);
  const resolvedPath = path.resolve(resolvedDir, storageFilename);
  const relative = path.relative(resolvedDir, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Resolved storage path escapes the upload directory");
  }
  return resolvedPath;
}
