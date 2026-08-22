import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, permissionsTable, rolePermissionsTable, rolesTable, userRolesTable } from "@workspace/db";

/** Resolves a permission against the authenticated user's roles in one tenant. */
export async function hasPermission(userId: number, organizationId: number, permission: string): Promise<boolean> {
  const [allowed] = await db.select({ permissionId: permissionsTable.id })
    .from(userRolesTable)
    .innerJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
    .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, rolesTable.id))
    .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissionsTable.permissionId))
    .where(and(
      eq(userRolesTable.userId, userId),
      eq(rolesTable.organizationId, organizationId),
      eq(permissionsTable.key, permission),
    ));
  return Boolean(allowed);
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.vetraUser) {
        res.status(401).json({ error: "Tenant context is required" });
        return;
      }
      if (!(await hasPermission(req.vetraUser.id, req.vetraUser.organizationId, permission))) {
        res.status(403).json({ error: "Forbidden", permission });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
