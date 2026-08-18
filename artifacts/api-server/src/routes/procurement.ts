import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, procurementTable, projectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { CreateProcurementOrderBody, UpdateProcurementOrderBody } from "@workspace/api-zod";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

router.get("/procurement", requirePermission("procurement.read"), async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };
  const organizationId = tenantId(req);

  const filters = [eq(procurementTable.organizationId, organizationId)];
  if (projectId) filters.push(eq(procurementTable.projectId, parseInt(projectId, 10)));
  if (status) filters.push(eq(procurementTable.status, status));
  const rows = await db.select().from(procurementTable).where(and(...filters));

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId));
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(p => ({
    id: p.id,
    title: p.title,
    supplier: p.supplier,
    totalAmount: parseFloat(p.totalAmount as string),
    status: p.status,
    projectId: p.projectId,
    projectName: p.projectId == null ? "Unknown" : (projMap.get(p.projectId) ?? "Unknown"),
    requestedBy: p.requestedBy,
    approvedBy: p.approvedBy ?? null,
    deliveryDate: p.deliveryDate ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/procurement", requirePermission("procurement.create"), async (req, res): Promise<void> => {
  const parsed = CreateProcurementOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const organizationId = tenantId(req);
  const project = await ownedProject(req, d.projectId);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const [row] = await db.insert(procurementTable).values({
    title: d.title,
    supplier: d.supplier,
    totalAmount: d.totalAmount.toString(),
    status: d.status ?? "draft",
    projectId: d.projectId,
    organizationId,
    requestedBy: d.requestedBy,
    deliveryDate: d.deliveryDate,
    notes: d.notes,
  }).returning();

  res.status(201).json({
    ...row,
    totalAmount: parseFloat(row.totalAmount as string),
    projectName: project.name,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/procurement/:id", requirePermission("procurement.update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateProcurementOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const organizationId = tenantId(req);
  const [current] = await db.select().from(procurementTable).where(and(eq(procurementTable.id, id), eq(procurementTable.organizationId, organizationId)));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (d.title !== undefined) updates.title = d.title;
  if (d.supplier !== undefined) updates.supplier = d.supplier;
  if (d.totalAmount !== undefined) updates.totalAmount = d.totalAmount.toString();
  if (d.status !== undefined) updates.status = d.status;
  if (d.approvedBy !== undefined) updates.approvedBy = d.approvedBy;
  if (d.deliveryDate !== undefined) updates.deliveryDate = d.deliveryDate;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [row] = await db.update(procurementTable).set(updates).where(and(eq(procurementTable.id, id), eq(procurementTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const [proj] = row.projectId == null ? [] : await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, organizationId)));

  res.json({
    ...row,
    totalAmount: parseFloat(row.totalAmount as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
