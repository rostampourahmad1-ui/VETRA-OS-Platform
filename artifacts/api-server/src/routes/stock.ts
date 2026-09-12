import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, stockMovementsTable, materialsTable, warehouseTable, procurementItemsTable, userRolesTable, rolePermissionsTable, permissionsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { tenantId } from "../middlewares/tenant";
import { createNotification, NotificationType } from "../lib/notifications";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);

const VALID_TYPES = new Set(["in", "out", "adjust", "transfer"]);

// ─── POST /stock/receive ─────────────────────────────────────────────────────
// Receive stock into a warehouse. Optionally linked to a procurement item.
router.post("/stock/receive", requirePermission("stock.receive"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const { materialId, warehouseId, quantity, barcode, refType, refId, notes } = req.body;

  if (!materialId || !warehouseId || !quantity) {
    res.status(400).json({ error: "materialId, warehouseId, quantity are required" });
    return;
  }
  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }

  // Validate material + warehouse belong to this org
  const [material] = await db.select().from(materialsTable).where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  const [warehouse] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, warehouseId), eq(warehouseTable.organizationId, org)));
  if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return; }

  // If linked to procurement item, validate and check over-receive
  if (refType === "procurement_item" && refId) {
    const [item] = await db.select().from(procurementItemsTable).where(and(eq(procurementItemsTable.id, refId), eq(procurementItemsTable.organizationId, org)));
    if (!item) { res.status(404).json({ error: "Procurement item not found" }); return; }
    const receivedSoFar = Number(item.receivedQuantity);
    const ordered = Number(item.quantity);
    if (receivedSoFar + qty > ordered) {
      res.status(409).json({ error: "Over-receive: received + quantity exceeds ordered amount", receivedSoFar, ordered, requested: qty });
      return;
    }
  }

  // Atomic: insert movement + update material stock + update procurement receivedQuantity
  const [movement] = await db.transaction(async (tx) => {
    const [mv] = await tx.insert(stockMovementsTable).values({
      organizationId: org,
      materialId,
      warehouseId,
      type: "in",
      quantity: qty.toString(),
      refType: refType ?? "manual",
      refId: refId ?? null,
      barcode: barcode ?? null,
      notes: notes ?? null,
      createdBy: userId,
    }).returning();

    // Update materials.currentStock
    const newStock = sql`${materialsTable.currentStock} + ${qty.toString()}`;
    await tx.update(materialsTable).set({ currentStock: newStock, updatedAt: new Date() })
      .where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));

    // Update procurement_items.receivedQuantity if linked
    if (refType === "procurement_item" && refId) {
      const newReceived = sql`${procurementItemsTable.receivedQuantity} + ${qty.toString()}`;
      await tx.update(procurementItemsTable).set({ receivedQuantity: newReceived, updatedAt: new Date() })
        .where(and(eq(procurementItemsTable.id, refId), eq(procurementItemsTable.organizationId, org)));
    }

    return [mv];
  });

  res.status(201).json({ id: movement.id, materialId, warehouseId, type: "in", quantity: qty });
  audit(req, "stock.received", "stock_movement", { resourceId: movement.id, newValues: { materialId, warehouseId, quantity: qty } });

  // Low-stock check (fire-and-forget)
  checkLowStock(org, materialId, material.name, qty).catch(() => {});
});

// ─── POST /stock/issue ────────────────────────────────────────────────────────
router.post("/stock/issue", requirePermission("stock.create"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const { materialId, warehouseId, quantity, notes } = req.body;

  if (!materialId || !warehouseId || !quantity) {
    res.status(400).json({ error: "materialId, warehouseId, quantity are required" });
    return;
  }
  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  if (Number(material.currentStock) < qty) {
    res.status(409).json({ error: "Insufficient stock", currentStock: Number(material.currentStock), requested: qty });
    return;
  }
  const [warehouse] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, warehouseId), eq(warehouseTable.organizationId, org)));
  if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return; }

  const [movement] = await db.transaction(async (tx) => {
    const [mv] = await tx.insert(stockMovementsTable).values({
      organizationId: org, materialId, warehouseId, type: "out",
      quantity: (-qty).toString(), refType: "manual", notes: notes ?? null, createdBy: userId,
    }).returning();

    const newStock = sql`${materialsTable.currentStock} - ${qty.toString()}`;
    await tx.update(materialsTable).set({ currentStock: newStock, updatedAt: new Date() })
      .where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));

    return [mv];
  });

  res.status(201).json({ id: movement.id, materialId, warehouseId, type: "out", quantity: -qty });
  audit(req, "stock.issued", "stock_movement", { resourceId: movement.id, newValues: { materialId, warehouseId, quantity: -qty } });

  checkLowStock(org, materialId, material.name, -qty).catch(() => {});
});

