import { Router } from "express";
import { and, eq, desc, isNull } from "drizzle-orm";
import { db, suppliersTable, materialsTable, warehouseTable, procurementItemsTable, procurementTable, projectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

// ─── Suppliers ───────────────────────────────────────────────────────────────

router.get("/suppliers", requirePermission("procurement.read"), async (req, res): Promise<void> => {
  const { category, status } = req.query as { category?: string; status?: string };
  const filters = [eq(suppliersTable.organizationId, tenantId(req)), isNull(suppliersTable.deletedAt)];
  if (category) filters.push(eq(suppliersTable.category, category));
  if (status) filters.push(eq(suppliersTable.status, status));
  const rows = await db.select().from(suppliersTable).where(and(...filters)).orderBy(desc(suppliersTable.createdAt));
  res.json(rows);
});

router.post("/suppliers", requirePermission("procurement.create"), async (req, res): Promise<void> => {
  const { name, contactPerson, phone, email, address, taxId, category, rating, notes } = req.body;
  if (!name || !phone) { res.status(400).json({ error: "name and phone are required" }); return; }
  const [row] = await db.insert(suppliersTable).values({
    organizationId: tenantId(req), name, contactPerson, phone, email, address, taxId, category, rating, notes, createdBy: req.vetraUser!.id,
  }).returning();
  res.status(201).json(row);
  audit(req, "supplier.created", "supplier", { resourceId: row.id, newValues: { name, category } });
});

router.patch("/suppliers/:id", requirePermission("procurement.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Supplier not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["name", "contactPerson", "phone", "email", "address", "taxId", "category", "rating", "status", "notes"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  upd.updatedAt = new Date();
  const [row] = await db.update(suppliersTable).set(upd).where(and(eq(suppliersTable.id, id), eq(suppliersTable.organizationId, tenantId(req)))).returning();
  res.json(row);
  audit(req, "supplier.updated", "supplier", { resourceId: id, oldValues: { name: current.name }, newValues: { name: row.name } });
});

router.delete("/suppliers/:id", requirePermission("procurement.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(suppliersTable).where(and(eq(suppliersTable.id, id), eq(suppliersTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Supplier not found" }); return; }
  await db.update(suppliersTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(suppliersTable.id, id), eq(suppliersTable.organizationId, tenantId(req))));
  res.status(204).end();
  audit(req, "supplier.deleted", "supplier", { resourceId: id, oldValues: { name: current.name } });
});

// ─── Materials ───────────────────────────────────────────────────────────────

router.get("/materials", requirePermission("procurement.read"), async (req, res): Promise<void> => {
  const { category, projectId } = req.query as { category?: string; projectId?: string };
  const filters = [eq(materialsTable.organizationId, tenantId(req)), isNull(materialsTable.deletedAt)];
  if (category) filters.push(eq(materialsTable.category, category));
  if (projectId) filters.push(eq(materialsTable.projectId, Number(projectId)));
  const rows = await db.select().from(materialsTable).where(and(...filters)).orderBy(materialsTable.name);
  const suppliers = await db.select().from(suppliersTable).where(and(eq(suppliersTable.organizationId, tenantId(req)), isNull(suppliersTable.deletedAt)));
  const supMap = new Map(suppliers.map(s => [s.id, s.name]));
  res.json(rows.map(r => ({ ...r, unitPrice: Number(r.unitPrice), currentStock: Number(r.currentStock), minStock: r.minStock ? Number(r.minStock) : null, supplierName: r.supplierId ? (supMap.get(r.supplierId) ?? null) : null })));
});

