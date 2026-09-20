import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { date, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { usersTable } from "./users";

export const inspectionStatuses = ["planned", "in_progress", "completed", "cancelled"] as const;
export const ncrStatuses = ["open", "in_progress", "resolved", "awaiting_approval", "closed"] as const;
export const qualityEventTypes = [
  "created",
  "updated",
  "transitioned",
  "workflow_submitted",
  "workflow_approved",
  "workflow_rejected",
  "workflow_revision_requested",
  "deleted",
] as const;

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
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  deletedBy: integer("deleted_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
  workflowRunId: integer("workflow_run_id"),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  deletedBy: integer("deleted_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Immutable domain events for inspections and NCR lifecycle transitions. */
export const qualityEventsTable = pgTable("quality_events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  eventType: text("event_type").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status"),
  reason: text("reason"),
  snapshot: jsonb("snapshot"),
  actorId: integer("actor_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({
  id: true,
  organizationId: true,
  createdBy: true,
  updatedBy: true,
  deletedBy: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export const insertNonConformanceReportSchema = createInsertSchema(nonConformanceReportsTable).omit({
  id: true,
  organizationId: true,
  workflowRunId: true,
  createdBy: true,
  updatedBy: true,
  deletedBy: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;
export type InsertNonConformanceReport = z.infer<typeof insertNonConformanceReportSchema>;
export type NonConformanceReport = typeof nonConformanceReportsTable.$inferSelect;
export type QualityEvent = typeof qualityEventsTable.$inferSelect;
