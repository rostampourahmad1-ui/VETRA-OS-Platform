import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const workflowsTable = pgTable("workflows", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull(),
  active: integer("active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workflowStepsTable = pgTable("workflow_steps", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => workflowsTable.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  name: text("name").notNull(),
  requiredPermission: text("required_permission").notNull(),
  status: text("status").notNull().default("pending"),
});

export const workflowRunsTable = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull().references(() => workflowsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  currentStep: integer("current_step").notNull().default(1),
  status: text("status").notNull().default("pending"),
  submittedBy: integer("submitted_by").references(() => usersTable.id),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Workflow = typeof workflowsTable.$inferSelect;
export type WorkflowStep = typeof workflowStepsTable.$inferSelect;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