router.post("/materials", requirePermission("procurement.create"), async (req, res): Promise<void> => {
  const { code, name, category, unit, unitPrice, minStock, currentStock, description, supplierId, projectId } = req.body;
  if (!code || !name || !category || !unit) { res.status(400).json({ error: "code, name, category, unit are required" }); return; }
  const [row] = await db.insert(materialsTable).values({
    organizationId: tenantId(req), code, name, category, unit, unitPrice: (unitPrice ?? "0").toString(),
    minStock: minStock?.toString(), currentStock: (currentStock ?? "0").toString(), description,
    supplierId: supplierId ?? null, projectId: projectId ?? null,
  }).returning();
  res.status(201).json({ ...row, unitPrice: Number(row.unitPrice), currentStock: Number(row.currentStock), minStock: row.minStock ? Number(row.minStock) : null });
  audit(req, "material.created", "material", { resourceId: row.id, newValues: { code, name, category } });
});

router.patch("/materials/:id", requirePermission("procurement.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(materialsTable).where(and(eq(materialsTable.id, id), eq(materialsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Material not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["code", "name", "category", "unit", "description", "supplierId", "projectId"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  if (req.body.unitPrice !== undefined) upd.unitPrice = req.body.unitPrice.toString();
  if (req.body.minStock !== undefined) upd.minStock = req.body.minStock.toString();
  if (req.body.currentStock !== undefined) upd.currentStock = req.body.currentStock.toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(materialsTable).set(upd).where(and(eq(materialsTable.id, id), eq(materialsTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, unitPrice: Number(row.unitPrice), currentStock: Number(row.currentStock), minStock: row.minStock ? Number(row.minStock) : null });
  audit(req, "material.updated", "material", { resourceId: id, oldValues: { name: current.name }, newValues: { name: row.name } });
});

router.delete("/materials/:id", requirePermission("procurement.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(materialsTable).where(and(eq(materialsTable.id, id), eq(materialsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Material not found" }); return; }
  await db.update(materialsTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(materialsTable.id, id), eq(materialsTable.organizationId, tenantId(req))));
  res.status(204).end();
  audit(req, "material.deleted", "material", { resourceId: id, oldValues: { code: current.code } });
});

// ─── Warehouse ───────────────────────────────────────────────────────────────

router.get("/warehouse", requirePermission("procurement.read"), async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };
  const filters = [eq(warehouseTable.organizationId, tenantId(req)), isNull(warehouseTable.deletedAt)];
  if (projectId) filters.push(eq(warehouseTable.projectId, Number(projectId)));
  if (status) filters.push(eq(warehouseTable.status, status));
  const rows = await db.select().from(warehouseTable).where(and(...filters)).orderBy(warehouseTable.name);
  res.json(rows);
});

router.post("/warehouse", requirePermission("procurement.create"), async (req, res): Promise<void> => {
  const { name, location, manager, projectId, notes } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [row] = await db.insert(warehouseTable).values({
    organizationId: tenantId(req), name, location, manager, projectId: projectId ?? null, notes,
  }).returning();
  res.status(201).json(row);
  audit(req, "warehouse.created", "warehouse", { resourceId: row.id, newValues: { name, location } });
});

router.patch("/warehouse/:id", requirePermission("procurement.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, id), eq(warehouseTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Warehouse not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["name", "location", "manager", "status", "notes", "projectId"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  upd.updatedAt = new Date();
  const [row] = await db.update(warehouseTable).set(upd).where(and(eq(warehouseTable.id, id), eq(warehouseTable.organizationId, tenantId(req)))).returning();
  res.json(row);
  audit(req, "warehouse.updated", "warehouse", { resourceId: id, oldValues: { name: current.name }, newValues: { name: row.name } });
});

router.delete("/warehouse/:id", requirePermission("procurement.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, id), eq(warehouseTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Warehouse not found" }); return; }
  await db.update(warehouseTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(warehouseTable.id, id), eq(warehouseTable.organizationId, tenantId(req))));
  res.status(204).end();
  audit(req, "warehouse.deleted", "warehouse", { resourceId: id, oldValues: { name: current.name } });
});

// ─── Procurement Items ───────────────────────────────────────────────────────

