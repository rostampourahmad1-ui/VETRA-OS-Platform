import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, inventoryTable, projectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { CreateInventoryItemBody, UpdateInventoryItemBody } from "@workspace/api-zod";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

router.get("/inventory", requirePermission("inventory.read"), async (req, res): Promise<void> => {
  const { projectId, category } = req.query as { projectId?: string; category?: string };
  const organizationId = tenantId(req);

  const filters = [eq(inventoryTable.organizationId, organizationId)];
  if (projectId) filters.push(eq(inventoryTable.projectId, parseInt(projectId, 10)));
  if (category) filters.push(eq(inventoryTable.category, category));
  const rows = await db.select().from(inventoryTable).where(and(...filters));

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId));
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(i => ({
    id: i.id,
    name: i.name,
    category: i.category,
    quantity: parseFloat(i.quantity as string),
    unit: i.unit,
    minStock: i.minStock ? parseFloat(i.minStock as string) : null,
    projectId: i.projectId ?? null,
    projectName: i.projectId ? (projMap.get(i.projectId) ?? null) : null,
    supplier: i.supplier ?? null,
    unitCost: i.unitCost ? parseFloat(i.unitCost as string) : null,
    createdAt: i.createdAt.toISOString(),
  })));
});

router.post("/inventory", requirePermission("inventory.create"), async (req, res): Promise<void> => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const organizationId = tenantId(req);
  const project = d.projectId === undefined ? null : await ownedProject(req, d.projectId);
  if (d.projectId !== undefined && !project) { res.status(404).json({ error: "Project not found" }); return; }

  const [row] = await db.insert(inventoryTable).values({
    name: d.name,
    category: d.category,
    quantity: d.quantity.toString(),
    unit: d.unit,
    minStock: d.minStock?.toString(),
    projectId: d.projectId,
    organizationId,
    supplier: d.supplier,
    unitCost: d.unitCost?.toString(),
  }).returning();

  res.status(201).json({
    ...row,
    quantity: parseFloat(row.quantity as string),
    minStock: row.minStock ? parseFloat(row.minStock as string) : null,
    unitCost: row.unitCost ? parseFloat(row.unitCost as string) : null,
    projectName: project?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/inventory/:id", requirePermission("inventory.update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const organizationId = tenantId(req);
  const [current] = await db.select().from(inventoryTable).where(and(eq(inventoryTable.id, id), eq(inventoryTable.organizationId, organizationId)));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }
  const project = d.projectId === undefined
    ? (current.projectId === null ? null : await ownedProject(req, current.projectId))
    : (d.projectId === null ? null : await ownedProject(req, d.projectId));
  if (d.projectId !== undefined && d.projectId !== null && !project) { res.status(400).json({ error: "Project not found" }); return; }
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.category !== undefined) updates.category = d.category;
  if (d.quantity !== undefined) updates.quantity = d.quantity.toString();
  if (d.unit !== undefined) updates.unit = d.unit;
  if (d.minStock !== undefined) updates.minStock = d.minStock?.toString();
  if (d.projectId !== undefined) updates.projectId = d.projectId;
  if (d.supplier !== undefined) updates.supplier = d.supplier;
  if (d.unitCost !== undefined) updates.unitCost = d.unitCost?.toString();

  const [row] = await db.update(inventoryTable).set(updates).where(and(eq(inventoryTable.id, id), eq(inventoryTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const proj = row.projectId ? await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, organizationId))) : [];

  res.json({
    ...row,
    quantity: parseFloat(row.quantity as string),
    minStock: row.minStock ? parseFloat(row.minStock as string) : null,
    unitCost: row.unitCost ? parseFloat(row.unitCost as string) : null,
    projectName: proj[0]?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
