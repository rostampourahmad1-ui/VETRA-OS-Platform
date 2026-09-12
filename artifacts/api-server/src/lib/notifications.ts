import type { Request } from "express";
import { db, notificationsTable, notificationPreferencesTable, usersTable, projectsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { sseBroadcaster } from "./sseBroadcaster";
import { logger } from "./logger";
import { sendMail } from "./email/provider";

/**
 * VETRA-PH1: Notification Trigger Service
 * Creates notifications when business events occur + sends email if enabled.
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
 * Sends email if preferences allow and EMAIL_ENABLED=true.
 */
export async function createNotification(entry: NotificationEntry): Promise<void> {
  // 1. Check user's notification preference for this type
  let optedIn = true;
  try {
    const [pref] = await db
      .select({ optIn: notificationPreferencesTable.optIn })
      .from(notificationPreferencesTable)
      .where(and(
        eq(notificationPreferencesTable.organizationId, entry.organizationId),
        eq(notificationPreferencesTable.userId, entry.userId),
        eq(notificationPreferencesTable.type, entry.type),
      ));

    if (pref && !pref.optIn) {
      logger.debug({ userId: entry.userId, type: entry.type }, "Notification skipped - user opted out");
      optedIn = false;
      return;
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to check notification preference, proceeding anyway");
  }

  // 2. Create the notification
  let saved: typeof notificationsTable.$inferSelect | null = null;
  try {
    [saved] = await db.insert(notificationsTable).values({
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

  // 4. Fire-and-forget email delivery
  if (saved && optedIn) {
    setImmediate(async () => {
      try {
        const [user] = await db.select({ email: usersTable.email }).from(usersTable)
          .where(eq(usersTable.id, entry.userId));
        if (!user?.email) return;

        const baseUrl = process.env.BASE_URL || "http://localhost:3000";
        const fullLink = entry.link?.startsWith("http") ? entry.link : `${baseUrl}${entry.link ?? ""}`;

        const status = await sendMail({
          to: user.email,
          subject: entry.title,
          text: `${entry.message}\n\nمشاهده: ${fullLink}`,
          html: `<p>${entry.message}</p><p><a href="${fullLink}">مشاهده</a></p>`,
        });

        if (saved?.id) {
          await db.update(notificationsTable).set({
            emailSentAt: status === "sent" ? new Date() : null,
            emailStatus: status,
          }).where(eq(notificationsTable.id, saved.id));
        }
      } catch (error) {
        logger.error({ err: error, notificationId: saved?.id }, "Email send failed");
      }
    });
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
    title: "وظیفه جدید به شما محول شد",
    message: "وظیفه \"" + taskTitle + "\"" + (project ? " در پروژه \"" + project.name + "\"" : "") + " به شما محول شد",
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
    approved: "درخواست شما تأیید شد",
    rejected: "درخواست شما رد شد",
    revision_requested: "درخواست شما نیاز به بازبینی دارد",
  };

  await createNotification({
    organizationId,
    userId,
    title: titleMap[decision] ?? "به‌روزرسانی گردش کار",
    message: "درخواست \"" + entityTitle + "\" با وضعیت \"" + decision + "\" به‌روزرسانی شد",
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
      title: "سند جدید آپلود شد",
      message: "سند \"" + documentName + "\"" + (project ? " در پروژه \"" + project.name + "\"" : "") + " آپلود شد",
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
  LOW_STOCK: "low_stock",
  WORKFLOW_ESCALATED: "workflow_escalated",
  INVOICE_DUE: "invoice_due",
} as const;
