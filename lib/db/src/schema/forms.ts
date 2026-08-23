import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { projectsTable } from "./projects";
import { usersTable } from "./users";
import { workflowRunsTable, workflowsTable } from "./workflows";

/**
 * Organization-scoped form definitions. Only draft templates may be changed;
 * published versions are stored separately as immutable snapshots.
 */
export const formTemplatesTable = pgTable("form_templates", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  workflowId: integer("workflow_id").references(() => workflowsTable.id),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  definition: jsonb("definition").notNull(),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  updatedBy: integer("updated_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  organizationIdx: index("form_templates_organization_id_idx").on(table.organizationId),
  projectIdx: index("form_templates_project_id_idx").on(table.projectId),
  workflowIdx: index("form_templates_workflow_id_idx").on(table.workflowId),
}));

/** Immutable definition snapshot created when a template is published. */
export const formTemplateVersionsTable = pgTable("form_template_versions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  templateId: integer("template_id").notNull().references(() => formTemplatesTable.id),
  version: integer("version").notNull(),
  definition: jsonb("definition").notNull(),
  publishedBy: integer("published_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdx: index("form_template_versions_organization_id_idx").on(table.organizationId),
  templateVersionUnique: uniqueIndex("form_template_versions_template_version_unique").on(table.templateId, table.version),
}));

/** A tenant-bound response to a single immutable form-template version. */
export const formSubmissionsTable = pgTable("form_submissions", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  projectId: integer("project_id").references(() => projectsTable.id),
  templateId: integer("template_id").notNull().references(() => formTemplatesTable.id),
  templateVersionId: integer("template_version_id").notNull().references(() => formTemplateVersionsTable.id),
  workflowRunId: integer("workflow_run_id").references(() => workflowRunsTable.id),
  status: text("status").notNull().default("draft"),
  answers: jsonb("answers").notNull(),
  submittedBy: integer("submitted_by").notNull().references(() => usersTable.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  organizationIdx: index("form_submissions_organization_id_idx").on(table.organizationId),
  projectIdx: index("form_submissions_project_id_idx").on(table.projectId),
  templateIdx: index("form_submissions_template_id_idx").on(table.templateId),
  workflowRunUnique: uniqueIndex("form_submissions_workflow_run_id_unique").on(table.workflowRunId),
}));

export type FormTemplate = typeof formTemplatesTable.$inferSelect;
export type FormTemplateVersion = typeof formTemplateVersionsTable.$inferSelect;
export type FormSubmission = typeof formSubmissionsTable.$inferSelect;
