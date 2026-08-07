import { Router } from "express";
import { db, inventoryTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateInventoryItemBody, UpdateInventoryItemBody } from "@workspace/api-zod";

const router = Router();

router.get("/inventory", async (req, res): Promise<void> => {
  const { projectId, category } = req.query as { projectId?: string; category?: string };

  let rows = await db.select().from(inventoryTable);
  if (projectId) rows = rows.filter(i => i.projectId === parseInt(projectId, 10));
  if (category) rows = rows.filter(i => i.category === category);

  const projects = await db.select().from(projectsTable);
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

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(inventoryTable).values({
    name: d.name,
    category: d.category,
    quantity: d.quantity.toString(),
    unit: d.unit,
    minStock: d.minStock?.toString(),
    projectId: d.projectId,
    supplier: d.supplier,
    unitCost: d.unitCost?.toString(),
  }).returning();

  const proj = row.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId)) : [];

  res.status(201).json({
    ...row,
    quantity: parseFloat(row.quantity as string),
    minStock: row.minStock ? parseFloat(row.minStock as string) : null,
    unitCost: row.unitCost ? parseFloat(row.unitCost as string) : null,
    projectName: proj[0]?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.category !== undefined) updates.category = d.category;
  if (d.quantity !== undefined) updates.quantity = d.quantity.toString();
  if (d.unit !== undefined) updates.unit = d.unit;
  if (d.minStock !== undefined) updates.minStock = d.minStock?.toString();
  if (d.projectId !== undefined) updates.projectId = d.projectId;
  if (d.supplier !== undefined) updates.supplier = d.supplier;
  if (d.unitCost !== undefined) updates.unitCost = d.unitCost?.toString();

  const [row] = await db.update(inventoryTable).set(updates).where(eq(inventoryTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const proj = row.projectId ? await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId)) : [];

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
