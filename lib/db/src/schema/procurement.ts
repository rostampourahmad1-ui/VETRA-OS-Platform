import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const procurementTable = pgTable("procurement", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  supplier: text("supplier").notNull(),
  totalAmount: numeric("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  projectId: integer("project_id").references(() => projectsTable.id),
  requestedBy: text("requested_by").notNull(),
  approvedBy: text("approved_by"),
  deliveryDate: date("delivery_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProcurementSchema = createInsertSchema(procurementTable).omit({ id: true, createdAt: true });
export type InsertProcurement = z.infer<typeof insertProcurementSchema>;
export type Procurement = typeof procurementTable.$inferSelect;
