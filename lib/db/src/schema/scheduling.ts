import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";
import { planningActivitiesTable } from "./planning";
import { workBreakdownStructuresTable } from "./planning";

// ─── Scheduling & Gantt ──────────────────────────────────────────────────────

export const projectCalendarsTable = pgTable("project_calendars", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: integer("is_default").notNull().default(0),
  workDays: text("work_days").notNull().default("1,2,3,4,5,6"), // 0=Sun..6=Sat, Persian week
  workStartHour: text("work_start_hour").notNull().default("08:00"),
  workEndHour: text("work_end_hour").notNull().default("17:00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const calendarExceptionsTable = pgTable("calendar_exceptions", {
  id: serial("id").primaryKey(),
  calendarId: integer("calendar_id").notNull().references(() => projectCalendarsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  exceptionDate: date("exception_date", { mode: "string" }).notNull(),
  isWorkingDay: integer("is_working_day").notNull().default(0),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityDependenciesTable = pgTable("activity_dependencies", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  predecessorId: integer("predecessor_id").notNull().references(() => planningActivitiesTable.id),
  successorId: integer("successor_id").notNull().references(() => planningActivitiesTable.id),
  dependencyType: text("dependency_type").notNull().default("FS"), // FS, SS, FF, SF
  lagDays: integer("lag_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ─── Progress & Baselines ────────────────────────────────────────────────────

export const baselinesTable = pgTable("baselines", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  isActive: integer("is_active").notNull().default(0),
  description: text("description"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const baselineActivitiesTable = pgTable("baseline_activities", {
  id: serial("id").primaryKey(),
  baselineId: integer("baseline_id").notNull().references(() => baselinesTable.id),
  activityId: integer("activity_id").notNull().references(() => planningActivitiesTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  plannedStart: date("planned_start", { mode: "string" }).notNull(),
  plannedFinish: date("planned_finish", { mode: "string" }).notNull(),
  durationDays: integer("duration_days").notNull(),
  plannedCost: numeric("planned_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  plannedLaborHours: numeric("planned_labor_hours", { precision: 10, scale: 1 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const actualProgressTable = pgTable("actual_progress", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => planningActivitiesTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  reportDate: date("report_date", { mode: "string" }).notNull(),
  progressPercent: integer("progress_percent").notNull().default(0),
  actualStart: date("actual_start", { mode: "string" }),
  actualFinish: date("actual_finish", { mode: "string" }),
  actualCost: numeric("actual_cost", { precision: 15, scale: 2 }),
  actualLaborHours: numeric("actual_labor_hours", { precision: 10, scale: 1 }),
  physicalProgress: integer("physical_progress").default(0),
  status: text("status").notNull().default("not_started"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evmMetricsTable = pgTable("evm_metrics", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  baselineId: integer("baseline_id").notNull().references(() => baselinesTable.id),
  reportDate: date("report_date", { mode: "string" }).notNull(),
  plannedValue: numeric("planned_value", { precision: 15, scale: 2 }).notNull().default("0"),
  earnedValue: numeric("earned_value", { precision: 15, scale: 2 }).notNull().default("0"),
  actualCost: numeric("actual_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  costVariance: numeric("cost_variance", { precision: 15, scale: 2 }).notNull().default("0"),
  scheduleVariance: numeric("schedule_variance", { precision: 15, scale: 2 }).notNull().default("0"),
  costPerformanceIndex: numeric("cost_performance_index", { precision: 5, scale: 2 }).notNull().default("1"),
  schedulePerformanceIndex: numeric("schedule_performance_index", { precision: 5, scale: 2 }).notNull().default("1"),
  estimateAtCompletion: numeric("estimate_at_completion", { precision: 15, scale: 2 }),
  estimateToComplete: numeric("estimate_to_complete", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Resources & Tasks ───────────────────────────────────────────────────────

export const resourceTypesTable = pgTable("resource_types", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  category: text("category").notNull(), // labor, equipment, material
  unit: text("unit").notNull(),
  defaultCostPerUnit: numeric("default_cost_per_unit", { precision: 15, scale: 2 }).notNull().default("0"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const resourceAssignmentsTable = pgTable("resource_assignments", {
  id: serial("id").primaryKey(),
  activityId: integer("activity_id").notNull().references(() => planningActivitiesTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  resourceTypeId: integer("resource_type_id").notNull().references(() => resourceTypesTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  costPerUnit: numeric("cost_per_unit", { precision: 15, scale: 2 }).notNull().default("0"),
  totalCost: numeric("total_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  startDate: date("start_date", { mode: "string" }),
  endDate: date("end_date", { mode: "string" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// ─── Insert Schemas ──────────────────────────────────────────────────────────

export const insertCalendarSchema = createInsertSchema(projectCalendarsTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export const insertCalendarExceptionSchema = createInsertSchema(calendarExceptionsTable).omit({ id: true, createdAt: true, organizationId: true });
export const insertActivityDependencySchema = createInsertSchema(activityDependenciesTable).omit({ id: true, createdAt: true, organizationId: true });
export const insertBaselineSchema = createInsertSchema(baselinesTable).omit({ id: true, createdAt: true, organizationId: true });
export const insertBaselineActivitySchema = createInsertSchema(baselineActivitiesTable).omit({ id: true, createdAt: true, organizationId: true });
export const insertActualProgressSchema = createInsertSchema(actualProgressTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export const insertEvmMetricSchema = createInsertSchema(evmMetricsTable).omit({ id: true, createdAt: true, organizationId: true });
export const insertResourceTypeSchema = createInsertSchema(resourceTypesTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export const insertResourceAssignmentSchema = createInsertSchema(resourceAssignmentsTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
