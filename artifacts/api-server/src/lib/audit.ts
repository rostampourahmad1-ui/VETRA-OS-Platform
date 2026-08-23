import type { Request } from "express";
import { auditLogsTable, withOrganizationDatabase } from "@workspace/db";
import type { AuditActionType } from "@workspace/db";
import { logger } from "./logger";

/**
 * VETRA-SEC-04: Audit Service
 *
 * Centralized audit logging for all sensitive operations.
 * All writes are fire-and-forget (non-blocking) to avoid
 * impacting response times. Failures are logged but never
 * thrown to the caller.
 */

export interface AuditEntry {
  action: AuditActionType | string;
  resource: string;
  resourceId?: string | number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId: number;
  actorId?: number;
  actorClerkId?: string;
}

/**
 * Writes an audit log entry to the database.
 * Non-blocking: errors are logged but never propagated.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await withOrganizationDatabase(entry.organizationId, async (database) => {
      await database.insert(auditLogsTable).values({
        organizationId: entry.organizationId,
        actorId: entry.actorId ?? null,
        actorClerkId: entry.actorClerkId ?? null,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId != null ? String(entry.resourceId) : null,
        oldValues: entry.oldValues ?? null,
        newValues: entry.newValues ?? null,
        metadata: entry.metadata ?? null,
        ipAddress: null,
        userAgent: null,
      });
    });
  } catch (error) {
    logger.error({ err: error, auditAction: entry.action }, "Audit log write failed");
  }
}

/**
 * Extracts audit context from an Express request.
 * Returns null if no authenticated user context is available.
 */
export function auditContextFromRequest(req: Request): {
  organizationId: number;
  actorId?: number;
  actorClerkId?: string;
} | null {
  const vetraUser = (req as any).vetraUser;
  if (!vetraUser?.organizationId) return null;
  return {
    organizationId: vetraUser.organizationId,
    actorId: vetraUser.id,
    actorClerkId: vetraUser.clerkUserId ?? undefined,
  };
}

/**
 * Fire-and-forget audit log writer.
 * Does not await the database write - failures are silently logged.
 */
export function audit(
  req: Request,
  action: AuditActionType | string,
  resource: string,
  opts?: {
    resourceId?: string | number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): void {
  const ctx = auditContextFromRequest(req);
  if (!ctx) {
    logger.warn({ action, resource }, "Audit skipped: no tenant context");
    return;
  }

  writeAuditLog({
    action,
    resource,
    resourceId: opts?.resourceId,
    oldValues: opts?.oldValues,
    newValues: opts?.newValues,
    metadata: opts?.metadata,
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    actorClerkId: ctx.actorClerkId,
  });
}

/**
 * Audit for cross-tenant access attempts.
 * This is a P0 security event and must always be logged.
 */
export async function auditCrossTenantAttempt(
  organizationId: number,
  actorId: number | undefined,
  targetResource: string,
  targetResourceId: string | number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await withOrganizationDatabase(organizationId, async (database) => {
      await database.insert(auditLogsTable).values({
        organizationId,
        actorId: actorId ?? null,
        action: "security.cross_tenant_attempt",
        resource: targetResource,
        resourceId: String(targetResourceId),
        metadata: metadata ?? null,
      });
    });
    logger.warn(
      { organizationId, actorId, targetResource, targetResourceId },
      "CROSS_TENANT_ATTEMPT: Unauthorized cross-tenant access blocked",
    );
  } catch (error) {
    logger.error({ err: error }, "Failed to write cross-tenant audit log");
  }
}
