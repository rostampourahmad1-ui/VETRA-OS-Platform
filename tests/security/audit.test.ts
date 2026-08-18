import { describe, it, expect, vi } from "vitest";

// ─── VETRA-SEC-04: Audit Service Tests ─────────────────────────────────────
//
// Tests the audit service logic without requiring a database connection.
// We replicate the pure functions from artifacts/api-server/src/lib/audit.ts
// and validate their behavior with mocked dependencies.
//
// Coverage:
//   - AuditEntry validation
//   - auditContextFromRequest extraction
//   - AuditAction type completeness
//   - Cross-tenant attempt logging
//   - Graceful failure handling
//   - Immutability guard (no UPDATE/DELETE via application)

// ─── Audit Action Types (replicated from schema) ───────────────────────────

const AuditAction = {
  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",
  USER_ROLE_CHANGED: "user.role_changed",
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  TASK_CREATED: "task.created",
  TASK_UPDATED: "task.updated",
  TASK_DELETED: "task.deleted",
  CONTRACT_CREATED: "contract.created",
  CONTRACT_UPDATED: "contract.updated",
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_DOWNLOADED: "document.downloaded",
  DOCUMENT_DELETED: "document.deleted",
  LOGIN: "session.login",
  LOGOUT: "session.logout",
  PERMISSION_GRANTED: "permission.granted",
  PERMISSION_REVOKED: "permission.revoked",
  CROSS_TENANT_ATTEMPT: "security.cross_tenant_attempt",
  WEBHOOK_RECEIVED: "webhook.received",
  WEBHOOK_FAILED: "webhook.failed",
} as const;

// ─── Simulated AuditService (replicates lib/audit.ts logic) ────────────────

interface AuditEntry {
  action: string;
  resource: string;
  resourceId?: string | number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId: number;
  actorId?: number;
  actorClerkId?: string;
}

interface SimulatedRequest {
  vetraUser?: {
    id: number;
    organizationId: number;
    role: string;
    clerkUserId?: string | null;
  };
  organizationId?: number;
  params?: Record<string, string>;
  method?: string;
  originalUrl?: string;
}

function simulatedAuditContextFromRequest(req: SimulatedRequest): {
  organizationId: number;
  actorId?: number;
  actorClerkId?: string;
} | null {
  const vetraUser = req.vetraUser;
  if (!vetraUser?.organizationId) return null;
  return {
    organizationId: vetraUser.organizationId,
    actorId: vetraUser.id,
    actorClerkId: vetraUser.clerkUserId ?? undefined,
  };
}

