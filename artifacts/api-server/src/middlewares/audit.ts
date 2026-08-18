import type { Request, Response, NextFunction } from "express";
import { audit } from "../lib/audit";

/**
 * VETRA-SEC-04: Audit Middleware
 *
 * Middleware factory that logs an audit entry for every
 * request that passes through it. Designed to be attached
 * to specific routes or route groups.
 *
 * Usage:
 *   router.post("/users", auditMiddleware("user.create", "user"), handler);
 */

export function auditMiddleware(
  action: string,
  resource: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    audit(req, action, resource, {
      resourceId: typeof req.params?.id === "string" ? req.params.id : undefined,
      metadata: {
        method: req.method,
        path: req.originalUrl?.split("?")[0],
      },
    });
    next();
  };
}

/**
 * Audit middleware that captures the response body for audit.
 * Wraps res.json to capture the response data for audit logging.
 */
export function auditWithResponse(
  action: string,
  resource: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      audit(req, action, resource, {
        resourceId: typeof req.params?.id === "string" ? req.params.id : undefined,
        newValues: typeof body === "object" && body !== null ? (body as Record<string, unknown>) : undefined,
        metadata: {
          method: req.method,
          path: req.originalUrl?.split("?")[0],
          statusCode: res.statusCode,
        },
      });
      return originalJson(body);
    };
    next();
  };
}
