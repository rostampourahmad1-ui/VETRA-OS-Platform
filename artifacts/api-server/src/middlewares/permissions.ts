import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, permissionsTable, rolePermissionsTable, rolesTable, userRolesTable } from "@workspace/db";

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.vetraUser) {
        res.status(401).json({ error: "Tenant context is required" });
        return;
      }
      const [allowed] = await db.select({ permissionId: permissionsTable.id })
        .from(userRolesTable)
        .innerJoin(rolesTable, eq(rolesTable.id, userRolesTable.roleId))
        .innerJoin(rolePermissionsTable, eq(rolePermissionsTable.roleId, rolesTable.id))
        .innerJoin(permissionsTable, eq(permissionsTable.id, rolePermissionsTable.permissionId))
        .where(and(
          eq(userRolesTable.userId, req.vetraUser.id),
          eq(rolesTable.organizationId, req.vetraUser.organizationId),
          eq(permissionsTable.key, permission),
        ));
      if (!allowed) {
        res.status(403).json({ error: "Forbidden", permission });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
