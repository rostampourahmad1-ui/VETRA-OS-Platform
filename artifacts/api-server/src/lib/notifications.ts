import type { Request } from "express";
import { db, notificationsTable, notificationPreferencesTable, usersTable, projectsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { sseBroadcaster } from "./sseBroadcaster";
import { logger } from "./logger";

/**
 * VETRA-SEC-04: Notification Trigger Service
 *
 * Creates notifications when business events occur (task assignments,
 * workflow approvals, document uploads, etc.).
 *
 * All writes are fire-and-forget (non-blocking) to avoid impacting
 * response times. Failures are logged but never thrown to the caller.
 */

export interface NotificationEntry {
  organizationId: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  link?: string;
}

/**
 * Creates a notification for a specific user.
 * Non-blocking: errors are logged but never propagated.
 */
export async function createNotification(entry: NotificationEntry): Promise<void> {
  // 1. Check user'\''s notification preference for this type
  try {
    const [pref] = await db
      .select({ optIn: notificationPreferencesTable.optIn })
      .from(notificationPreferencesTable)
      .where(and(
        eq(notificationPreferencesTable.organizationId, entry.organizationId),
        eq(notificationPreferencesTable.userId, entry.userId),
        eq(notificationPreferencesTable.type, entry.type),
      ));

    // If a preference row exists and optIn is false, skip
    if (pref && !pref.optIn) {
      logger.debug({ userId: entry.userId, type: entry.type }, "Notification skipped - user opted out");
      return;
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to check notification preference, proceeding anyway");
  }

  // 2. Create the notification
  try {
    const [saved] = await db.insert(notificationsTable).values({
      organizationId: entry.organizationId,
      userId: entry.userId,
      title: entry.title,
      message: entry.message,
      type: entry.type,
      link: entry.link ?? null,
    }).returning();

    // 3. Best-effort real-time push via SSE
    if (saved) {
      try {
        sseBroadcaster.send(saved.organizationId, saved.userId, {
          id: saved.id,
          title: saved.title,
          message: saved.message,
          type: saved.type,
          read: saved.read,
          link: saved.link,
          createdAt: saved.createdAt.toISOString(),
        });
      } catch {
        // SSE broadcast is best-effort; never throw
      }
    }
  } catch (error) {
    logger.error({ err: error, userId: entry.userId, type: entry.type }, "Notification creation failed");
  }
}

/**
 * Creates a notification when a task is assigned to a user.
 */
export async function notifyTaskAssigned(
  req: Request,
  taskId: number,
  assigneeId: number,
  taskTitle: string,
  projectId: number,
): Promise<void> {
  const organizationId = (req as any).vetraUser?.organizationId;
  if (!organizationId) return;

  const [project] = await db.select({ name: projectsTable.name }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, organizationId)));

  await createNotification({
    organizationId,
    userId: assigneeId,
    title: "\u0648\u0638\u06cc\u0641\u0647 \u062c\u062f\u06cc\u062f \u0628\u0647 \u0634\u0645\u0627 \u0645\u062d\u0648\u0644 \u0634\u062f",
    message: "\u0648\u0638\u06cc\u0641\u0647 \u201c" + taskTitle + "\u201d" + (project ? " \u062f\u0631 \u067e\u0631\u0648\u0698\u0647 \u201c" + project.name + "\u201d" : "") + " \u0628\u0647 \u0634\u0645\u0627 \u0645\u062d\u0648\u0644 \u0634\u062f",
    type: "task_assigned",
    link: "/tasks/" + taskId,
  });
}

/**
 * Creates a notification for workflow decision events (approve/reject/revision).
 */
export async function notifyWorkflowDecision(
  organizationId: number,
  userId: number,
  entityTitle: string,
  decision: "approved" | "rejected" | "revision_requested",
  workflowRunId: number,
): Promise<void> {
  const typeMap = {
    approved: "workflow_approved",
    rejected: "workflow_rejected",
    revision_requested: "workflow_revision_requested",
  };
  const titleMap: Record<string, string> = {
    approved: "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0634\u0645\u0627 \u062a\u0623\u06cc\u06cc\u062f \u0634\u062f",
    rejected: "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0634\u0645\u0627 \u0631\u062f \u0634\u062f",
    revision_requested: "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0634\u0645\u0627 \u0646\u06cc\u0627\u0632 \u0628\u0647 \u0628\u0627\u0632\u0628\u06cc\u0646\u06cc \u062f\u0627\u0631\u062f",
  };

  await createNotification({
    organizationId,
    userId,
    title: titleMap[decision] ?? "\u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u06af\u0631\u062f\u0634 \u06a9\u0627\u0631",
    message: "\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u201c" + entityTitle + "\u201d \u0628\u0627 \u0648\u0636\u0639\u06cc\u062a \u201c" + decision + "\u201d \u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f",
    type: typeMap[decision] ?? "workflow_update",
    link: "/workflows/runs/" + workflowRunId,
  });
}

/**
 * Creates a notification when a document is uploaded to a project.
 */
export async function notifyDocumentUploaded(
  req: Request,
  documentName: string,
  projectId: number,
  documentId: number,
): Promise<void> {
  const organizationId = (req as any).vetraUser?.organizationId;
  if (!organizationId) return;

  // Notify all project members
  const members = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.organizationId, organizationId));

  const [project] = await db.select({ name: projectsTable.name }).from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, organizationId)));

  for (const member of members) {
    if (member.id === (req as any).vetraUser?.id) continue; // skip uploader
    await createNotification({
      organizationId,
      userId: member.id,
      title: "\u0633\u0646\u062f \u062c\u062f\u06cc\u062f \u0622\u067e\u0644\u0648\u062f \u0634\u062f",
      message: "\u0633\u0646\u062f \u201c" + documentName + "\u201d" + (project ? " \u062f\u0631 \u067e\u0631\u0648\u0698\u0647 \u201c" + project.name + "\u201d" : "") + " \u0622\u067e\u0644\u0648\u062f \u0634\u062f",
      type: "document_uploaded",
      link: "/documents/" + documentId,
    });
  }
}

// Notification type constants
export const NotificationType = {
  TASK_ASSIGNED: "task_assigned",
  WORKFLOW_APPROVED: "workflow_approved",
  WORKFLOW_REJECTED: "workflow_rejected",
  WORKFLOW_REVISION_REQUESTED: "workflow_revision_requested",
  DOCUMENT_UPLOADED: "document_uploaded",
  PAYROLL_PAID: "payroll_paid",
} as const;
