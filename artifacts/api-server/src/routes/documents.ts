import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db, documentsTable, projectsTable } from "@workspace/db";
import { CreateDocumentBody } from "@workspace/api-zod";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";

const router = Router();
const uploadDir = path.resolve(process.cwd(), "uploads");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get("/documents", requirePermission("documents.read"), async (req, res): Promise<void> => {
  const { projectId, type } = req.query as { projectId?: string; type?: string };
  const rows = await db.select().from(documentsTable).where(eq(documentsTable.organizationId, tenantId(req)));
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, tenantId(req)));
  const projMap = new Map(projects.map((p) => [p.id, p.name]));
  res.json(rows.filter((d) => (!projectId || d.projectId === Number(projectId)) && (!type || d.type === type)).map((d) => ({ ...d, projectName: projMap.get(d.projectId) ?? "Unknown", url: d.url ?? null, createdAt: d.createdAt.toISOString() })));
});

router.post("/documents", requirePermission("documents.create"), async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data; const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, d.projectId), eq(projectsTable.organizationId, tenantId(req))));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(documentsTable).values({ name: d.name, type: d.type, size: d.size, projectId: d.projectId, organizationId: tenantId(req), uploadedBy: d.uploadedBy, url: d.url }).returning();
  res.status(201).json({ ...row, projectName: project.name, createdAt: row.createdAt.toISOString() });
});

router.post("/documents/upload", requirePermission("documents.create"), upload.single("file"), async (req, res): Promise<void> => {
  const projectId = Number(req.body.projectId); if (!req.file || !projectId) { res.status(400).json({ error: "file and projectId are required" }); return; }
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, tenantId(req)))); if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  await fs.mkdir(uploadDir, { recursive: true }); const safeName = `${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const storagePath = path.join(uploadDir, safeName); await fs.writeFile(storagePath, req.file.buffer);
  const [row] = await db.insert(documentsTable).values({ name: req.file.originalname, type: req.file.mimetype, size: req.file.size, projectId, organizationId: tenantId(req), uploadedBy: String(req.vetraUser?.id ?? "system"), url: `/uploads/${safeName}`, storagePath }).returning();
  res.status(201).json(row);
});

router.delete("/documents/:id", requirePermission("documents.delete"), async (req, res): Promise<void> => { const [row] = await db.select().from(documentsTable).where(and(eq(documentsTable.id, Number(req.params.id)), eq(documentsTable.organizationId, tenantId(req)))); if (!row) { res.status(404).json({ error: "Not found" }); return; } if (row.storagePath) await fs.rm(row.storagePath, { force: true }).catch(() => undefined); await db.delete(documentsTable).where(eq(documentsTable.id, row.id)); res.status(204).send(); });
export default router;
