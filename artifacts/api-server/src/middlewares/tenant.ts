import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import {
  createOrganizationDatabaseSession,
  db,
  projectsTable,
  resolveActiveUserByClerkId,
  runWithRequestDatabaseContext,
  type OrganizationDatabaseSession,
} from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      vetraUser?: { id: number; organizationId: number; role: string; clerkUserId?: string | null };
      organizationId?: number;
      organizationDatabaseSession?: OrganizationDatabaseSession;
    }
  }
}

/**
 * VETRA-SEC-03 and VETRA-SEC-06: attachTenant Middleware
 *
 * Resolves an active VETRA user from the authenticated Clerk identity, then
 * checks out one PostgreSQL client for the request. Every downstream `db` call
 * is bound to that client and runs with a transaction-local organization RLS
 * setting. The setting is cleared on COMMIT or ROLLBACK before release.
 */
export async function attachTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let user = req.vetraUser;

    if (!user) {
      const clerkUserId = getAuth(req)?.userId;
      if (!clerkUserId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Require a Clerk organization as an additional session-level guard.
      if (!getAuth(req)?.orgId) {
        res.status(403).json({ error: "Forbidden: no organization assigned in session" });
        return;
      }

      user = await resolveActiveUserByClerkId(clerkUserId);
      if (!user) {
        res.status(403).json({ error: "Authenticated user is not mapped to a VETRA organization" });
        return;
      }
      req.vetraUser = user;
    }

    req.organizationId = user.organizationId;
    const session = await createOrganizationDatabaseSession(user.organizationId);
    req.organizationDatabaseSession = session;
    let closed = false;

    const closeSession = async (commit: boolean): Promise<void> => {
      if (closed) return;
      closed = true;
      await session.close(commit);
    };

    // A normal completed response commits the bounded request transaction.
    res.once("finish", () => {
      void closeSession(res.statusCode < 400).catch(next);
    });
    // An interrupted response must never return the client with tenant context.
    res.once("close", () => {
      if (!res.writableEnded) void closeSession(false).catch(next);
    });

    runWithRequestDatabaseContext(session.db, () => next());
  } catch (error) {
    next(error);
  }
}

/**
 * Returns the organizationId from the request context.
 * Throws if the tenant context is missing: this is a programming error, not a
 * runtime authorization fallback. Use `requireTenant` before protected routes.
 */
export function tenantId(req: Request): number {
  if (!req.organizationId) throw new Error("Tenant context is missing");
  return req.organizationId;
}

/** Ensures a route is executing with an authenticated tenant context. */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.organizationId || !req.organizationDatabaseSession) {
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