router.get("/procurement/:procurementId/items", requirePermission("procurement.read"), async (req, res): Promise<void> => {
  const procurementId = Number(req.params.procurementId);
  const [order] = await db.select().from(procurementTable).where(and(eq(procurementTable.id, procurementId), eq(procurementTable.organizationId, tenantId(req))));
  if (!order) { res.status(404).json({ error: "Procurement order not found" }); return; }
  const rows = await db.select().from(procurementItemsTable).where(and(eq(procurementItemsTable.procurementId, procurementId), eq(procurementItemsTable.organizationId, tenantId(req))));
  const materials = await db.select().from(materialsTable).where(and(eq(materialsTable.organizationId, tenantId(req)), isNull(materialsTable.deletedAt)));
  const matMap = new Map(materials.map(m => [m.id, m.name]));
  res.json(rows.map(r => ({ ...r, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice), totalPrice: Number(r.totalPrice), receivedQuantity: Number(r.receivedQuantity), materialName: r.materialId ? (matMap.get(r.materialId) ?? null) : null })));
});

router.post("/procurement/:procurementId/items", requirePermission("procurement.create"), async (req, res): Promise<void> => {
  const procurementId = Number(req.params.procurementId);
  const { materialId, description, quantity, unit, unitPrice, warehouseId, notes } = req.body;
  const [order] = await db.select().from(procurementTable).where(and(eq(procurementTable.id, procurementId), eq(procurementTable.organizationId, tenantId(req))));
  if (!order) { res.status(404).json({ error: "Procurement order not found" }); return; }
  if (!description || !unit || !quantity) { res.status(400).json({ error: "description, unit, quantity are required" }); return; }
  const totalPrice = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const [row] = await db.insert(procurementItemsTable).values({
    procurementId, organizationId: tenantId(req), materialId: materialId ?? null, description, unit,
    quantity: quantity.toString(), unitPrice: (unitPrice ?? "0").toString(), totalPrice: totalPrice.toString(),
    warehouseId: warehouseId ?? null, notes,
  }).returning();
  res.status(201).json({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), totalPrice: Number(row.totalPrice), receivedQuantity: Number(row.receivedQuantity) });
  audit(req, "procurement_item.created", "procurement_item", { resourceId: row.id, newValues: { description, procurementId } });
});

router.patch("/procurement/:procurementId/items/:id", requirePermission("procurement.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(procurementItemsTable).where(and(eq(procurementItemsTable.id, id), eq(procurementItemsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Procurement item not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["description", "unit", "materialId", "warehouseId", "notes"] as const) if (req.body[k] !== undefined) upd[k] = req.body[k];
  if (req.body.quantity !== undefined) upd.quantity = req.body.quantity.toString();
  if (req.body.unitPrice !== undefined) upd.unitPrice = req.body.unitPrice.toString();
  if (req.body.receivedQuantity !== undefined) upd.receivedQuantity = req.body.receivedQuantity.toString();
  const q = Number(upd.quantity ?? current.quantity);
  const p = Number(upd.unitPrice ?? current.unitPrice);
  upd.totalPrice = (q * p).toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(procurementItemsTable).set(upd).where(and(eq(procurementItemsTable.id, id), eq(procurementItemsTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), totalPrice: Number(row.totalPrice), receivedQuantity: Number(row.receivedQuantity) });
  audit(req, "procurement_item.updated", "procurement_item", { resourceId: id, oldValues: { description: current.description }, newValues: { description: row.description } });
});

router.delete("/procurement/:procurementId/items/:id", requirePermission("procurement.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(procurementItemsTable).where(and(eq(procurementItemsTable.id, id), eq(procurementItemsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Procurement item not found" }); return; }
  await db.delete(procurementItemsTable).where(and(eq(procurementItemsTable.id, id), eq(procurementItemsTable.organizationId, tenantId(req))));
  res.status(204).end();
  audit(req, "procurement_item.deleted", "procurement_item", { resourceId: id, oldValues: { description: current.description } });
});

export default router;