// ─── POST /stock/adjust ──────────────────────────────────────────────────────
router.post("/stock/adjust", requirePermission("stock.create"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const { materialId, warehouseId, quantity, notes } = req.body;

  if (!materialId || !warehouseId || quantity === undefined || quantity === null) {
    res.status(400).json({ error: "materialId, warehouseId, quantity are required" });
    return;
  }
  const qty = Number(quantity);
  if (isNaN(qty)) {
    res.status(400).json({ error: "quantity must be a number (positive for add, negative for subtract)" });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  const newBalance = Number(material.currentStock) + qty;
  if (newBalance < 0) {
    res.status(409).json({ error: "Adjustment would result in negative stock", currentStock: Number(material.currentStock), adjustment: qty });
    return;
  }
  const [warehouse] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, warehouseId), eq(warehouseTable.organizationId, org)));
  if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return; }

  const [movement] = await db.transaction(async (tx) => {
    const [mv] = await tx.insert(stockMovementsTable).values({
      organizationId: org, materialId, warehouseId, type: "adjust",
      quantity: qty.toString(), refType: "adjustment", notes: notes ?? null, createdBy: userId,
    }).returning();

    const newStock = sql`${materialsTable.currentStock} + ${qty.toString()}`;
    await tx.update(materialsTable).set({ currentStock: newStock, updatedAt: new Date() })
      .where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));

    return [mv];
  });

  res.status(201).json({ id: movement.id, materialId, warehouseId, type: "adjust", quantity: qty, newBalance });
  audit(req, "stock.adjusted", "stock_movement", { resourceId: movement.id, newValues: { materialId, warehouseId, quantity: qty } });

  checkLowStock(org, materialId, material.name, qty).catch(() => {});
});

// ─── POST /stock/transfer ────────────────────────────────────────────────────
router.post("/stock/transfer", requirePermission("stock.create"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const { materialId, fromWarehouseId, toWarehouseId, quantity, notes } = req.body;

  if (!materialId || !fromWarehouseId || !toWarehouseId || !quantity) {
    res.status(400).json({ error: "materialId, fromWarehouseId, toWarehouseId, quantity are required" });
    return;
  }
  if (fromWarehouseId === toWarehouseId) {
    res.status(400).json({ error: "Source and destination warehouses must differ" });
    return;
  }
  const qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }

  const [material] = await db.select().from(materialsTable).where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  if (Number(material.currentStock) < qty) {
    res.status(409).json({ error: "Insufficient stock for transfer", currentStock: Number(material.currentStock), requested: qty });
    return;
  }
  const [fromWh] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, fromWarehouseId), eq(warehouseTable.organizationId, org)));
  if (!fromWh) { res.status(404).json({ error: "Source warehouse not found" }); return; }
  const [toWh] = await db.select().from(warehouseTable).where(and(eq(warehouseTable.id, toWarehouseId), eq(warehouseTable.organizationId, org)));
  if (!toWh) { res.status(404).json({ error: "Destination warehouse not found" }); return; }

  const [outMv, inMv] = await db.transaction(async (tx) => {
    const [out] = await tx.insert(stockMovementsTable).values({
      organizationId: org, materialId, warehouseId: fromWarehouseId, type: "transfer",
      quantity: (-qty).toString(), refType: "transfer", barcode: `→ WH#${toWarehouseId}`,
      notes: notes ?? `Transfer to ${toWh.name}`, createdBy: userId,
    }).returning();

    const [in_] = await tx.insert(stockMovementsTable).values({
      organizationId: org, materialId, warehouseId: toWarehouseId, type: "transfer",
      quantity: qty.toString(), refType: "transfer", barcode: `← WH#${fromWarehouseId}`,
      notes: notes ?? `Transfer from ${fromWh.name}`, createdBy: userId,
    }).returning();

    return [out, in_];
  });

  res.status(201).json({ outMovementId: outMv.id, inMovementId: inMv.id, materialId, quantity: qty });
  audit(req, "stock.transferred", "stock_movement", { resourceId: outMv.id, newValues: { materialId, fromWarehouseId, toWarehouseId, quantity: qty } });
});

