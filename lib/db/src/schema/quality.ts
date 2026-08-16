import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  type: text("type").notNull().default("routine"),
  status: text("status").notNull().default("planned"),
  inspector: text("inspector").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  findings: text("findings"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const nonConformanceReportsTable = pgTable("non_conformance_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  title: text("title").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  description: text("description").notNull(),
  correctiveAction: text("corrective_action"),
  assignedTo: text("assigned_to"),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({ id: true, createdAt: true });
export const insertNonConformanceReportSchema = createInsertSchema(nonConformanceReportsTable).omit({ id: true, createdAt: true });

export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;
export type InsertNonConformanceReport = z.infer<typeof insertNonConformanceReportSchema>;
export type NonConformanceReport = typeof nonConformanceReportsTable.$inferSelect;
