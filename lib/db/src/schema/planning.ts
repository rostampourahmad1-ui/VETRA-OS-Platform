import { pgTable, serial, text, integer, date, timestamp } from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

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

/** Hierarchical work breakdown structure; activity schedule data is kept separately. */
export const workBreakdownStructuresTable = pgTable("work_breakdown_structures", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  parentId: integer("parent_id"),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** Server-owned activity records used by future scheduling, Gantt and baseline modules. */
export const planningActivitiesTable = pgTable("planning_activities", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  wbsId: integer("wbs_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  activityType: text("activity_type").notNull().default("task"),
  plannedStart: date("planned_start", { mode: "string" }).notNull(),
  plannedFinish: date("planned_finish", { mode: "string" }).notNull(),
  durationDays: integer("duration_days").notNull(),
  status: text("status").notNull().default("not_started"),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type Phase = typeof phasesTable.$inferSelect;
export type Milestone = typeof milestonesTable.$inferSelect;
export type WorkBreakdownStructure = typeof workBreakdownStructuresTable.$inferSelect;
export type PlanningActivity = typeof planningActivitiesTable.$inferSelect;
