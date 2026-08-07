import { Router } from "express";
import { db, equipmentTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateEquipmentBody, UpdateEquipmentBody } from "@workspace/api-zod";

const router = Router();

router.get("/equipment", async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };

  let rows = await db.select().from(equipmentTable);
  if (projectId) rows = rows.filter(e => e.projectId === parseInt(projectId, 10));
  if (status) rows = rows.filter(e => e.status === status);

  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(e => ({
    id: e.id,
    name: e.name,
    type: e.type,
    model: e.model ?? null,
    serialNumber: e.serialNumber ?? null,
    status: e.status,
    location: e.location ?? null,
    projectId: e.projectId ?? null,
    projectName: e.projectId ? (projMap.get(e.projectId) ?? null) : null,
    nextMaintenance: e.nextMaintenance ?? null,
    createdAt: e.createdAt.toISOString(),
  })));
});

router.post("/equipment", async (req, res): Promise<void> => {
  const parsed = CreateEquipmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(equipmentTable).values({
    name: d.name,
    type: d.type,
    model: d.model,
    serialNumber: d.serialNumber,
    status: d.status ?? "available",
    location: d.location,
    projectId: d.projectId,
    nextMaintenance: d.nextMaintenance,
  }).returning();

  const proj = row.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId)) : [];

  res.status(201).json({
    ...row,
    projectName: proj[0]?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/equipment/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateEquipmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.type !== undefined) updates.type = d.type;
  if (d.model !== undefined) updates.model = d.model;
  if (d.status !== undefined) updates.status = d.status;
  if (d.location !== undefined) updates.location = d.location;
  if (d.projectId !== undefined) updates.projectId = d.projectId;
  if (d.nextMaintenance !== undefined) updates.nextMaintenance = d.nextMaintenance;

  const [row] = await db.update(equipmentTable).set(updates).where(eq(equipmentTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const proj = row.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId)) : [];

  res.json({
    ...row,
    projectName: proj[0]?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
