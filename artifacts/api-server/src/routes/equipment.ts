import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, equipmentTable, projectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { CreateEquipmentBody, UpdateEquipmentBody } from "@workspace/api-zod";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

router.get("/equipment", requirePermission("equipment.read"), async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };
  const organizationId = tenantId(req);

  const filters = [eq(equipmentTable.organizationId, organizationId)];
  if (projectId) filters.push(eq(equipmentTable.projectId, parseInt(projectId, 10)));
  if (status) filters.push(eq(equipmentTable.status, status));
  const rows = await db.select().from(equipmentTable).where(and(...filters));

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId));
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

router.post("/equipment", requirePermission("equipment.create"), async (req, res): Promise<void> => {
  const parsed = CreateEquipmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const organizationId = tenantId(req);
  const project = d.projectId === undefined ? null : await ownedProject(req, d.projectId);
  if (d.projectId !== undefined && !project) { res.status(404).json({ error: "Project not found" }); return; }

  const [row] = await db.insert(equipmentTable).values({
    name: d.name,
    type: d.type,
    model: d.model,
    serialNumber: d.serialNumber,
    status: d.status ?? "available",
    location: d.location,
    projectId: d.projectId,
    organizationId,
    nextMaintenance: d.nextMaintenance,
  }).returning();

  res.status(201).json({
    ...row,
    projectName: project?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/equipment/:id", requirePermission("equipment.update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateEquipmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const organizationId = tenantId(req);
  const [current] = await db.select().from(equipmentTable).where(and(eq(equipmentTable.id, id), eq(equipmentTable.organizationId, organizationId)));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }
  const project = d.projectId === undefined
    ? (current.projectId === null ? null : await ownedProject(req, current.projectId))
    : (d.projectId === null ? null : await ownedProject(req, d.projectId));
  if (d.projectId !== undefined && d.projectId !== null && !project) { res.status(400).json({ error: "Project not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.type !== undefined) updates.type = d.type;
  if (d.model !== undefined) updates.model = d.model;
  if (d.status !== undefined) updates.status = d.status;
  if (d.location !== undefined) updates.location = d.location;
  if (d.projectId !== undefined) updates.projectId = d.projectId;
  if (d.nextMaintenance !== undefined) updates.nextMaintenance = d.nextMaintenance;

  const [row] = await db.update(equipmentTable).set(updates).where(and(eq(equipmentTable.id, id), eq(equipmentTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const proj = row.projectId ? await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, organizationId))) : [];

  res.json({
    ...row,
    projectName: proj[0]?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