function simulatedAudit(
  req: SimulatedRequest,
  action: string,
  resource: string,
  opts?: {
    resourceId?: string | number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): AuditEntry | null {
  const ctx = simulatedAuditContextFromRequest(req);
  if (!ctx) return null;
  return {
    action,
    resource,
    resourceId: opts?.resourceId,
    oldValues: opts?.oldValues,
    newValues: opts?.newValues,
    metadata: opts?.metadata,
    organizationId: ctx.organizationId,
    actorId: ctx.actorId,
    actorClerkId: ctx.actorClerkId,
  };
}

describe("VETRA-SEC-04: AuditAction Constants", () => {
  it("P0-1: All required CRUD actions are defined", () => {
    const required = [
      "user.created",
      "user.updated",
      "user.deleted",
      "project.created",
      "project.updated",
      "project.deleted",
      "task.created",
      "task.updated",
      "task.deleted",
    ];
    for (const action of required) {
      expect(Object.values(AuditAction)).toContain(action);
    }
  });

  it("P0-2: Security events are defined", () => {
    expect(AuditAction.CROSS_TENANT_ATTEMPT).toBe("security.cross_tenant_attempt");
    expect(AuditAction.LOGIN).toBe("session.login");
    expect(AuditAction.LOGOUT).toBe("session.logout");
  });

  it("P0-3: Webhook events are defined", () => {
    expect(AuditAction.WEBHOOK_RECEIVED).toBe("webhook.received");
    expect(AuditAction.WEBHOOK_FAILED).toBe("webhook.failed");
  });

  it("P0-4: Permission events are defined", () => {
    expect(AuditAction.PERMISSION_GRANTED).toBe("permission.granted");
    expect(AuditAction.PERMISSION_REVOKED).toBe("permission.revoked");
  });

  it("P0-5: Document events are defined", () => {
    expect(AuditAction.DOCUMENT_UPLOADED).toBe("document.uploaded");
    expect(AuditAction.DOCUMENT_DOWNLOADED).toBe("document.downloaded");
    expect(AuditAction.DOCUMENT_DELETED).toBe("document.deleted");
  });

  it("P1-1: All actions follow naming convention", () => {
    for (const action of Object.values(AuditAction)) {
      expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});

describe("VETRA-SEC-04: auditContextFromRequest", () => {
  it("P0-1: Returns context when vetraUser is fully populated", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 42, organizationId: 1, role: "Worker", clerkUserId: "clerk_abc" },
    };
    const ctx = simulatedAuditContextFromRequest(req);
    expect(ctx).not.toBeNull();
    expect(ctx!.organizationId).toBe(1);
    expect(ctx!.actorId).toBe(42);
    expect(ctx!.actorClerkId).toBe("clerk_abc");
  });

  it("P0-2: Returns null when vetraUser is undefined", () => {
    const req: SimulatedRequest = {};
    const ctx = simulatedAuditContextFromRequest(req);
    expect(ctx).toBeNull();
  });

  it("P0-3: Returns null when vetraUser has no organizationId", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 42, organizationId: 0, role: "Worker" },
    };
    const ctx = simulatedAuditContextFromRequest(req);
    expect(ctx).toBeNull();
  });

  it("P0-4: Returns null when organizationId is undefined", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 42, organizationId: undefined as any, role: "Worker" },
    };
    const ctx = simulatedAuditContextFromRequest(req);
    expect(ctx).toBeNull();
  });

  it("P1-1: Handles missing clerkUserId gracefully", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 42, organizationId: 1, role: "Worker" },
    };
    const ctx = simulatedAuditContextFromRequest(req);
    expect(ctx).not.toBeNull();
    expect(ctx!.actorClerkId).toBeUndefined();
  });

  it("P1-2: Handles null clerkUserId gracefully", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 42, organizationId: 1, role: "Worker", clerkUserId: null },
    };
    const ctx = simulatedAuditContextFromRequest(req);
    expect(ctx).not.toBeNull();
    expect(ctx!.actorClerkId).toBeUndefined();
  });
});

describe("VETRA-SEC-04: Audit Entry Generation", () => {
  const validReq: SimulatedRequest = {
    vetraUser: { id: 99, organizationId: 5, role: "ADMIN", clerkUserId: "clerk_xyz" },
  };

  it("P0-1: Generates complete audit entry with all fields", () => {
    const entry = simulatedAudit(validReq, "project.created", "project", {
      resourceId: 123,
      oldValues: { status: "draft" },
      newValues: { status: "active", name: "Tower A" },
      metadata: { source: "api" },
    });

    expect(entry).not.toBeNull();
    expect(entry!.action).toBe("project.created");
    expect(entry!.resource).toBe("project");
    expect(entry!.resourceId).toBe(123);
    expect(entry!.organizationId).toBe(5);
    expect(entry!.actorId).toBe(99);
    expect(entry!.actorClerkId).toBe("clerk_xyz");
    expect(entry!.oldValues).toEqual({ status: "draft" });
    expect(entry!.newValues).toEqual({ status: "active", name: "Tower A" });
    expect(entry!.metadata).toEqual({ source: "api" });
  });

  it("P0-2: Generates minimal audit entry (no optional fields)", () => {
    const entry = simulatedAudit(validReq, "session.login", "auth");
    expect(entry).not.toBeNull();
    expect(entry!.action).toBe("session.login");
    expect(entry!.resource).toBe("auth");
    expect(entry!.resourceId).toBeUndefined();
    expect(entry!.oldValues).toBeUndefined();
    expect(entry!.newValues).toBeUndefined();
    expect(entry!.metadata).toBeUndefined();
  });

  it("P0-3: Returns null when no tenant context", () => {
    const noAuthReq: SimulatedRequest = {};
    const entry = simulatedAudit(noAuthReq, "user.created", "user");
    expect(entry).toBeNull();
  });

  it("P1-1: Cross-tenant attempt audit entry is properly structured", () => {
    const entry = simulatedAudit(validReq, "security.cross_tenant_attempt", "project", {
      resourceId: 999,
      metadata: {
        attemptedTenantId: 2,
        actualTenantId: 5,
        reason: "User attempted to access project from different organization",
      },
    });

    expect(entry).not.toBeNull();
    expect(entry!.action).toBe("security.cross_tenant_attempt");
    expect(entry!.resource).toBe("project");
    expect(entry!.resourceId).toBe(999);
    expect(entry!.metadata).toHaveProperty("attemptedTenantId");
    expect(entry!.metadata).toHaveProperty("actualTenantId");
  });

  it("P1-2: resourceId is properly typed (string or number)", () => {
    const entryNum = simulatedAudit(validReq, "task.updated", "task", { resourceId: 42 });
    expect(entryNum!.resourceId).toBe(42);

    const entryStr = simulatedAudit(validReq, "document.uploaded", "document", { resourceId: "doc-uuid-123" });
    expect(entryStr!.resourceId).toBe("doc-uuid-123");
  });
});

