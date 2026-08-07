import { Router } from "express";
import { db, documentsTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateDocumentBody } from "@workspace/api-zod";

const router = Router();

router.get("/documents", async (req, res): Promise<void> => {
  const { projectId, type } = req.query as { projectId?: string; type?: string };

  let rows = await db.select().from(documentsTable);
  if (projectId) rows = rows.filter(d => d.projectId === parseInt(projectId, 10));
  if (type) rows = rows.filter(d => d.type === type);

  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(d => ({
    id: d.id,
    name: d.name,
    type: d.type,
    size: d.size,
    projectId: d.projectId,
    projectName: projMap.get(d.projectId) ?? "Unknown",
    uploadedBy: d.uploadedBy,
    url: d.url ?? null,
    createdAt: d.createdAt.toISOString(),
  })));
});

router.post("/documents", async (req, res): Promise<void> => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(documentsTable).values({
    name: d.name,
    type: d.type,
    size: d.size,
    projectId: d.projectId,
    uploadedBy: d.uploadedBy,
    url: d.url,
  }).returning();

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.status(201).json({
    ...row,
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/documents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(documentsTable).where(eq(documentsTable.id, id));
  res.status(204).send();
});

export default router;
