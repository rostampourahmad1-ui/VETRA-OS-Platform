import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

/**
 * VETRA-SEC-04: Audit Logs Table
 *
 * Immutable audit trail for all sensitive operations.
 * Each row records who performed what action on which resource,
 * within which organization, at what time.
 *
 * Security:
 * - organizationId enforces tenant isolation
 * - Rows are append-only (no UPDATE/DELETE via application code)
 * - oldValues/newValues stored as JSONB for forensic analysis
 */
export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id),
  actorId: integer("actor_id").references(() => usersTable.id),
  actorClerkId: text("actor_clerk_id"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  oldValues: jsonb("old_values"),
  newValues: jsonb("new_values"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Audit action types */
export const AuditAction = {
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_ROLE_CHANGED: "user.role_changed",
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  CONTRACT_CREATED: "contract.created",
  CONTRACT_UPDATED: "contract.updated",
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_DOWNLOADED: "document.downloaded",
  DOCUMENT_DELETED: "document.deleted",
  LOGIN: "session.login",
  LOGOUT: "session.logout",
  PERMISSION_GRANTED: "permission.granted",
  PERMISSION_REVOKED: "permission.revoked",
  CROSS_TENANT_ATTEMPT: "security.cross_tenant_attempt",
  WEBHOOK_RECEIVED: "webhook.received",
  WEBHOOK_FAILED: "webhook.failed",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
export type AuditLog = typeof auditLogsTable.$inferSelect;