// ─── GET /stock/ledger ───────────────────────────────────────────────────────
router.get("/stock/ledger", requirePermission("stock.read"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const { materialId, warehouseId, type, limit: lim, offset: off } = req.query as {
    materialId?: string; warehouseId?: string; type?: string; limit?: string; offset?: string;
  };
  const limit = Math.min(Math.max(Number(lim) || 50, 1), 200);
  const offset = Math.max(Number(off) || 0, 0);

  const filters = [eq(stockMovementsTable.organizationId, org)];
  if (materialId) filters.push(eq(stockMovementsTable.materialId, Number(materialId)));
  if (warehouseId) filters.push(eq(stockMovementsTable.warehouseId, Number(warehouseId)));
  if (type && VALID_TYPES.has(type)) filters.push(eq(stockMovementsTable.type, type));

  const rows = await db.select().from(stockMovementsTable)
    .where(and(...filters))
    .orderBy(sql`${stockMovementsTable.createdAt} desc`)
    .limit(limit).offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(stockMovementsTable).where(and(...filters));

  // Enrich with material and warehouse names
  const materialIds = [...new Set(rows.map(r => r.materialId))];
  const warehouseIds = [...new Set(rows.map(r => r.warehouseId))];
  const [materials, warehouses] = await Promise.all([
    materialIds.length ? db.select({ id: materialsTable.id, name: materialsTable.name, unit: materialsTable.unit })
      .from(materialsTable).where(sql`${materialsTable.id} IN (${sql.join(materialIds.map(id => sql`${id}`), sql`, `)})`) : [],
    warehouseIds.length ? db.select({ id: warehouseTable.id, name: warehouseTable.name })
      .from(warehouseTable).where(sql`${warehouseTable.id} IN (${sql.join(warehouseIds.map(id => sql`${id}`), sql`, `)})`) : [],
  ]);
  const matMap = new Map(materials.map(m => [m.id, m]));
  const whMap = new Map(warehouses.map(w => [w.id, w.name]));

  res.json({
    data: rows.map(r => ({
      id: r.id,
      materialId: r.materialId,
      materialName: matMap.get(r.materialId)?.name ?? null,
      materialUnit: matMap.get(r.materialId)?.unit ?? null,
      warehouseId: r.warehouseId,
      warehouseName: whMap.get(r.warehouseId) ?? null,
      type: r.type,
      quantity: Number(r.quantity),
      refType: r.refType,
      refId: r.refId,
      barcode: r.barcode,
      notes: r.notes,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
    })),
    pagination: { limit, offset, total: count, hasMore: offset + limit < count },
  });
});

// ─── GET /stock/balances ─────────────────────────────────────────────────────
// Per-material, per-warehouse balances computed from movements
router.get("/stock/balances", requirePermission("stock.read"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const { materialId, warehouseId } = req.query as { materialId?: string; warehouseId?: string };

  const filters = [eq(stockMovementsTable.organizationId, org)];
  if (materialId) filters.push(eq(stockMovementsTable.materialId, Number(materialId)));
  if (warehouseId) filters.push(eq(stockMovementsTable.warehouseId, Number(warehouseId)));

  const rows = await db.select({
    materialId: stockMovementsTable.materialId,
    warehouseId: stockMovementsTable.warehouseId,
    balance: sql<string>`COALESCE(SUM(${stockMovementsTable.quantity}::numeric), 0)`,
  }).from(stockMovementsTable)
    .where(and(...filters))
    .groupBy(stockMovementsTable.materialId, stockMovementsTable.warehouseId);

  // Enrich names
  const matIds = [...new Set(rows.map(r => r.materialId))];
  const whIds = [...new Set(rows.map(r => r.warehouseId))];
  const [materials, warehouses] = await Promise.all([
    matIds.length ? db.select({ id: materialsTable.id, name: materialsTable.name, unit: materialsTable.unit, minStock: materialsTable.minStock })
      .from(materialsTable).where(sql`${materialsTable.id} IN (${sql.join(matIds.map(id => sql`${id}`), sql`, `)})`) : [],
    whIds.length ? db.select({ id: warehouseTable.id, name: warehouseTable.name })
      .from(warehouseTable).where(sql`${warehouseTable.id} IN (${sql.join(whIds.map(id => sql`${id}`), sql`, `)})`) : [],
  ]);
  const matMap = new Map(materials.map(m => [m.id, m]));
  const whMap = new Map(warehouses.map(w => [w.id, w.name]));

  res.json(rows.map(r => ({
    materialId: r.materialId,
    materialName: matMap.get(r.materialId)?.name ?? null,
    materialUnit: matMap.get(r.materialId)?.unit ?? null,
    minStock: matMap.get(r.materialId)?.minStock ? Number(matMap.get(r.materialId)!.minStock) : null,
    warehouseId: r.warehouseId,
    warehouseName: whMap.get(r.warehouseId) ?? null,
    balance: Number(r.balance),
  })));
});

// ─── Low Stock Check ─────────────────────────────────────────────────────────
async function checkLowStock(org: number, materialId: number, materialName: string, delta: number): Promise<void> {
  const [material] = await db.select().from(materialsTable)
    .where(and(eq(materialsTable.id, materialId), eq(materialsTable.organizationId, org)));
  if (!material || !material.minStock) return;

  const currentStock = Number(material.currentStock);
  const minStock = Number(material.minStock);
  if (currentStock > minStock) return;

  // Find users with stock.read permission in this org
  const permittedUsers = await db.select({ userId: userRolesTable.userId })
    .from(userRolesTable)
    .innerJoin(rolePermissionsTable, eq(userRolesTable.roleId, rolePermissionsTable.roleId))
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(and(
      eq(permissionsTable.key, "stock.read"),
    ));

  // Also find org admin users
  const admins = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.organizationId, org)));

  const notifiedUserIds = new Set<number>([
    ...permittedUsers.map(u => u.userId),
    ...admins.map(u => u.id),
  ]);

  for (const uid of notifiedUserIds) {
    await createNotification({
      organizationId: org,
      userId: uid,
      title: "موجودی کم - " + materialName,
      message: `موجودی "${materialName}" به ${currentStock} ${material.unit} رسید (حداقل: ${minStock})`,
      type: NotificationType.LOW_STOCK,
      link: "/materials",
    }).catch(() => {});
  }
}

export default router;
