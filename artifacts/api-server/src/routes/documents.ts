import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, documentsTable, projectsTable } from "@workspace/db";
import { CreateDocumentBody } from "@workspace/api-zod";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";
import { audit } from "../lib/audit";
import { notifyDocumentUploaded } from "../lib/notifications";
import {
  MAX_UPLOAD_SIZE_BYTES,
  generateStorageFilename,
  isAllowedUploadExtension,
  isAllowedUploadMimeType,
  resolveSafeStoragePath,
} from "../lib/fileStorage";

const router = Router();
const uploadDir = path.resolve(process.cwd(), "uploads");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter(_req, file, callback) {
    if (!isAllowedUploadExtension(file.originalname) || !isAllowedUploadMimeType(file.mimetype)) {
      callback(new Error("Unsupported file type"));
      return;
    }
    callback(null, true);
  },
});

function documentDownloadUrl(doc: { id: number; storagePath: string | null; url: string | null }): string | null {
  return doc.storagePath ? `/api/documents/${doc.id}/download` : doc.url;
}

router.get("/documents", requirePermission("documents.read"), async (req, res): Promise<void> => {
  const { projectId, type } = req.query as { projectId?: string; type?: string };
  const rows = await db.select().from(documentsTable).where(eq(documentsTable.organizationId, tenantId(req)));
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, tenantId(req)));
  const projMap = new Map(projects.map((p) => [p.id, p.name]));
  res.json(rows.filter((d) => (!projectId || d.projectId === Number(projectId)) && (!type || d.type === type)).map((d) => ({ ...d, projectName: projMap.get(d.projectId) ?? "Unknown", url: documentDownloadUrl(d), createdAt: d.createdAt.toISOString() })));
});

router.post("/documents", requirePermission("documents.create"), async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data; const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, d.projectId), eq(projectsTable.organizationId, tenantId(req))));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(documentsTable).values({ name: d.name, type: d.type, size: d.size, projectId: d.projectId, organizationId: tenantId(req), uploadedBy: d.uploadedBy, url: d.url }).returning();
  res.status(201).json({ ...row, projectName: project.name, createdAt: row.createdAt.toISOString() });
  audit(req, "document.created", "document", { resourceId: row.id, newValues: { name: row.name, type: row.type, projectId: row.projectId } });
  notifyDocumentUploaded(req, row.name, row.projectId, row.id);
});

router.post("/documents/upload", requirePermission("documents.create"), upload.single("file"), async (req, res): Promise<void> => {
  const projectId = Number(req.body.projectId); if (!req.file || !projectId) { res.status(400).json({ error: "file and projectId are required" }); return; }
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, tenantId(req)))); if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  await fs.mkdir(uploadDir, { recursive: true });
  const storageFilename = generateStorageFilename(req.file.originalname);
  const storagePath = resolveSafeStoragePath(uploadDir, storageFilename);
  await fs.writeFile(storagePath, req.file.buffer);
  const [row] = await db.insert(documentsTable).values({ name: req.file.originalname, type: req.file.mimetype, size: req.file.size, projectId, organizationId: tenantId(req), uploadedBy: String(req.vetraUser?.id ?? "system"), url: null, storagePath }).returning();
  res.status(201).json({ ...row, url: documentDownloadUrl(row) });
  audit(req, "document.uploaded", "document", { resourceId: row.id, newValues: { name: row.name, type: row.type, size: row.size } });
  notifyDocumentUploaded(req, row.name, row.projectId, row.id);
});

router.get("/documents/:id/download", requirePermission("documents.download"), async (req, res): Promise<void> => {
  const [row] = await db.select().from(documentsTable).where(and(eq(documentsTable.id, Number(req.params.id)), eq(documentsTable.organizationId, tenantId(req))));
  if (!row || !row.storagePath) { res.status(404).json({ error: "Not found" }); return; }
  let safePath: string;
  try {
    safePath = resolveSafeStoragePath(uploadDir, path.basename(row.storagePath));
  } catch {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.download(safePath, row.name, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: "Not found" });
  });
  audit(req, "document.downloaded", "document", { resourceId: row.id });
});

router.delete("/documents/:id", requirePermission("documents.delete"), async (req, res): Promise<void> => {
  const [row] = await db.select().from(documentsTable).where(and(eq(documentsTable.id, Number(req.params.id)), eq(documentsTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.storagePath) await fs.rm(row.storagePath, { force: true }).catch(() => undefined);
  await db.delete(documentsTable).where(eq(documentsTable.id, row.id));
  audit(req, "document.deleted", "document", { resourceId: row.id });
  res.status(204).send();
});
router.patch("/documents/:id", requirePermission("documents.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const organizationId = tenantId(req);
  const { name, type } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  const [row] = await db.update(documentsTable).set(updates).where(and(eq(documentsTable.id, id), eq(documentsTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  audit(req, "document.updated", "document", { resourceId: id, newValues: { name: row.name, type: row.type } });
  res.json(row);
});

export default router;
