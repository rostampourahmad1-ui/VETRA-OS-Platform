import { Router } from "express";
import { db, procurementTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateProcurementOrderBody, UpdateProcurementOrderBody } from "@workspace/api-zod";

const router = Router();

router.get("/procurement", async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };

  let rows = await db.select().from(procurementTable);
  if (projectId) rows = rows.filter(p => p.projectId !== null && p.projectId === parseInt(projectId, 10));
  if (status) rows = rows.filter(p => p.status === status);

  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(p => ({
    id: p.id,
    title: p.title,
    supplier: p.supplier,
    totalAmount: parseFloat(p.totalAmount as string),
    status: p.status,
    projectId: p.projectId,
    projectName: projMap.get(p.projectId) ?? "Unknown",
    requestedBy: p.requestedBy,
    approvedBy: p.approvedBy ?? null,
    deliveryDate: p.deliveryDate ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt.toISOString(),
  })));
});

router.post("/procurement", async (req, res): Promise<void> => {
  const parsed = CreateProcurementOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(procurementTable).values({
    title: d.title,
    supplier: d.supplier,
    totalAmount: d.totalAmount.toString(),
    status: d.status ?? "draft",
    projectId: d.projectId,
    requestedBy: d.requestedBy,
    deliveryDate: d.deliveryDate,
    notes: d.notes,
  }).returning();

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.status(201).json({
    ...row,
    totalAmount: parseFloat(row.totalAmount as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/procurement/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateProcurementOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.title !== undefined) updates.title = d.title;
  if (d.supplier !== undefined) updates.supplier = d.supplier;
  if (d.totalAmount !== undefined) updates.totalAmount = d.totalAmount.toString();
  if (d.status !== undefined) updates.status = d.status;
  if (d.approvedBy !== undefined) updates.approvedBy = d.approvedBy;
  if (d.deliveryDate !== undefined) updates.deliveryDate = d.deliveryDate;
  if (d.notes !== undefined) updates.notes = d.notes;

  const [row] = await db.update(procurementTable).set(updates).where(eq(procurementTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.json({
    ...row,
    totalAmount: parseFloat(row.totalAmount as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
