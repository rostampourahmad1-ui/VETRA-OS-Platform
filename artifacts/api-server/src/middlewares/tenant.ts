import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, usersTable, projectsTable, setOrganizationContext } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      vetraUser?: { id: number; organizationId: number; role: string; clerkUserId?: string | null };
      organizationId?: number;
    }
  }
}

/**
 * VETRA-SEC-03: attachTenant Middleware
 *
 * Resolves the VETRA user from the database using the Clerk userId.
 * Only processes users marked as active.
 * Rejects with 403 if the Clerk user is not mapped to a VETRA organization.
 *
 * Security: organizationId is always derived from the database, never
 * from the client. This prevents tenant-ID spoofing.
 */
export async function attachTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.vetraUser) {
      req.organizationId = req.vetraUser.organizationId;
      // VETRA-SEC-05: Set RLS context for database session
      await setOrganizationContext(req.vetraUser.organizationId);
      next();
      return;
    }
    const clerkUserId = getAuth(req)?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // VETRA-SEC-03: Also check Clerk orgId for additional safety
    const clerkOrgId = getAuth(req)?.orgId;
    if (!clerkOrgId) {
      res.status(403).json({ error: "Forbidden: no organization assigned in session" });
      return;
    }
    const [user] = await db.select({ id: usersTable.id, organizationId: usersTable.organizationId, role: usersTable.role, clerkUserId: usersTable.clerkUserId })
      .from(usersTable).where(and(eq(usersTable.clerkUserId, clerkUserId), eq(usersTable.active, true)));
    if (!user) {
      res.status(403).json({ error: "Authenticated user is not mapped to a VETRA organization" });
      return;
    }
    req.vetraUser = user;
    req.organizationId = user.organizationId;
    // VETRA-SEC-05: Set RLS context for database session
    await setOrganizationContext(user.organizationId);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * VETRA-SEC-03: tenantId
 *
 * Returns the organizationId from the request context.
 * Throws if the tenant context is missing - this is a
 * programming error, not a runtime auth failure.
 * Use `requireTenant` middleware for request-level enforcement.
 */
export function tenantId(req: Request): number {
  if (!req.organizationId) throw new Error("Tenant context is missing");
  return req.organizationId;
}

/**
 * VETRA-SEC-03: requireTenant Middleware
 *
 * Ensures that organizationId is present on the request.
 * Returns 403 if the tenant context is not established.
 * Use this as a guard before operations that require tenant isolation.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.organizationId) {
    res.status(403).json({ error: "Forbidden: tenant context is required" });
    return;
  }
  next();
}

export async function ownedProject(req: Request, projectId: number) {
  const [project] = await db.select().from(projectsTable).where(and(
    eq(projectsTable.id, projectId),
    eq(projectsTable.organizationId, tenantId(req)),
  ));
  return project;
}
