import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { procurementTable } from "./procurement";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  category: text("category"),
  rating: integer("rating").default(0),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 2 }),
  currentStock: numeric("current_stock", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description"),
  supplierId: integer("supplier_id").references(() => suppliersTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;

export const warehouseTable = pgTable("warehouse", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  location: text("location"),
  manager: text("manager"),
  projectId: integer("project_id").references(() => projectsTable.id),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertWarehouseSchema = createInsertSchema(warehouseTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouseTable.$inferSelect;

export const procurementItemsTable = pgTable("procurement_items", {
  id: serial("id").primaryKey(),
  procurementId: integer("procurement_id").notNull().references(() => procurementTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  materialId: integer("material_id").references(() => materialsTable.id),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  unit: text("unit").notNull(),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull().default("0"),
  totalPrice: numeric("total_price", { precision: 15, scale: 2 }).notNull().default("0"),
  receivedQuantity: numeric("received_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  warehouseId: integer("warehouse_id").references(() => warehouseTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProcurementItemSchema = createInsertSchema(procurementItemsTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertProcurementItem = z.infer<typeof insertProcurementItemSchema>;
export type ProcurementItem = typeof procurementItemsTable.$inferSelect;
