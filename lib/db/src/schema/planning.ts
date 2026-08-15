import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";

export const phasesTable = pgTable("project_phases", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  progress: integer("progress").notNull().default(0),
  color: text("color").notNull().default("#2563eb"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  phaseId: integer("phase_id").references(() => phasesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Phase = typeof phasesTable.$inferSelect;
export type Milestone = typeof milestonesTable.$inferSelect;
