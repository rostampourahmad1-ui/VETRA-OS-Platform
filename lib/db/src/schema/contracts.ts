import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contractor: text("contractor").notNull(),
  value: numeric("value", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  type: text("type"),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  signedDate: date("signed_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, organizationId: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;