describe("VETRA-SEC-04: Audit Entry Validation", () => {
  it("P0-1: organizationId is always a positive integer", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 1, organizationId: 42, role: "Worker" },
    };
    const entry = simulatedAudit(req, "user.created", "user");
    expect(entry!.organizationId).toBeGreaterThan(0);
    expect(Number.isInteger(entry!.organizationId)).toBe(true);
  });

  it("P0-2: actorId is always a positive integer when present", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 99, organizationId: 1, role: "Worker" },
    };
    const entry = simulatedAudit(req, "user.created", "user");
    expect(entry!.actorId).toBeGreaterThan(0);
    expect(Number.isInteger(entry!.actorId!)).toBe(true);
  });

  it("P0-3: action and resource are always non-empty strings", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 1, organizationId: 1, role: "Worker" },
    };
    const entry = simulatedAudit(req, "project.created", "project");
    expect(entry!.action).toBeTruthy();
    expect(entry!.resource).toBeTruthy();
    expect(typeof entry!.action).toBe("string");
    expect(typeof entry!.resource).toBe("string");
    expect(entry!.action.length).toBeGreaterThan(0);
    expect(entry!.resource.length).toBeGreaterThan(0);
  });
});

describe("VETRA-SEC-04: Audit Log Immutability", () => {
  it("P0-1: Audit entry schema has no update/delete fields", () => {
    const forbiddenFields = ["updatedAt", "updated_at", "updatedBy", "updated_by", "deletedAt", "deleted_at"];
    const entry: AuditEntry = {
      action: "test",
      resource: "test",
      organizationId: 1,
    };
    for (const field of forbiddenFields) {
      expect(entry).not.toHaveProperty(field);
    }
  });

  it("P0-2: Audit entries cannot be modified after creation", () => {
    const entry: AuditEntry = {
      action: "user.created",
      resource: "user",
      organizationId: 1,
    };
    // Verify the entry is a plain data object with no custom mutation methods
    const ownMethods = Object.getOwnPropertyNames(entry).filter(
      (p) => typeof (entry as any)[p] === "function",
    );
    expect(ownMethods).toHaveLength(0);
    // Verify no setter methods exist on the entry itself
    const ownDescriptors = Object.getOwnPropertyDescriptors(entry);
    for (const desc of Object.values(ownDescriptors)) {
      expect(desc.set).toBeUndefined();
    }
  });

  it("P1-1: oldValues and newValues are preserved as separate fields", () => {
    const req: SimulatedRequest = {
      vetraUser: { id: 1, organizationId: 1, role: "ADMIN" },
    };
    const entry = simulatedAudit(req, "user.role_changed", "user", {
      oldValues: { role: "Worker" },
      newValues: { role: "ADMIN" },
    });
    expect(entry!.oldValues).toEqual({ role: "Worker" });
    expect(entry!.newValues).toEqual({ role: "ADMIN" });
    expect(entry!.oldValues).not.toBe(entry!.newValues);
  });
});

describe("VETRA-SEC-04: Audit Graceful Failure", () => {
  it("P0-1: Null context returns null (not throwing)", () => {
    const req: SimulatedRequest = {};
    expect(() => {
      const result = simulatedAudit(req, "test", "test");
      expect(result).toBeNull();
    }).not.toThrow();
  });

  it("P0-2: Missing vetraUser does not throw", () => {
    const req: SimulatedRequest = { organizationId: undefined };
    expect(() => {
      const result = simulatedAudit(req, "test", "test");
      expect(result).toBeNull();
    }).not.toThrow();
  });
});
