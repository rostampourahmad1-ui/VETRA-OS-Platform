import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contractsTable } from "./contracts";
import { organizationsTable } from "./organizations";

export const boqItemsTable = pgTable("boq_items", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  code: text("code").notNull(),
  description: text("description").notNull(),
  unit: text("unit").notNull(),
  quantity: numeric("quantity", { precision: 15, scale: 3 }).notNull().default("0"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull().default("0"),
  totalPrice: numeric("total_price", { precision: 15, scale: 2 }).notNull().default("0"),
  parentId: integer("parent_id"),
  level: integer("level").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertBoqItemSchema = createInsertSchema(boqItemsTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertBoqItem = z.infer<typeof insertBoqItemSchema>;
export type BoqItem = typeof boqItemsTable.$inferSelect;

export const qtoItemsTable = pgTable("qto_items", {
  id: serial("id").primaryKey(),
  boqItemId: integer("boq_item_id").notNull().references(() => boqItemsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  description: text("description").notNull(),
  unit: text("unit").notNull(),
  designQuantity: numeric("design_quantity", { precision: 15, scale: 3 }).notNull().default("0"),
  fieldQuantity: numeric("field_quantity", { precision: 15, scale: 3 }).notNull().default("0"),
  wasteFactor: numeric("waste_factor", { precision: 5, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQtoItemSchema = createInsertSchema(qtoItemsTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertQtoItem = z.infer<typeof insertQtoItemSchema>;
export type QtoItem = typeof qtoItemsTable.$inferSelect;

export const paymentCertificatesTable = pgTable("payment_certificates", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  certificateNumber: text("certificate_number").notNull(),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  previousCumulative: numeric("previous_cumulative", { precision: 15, scale: 2 }).notNull().default("0"),
  thisPeriod: numeric("this_period", { precision: 15, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 15, scale: 2 }).notNull().default("0"),
  retention: numeric("retention", { precision: 15, scale: 2 }).notNull().default("0"),
  netPayable: numeric("net_payable", { precision: 15, scale: 2 }).notNull().default("0"),
  cumulativeToDate: numeric("cumulative_to_date", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
