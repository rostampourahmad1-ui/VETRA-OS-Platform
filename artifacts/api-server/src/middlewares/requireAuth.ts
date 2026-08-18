import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

/**
 * VETRA-SEC-03: requireAuth Middleware
 *
 * Authenticates the request using Clerk's getAuth().
 * Rejects requests that:
 * - Have no Clerk userId (unauthenticated)
 * - Have no orgId in the Clerk session (unprovisioned / no tenant)
 *
 * This ensures only users with a valid Clerk session AND an
 * assigned organization can access protected routes.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // VETRA-SEC-03: Reject tokens without orgId
  if (!auth.orgId) {
    res.status(403).json({ error: "Forbidden: no organization assigned" });
    return;
  }
  next();
}
