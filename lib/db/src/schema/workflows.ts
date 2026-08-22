import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const workflowsTable = pgTable("workflows", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(),
  active: integer("active").notNull().default(1),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  organizationIdx: index("workflows_organization_id_idx").on(table.organizationId),
}));

export const workflowStepsTable = pgTable("workflow_steps", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => workflowsTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  name: text("name").notNull(),
  requiredPermission: text("required_permission").notNull(),
  status: text("status").notNull().default("pending"),
}, (table) => ({
  workflowOrderIdx: index("workflow_steps_workflow_order_idx").on(table.workflowId, table.stepOrder),
}));

export const workflowRunsTable = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => workflowsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  currentStep: integer("current_step").notNull().default(1),
  status: text("status").notNull().default("pending"),
  submittedBy: integer("submitted_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  organizationIdx: index("workflow_runs_organization_id_idx").on(table.organizationId),
  workflowIdx: index("workflow_runs_workflow_id_idx").on(table.workflowId),
}));

/** Immutable server-authored approval decisions for a workflow run. */
export const workflowRunEventsTable = pgTable("workflow_run_events", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  workflowRunId: integer("workflow_run_id").notNull().references(() => workflowRunsTable.id, { onDelete: "cascade" }),
  workflowStepId: integer("workflow_step_id").references(() => workflowStepsTable.id),
  action: text("action").notNull(),
  comment: text("comment"),
  actorId: integer("actor_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index("workflow_run_events_organization_id_idx").on(table.organizationId),
  runIdx: index("workflow_run_events_run_id_idx").on(table.workflowRunId),
}));

export type Workflow = typeof workflowsTable.$inferSelect;
export type WorkflowStep = typeof workflowStepsTable.$inferSelect;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
export type WorkflowRunEvent = typeof workflowRunEventsTable.$inferSelect;
