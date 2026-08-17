import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, usersTable, projectsTable } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      vetraUser?: { id: number; organizationId: number; role: string; clerkUserId?: string | null };
      organizationId?: number;
    }
  }
}

export async function attachTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.vetraUser) {
      req.organizationId = req.vetraUser.organizationId;
      next();
      return;
    }
    const clerkUserId = getAuth(req)?.userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Unauthorized" });
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
    next();
  } catch (error) {
    next(error);
  }
}

export function tenantId(req: Request): number {
  if (!req.organizationId) throw new Error("Tenant context is missing");
  return req.organizationId;
}

export async function ownedProject(req: Request, projectId: number) {
  const [project] = await db.select().from(projectsTable).where(and(
    eq(projectsTable.id, projectId),
    eq(projectsTable.organizationId, tenantId(req)),
  ));
  return project;
}
