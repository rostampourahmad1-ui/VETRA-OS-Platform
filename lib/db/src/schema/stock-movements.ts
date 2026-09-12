import { pgTable, text, serial, timestamp, integer, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { materialsTable } from "./procurement-ext";
import { warehouseTable } from "./procurement-ext";
import { usersTable } from "./users";

/**
 * Immutable ledger of all stock movements (in/out/adjust/transfer).
 * `materials.currentStock` is the derived aggregate; this table is the source of truth
 * for per-warehouse balances and audit trail.
 */
export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  materialId: integer("material_id").notNull().references(() => materialsTable.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouseTable.id),
  type: text("type").notNull(), // in | out | adjust | transfer
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  refType: text("ref_type"), // procurement_item | manual | adjustment
  refId: integer("ref_id"),
  barcode: text("barcode"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdx: index("stock_movements_org_idx").on(table.organizationId),
  materialIdx: index("stock_movements_material_idx").on(table.materialId),
  warehouseIdx: index("stock_movements_warehouse_idx").on(table.warehouseId),
}));

export const insertStockMovementSchema = createInsertSchema(stockMovementsTable).omit({
  id: true, createdAt: true, organizationId: true, createdBy: true,
});
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovementsTable.$inferSelect;
