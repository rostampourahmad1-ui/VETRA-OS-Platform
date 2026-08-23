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
  // Workflow actions
  WORKFLOW_CREATED: "workflow.created",
  WORKFLOW_RUN_SUBMITTED: "workflow_run.submitted",
  WORKFLOW_RUN_APPROVED: "workflow_run.approved",
  WORKFLOW_RUN_REJECTED: "workflow_run.rejected",
  WORKFLOW_RUN_REVISION_REQUESTED: "workflow_run.revision_requested",
  // Form template actions
  FORM_TEMPLATE_CREATED: "form_template.created",
  FORM_TEMPLATE_UPDATED: "form_template.updated",
  FORM_TEMPLATE_PUBLISHED: "form_template.published",
  FORM_TEMPLATE_DELETED: "form_template.deleted",
  FORM_TEMPLATE_ARCHIVED: "form_template.archived",
  // Form submission actions
  FORM_SUBMISSION_CREATED: "form_submission.created",
  FORM_SUBMISSION_UPDATED: "form_submission.updated",
  FORM_SUBMISSION_SUBMITTED: "form_submission.submitted",
  FORM_SUBMISSION_DELETED: "form_submission.deleted",
  // NCR actions
  NCR_CREATED: "ncr.created",
  NCR_UPDATED: "ncr.updated",
  NCR_WORKFLOW_SUBMITTED: "ncr.workflow_submitted",
  NCR_WORKFLOW_APPROVED: "ncr.workflow_approved",
  NCR_WORKFLOW_REJECTED: "ncr.workflow_rejected",
  NCR_WORKFLOW_REVISION_REQUESTED: "ncr.workflow_revision_requested",
  NCR_TRANSITIONED: "ncr.transitioned",
  NCR_DELETED: "ncr.deleted",
  // Inspection actions
  INSPECTION_CREATED: "inspection.created",
  INSPECTION_UPDATED: "inspection.updated",
  INSPECTION_TRANSITIONED: "inspection.transitioned",
  INSPECTION_DELETED: "inspection.deleted",
  // Equipment actions
  EQUIPMENT_CREATED: "equipment.created",
  EQUIPMENT_UPDATED: "equipment.updated",
  // Inventory actions
  INVENTORY_CREATED: "inventory.created",
  INVENTORY_UPDATED: "inventory.updated",
  // Procurement actions
  PROCUREMENT_CREATED: "procurement.created",
  PROCUREMENT_UPDATED: "procurement.updated",
  // Supplier & Material (procurement-ext) actions
  SUPPLIER_CREATED: "supplier.created",
  SUPPLIER_UPDATED: "supplier.updated",
  SUPPLIER_DELETED: "supplier.deleted",
  MATERIAL_CREATED: "material.created",
  MATERIAL_UPDATED: "material.updated",
  MATERIAL_DELETED: "material.deleted",
  WAREHOUSE_CREATED: "warehouse.created",
  WAREHOUSE_UPDATED: "warehouse.updated",
  WAREHOUSE_DELETED: "warehouse.deleted",
  PROCUREMENT_ITEM_CREATED: "procurement_item.created",
  PROCUREMENT_ITEM_UPDATED: "procurement_item.updated",
  PROCUREMENT_ITEM_DELETED: "procurement_item.deleted",
  // HR actions
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_DELETED: "employee.deleted",
  ATTENDANCE_CREATED: "attendance.created",
  ATTENDANCE_UPDATED: "attendance.updated",
  PAYROLL_CREATED: "payroll.created",
  PAYROLL_UPDATED: "payroll.updated",
  PAYROLL_PAID: "payroll.paid",
  // Scheduling actions
  SCHEDULING_CALENDAR_CREATED: "scheduling.calendar.created",
  SCHEDULING_CALENDAR_UPDATED: "scheduling.calendar.updated",
  SCHEDULING_CALENDAR_DELETED: "scheduling.calendar.deleted",
  SCHEDULING_DEPENDENCY_CREATED: "scheduling.dependency.created",
  SCHEDULING_DEPENDENCY_DELETED: "scheduling.dependency.deleted",
  SCHEDULING_BASELINE_CREATED: "scheduling.baseline.created",
  SCHEDULING_BASELINE_SNAPSHOTTED: "scheduling.baseline.snapshotted",
  SCHEDULING_PROGRESS_REPORTED: "scheduling.progress.reported",
  SCHEDULING_EVM_CALCULATED: "scheduling.evm.calculated",
  SCHEDULING_RESOURCE_TYPE_CREATED: "scheduling.resource_type.created",
  SCHEDULING_RESOURCE_ASSIGNED: "scheduling.resource_assigned",
  // BOQ, QTO, Payment Certificate actions
  BOQ_CREATED: "boq.created",
  BOQ_UPDATED: "boq.updated",
  BOQ_DELETED: "boq.deleted",
  QTO_CREATED: "qto.created",
  QTO_UPDATED: "qto.updated",
  PAYMENT_CERTIFICATE_CREATED: "payment_certificate.created",
  PAYMENT_CERTIFICATE_UPDATED: "payment_certificate.updated",
  PAYMENT_CERTIFICATE_APPROVED: "payment_certificate.approved",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
export type AuditLog = typeof auditLogsTable.$inferSelect;
