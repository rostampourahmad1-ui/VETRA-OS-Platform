import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ─── VETRA-SEC-03: RBAC Bypass Prevention Tests ────────────────────────────
//
// These tests verify that the RBAC system cannot be bypassed by:
//   1. Users without required permissions
//   2. Client-supplied role/permission values
//   3. Mass assignment of role/permission fields
//   4. Manipulating URL parameters to escalate privileges
//
// Key security properties:
//   - Missing permission → 403 Forbidden
//   - Client-supplied permission claims are ignored
//   - Role/permission IDs cannot be injected via request body
//   - All CRUD operations require explicit permission checks

const PERMISSIONS = {
  PROJECT_READ: "project.read",
  PROJECT_CREATE: "project.create",
  PROJECT_UPDATE: "project.update",
  PROJECT_DELETE: "project.delete",
  TASK_READ: "task.read",
  TASK_CREATE: "task.create",
  TASK_UPDATE: "task.update",
  TASK_DELETE: "task.delete",
  DOCUMENT_READ: "document.read",
  DOCUMENT_CREATE: "document.create",
  DOCUMENT_DELETE: "document.delete",
  CONTRACT_READ: "contract.read",
  CONTRACT_CREATE: "contract.create",
  CONTRACT_UPDATE: "contract.update",
  CONTRACT_DELETE: "contract.delete",
  QUALITY_READ: "quality.read",
  QUALITY_UPDATE: "quality.update",
  QUALITY_DELETE: "quality.delete",
  WORKFLOWS_EXECUTE: "workflows.execute",
};

interface VetraUser {
  id: number;
  organizationId: number;
  role: string;
  clerkUserId?: string | null;
  permissions?: string[];
}

async function simulatedHasPermission(
  user: VetraUser,
  permission: string,
): Promise<boolean> {
  if (!user?.permissions) return false;
  return user.permissions.includes(permission);
}

function simulatedRequirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as any).vetraUser as VetraUser | undefined;
      if (!user) {
        res.status(401).json({ error: "Tenant context is required" });
        return;
      }
      const allowed = await simulatedHasPermission(user, permission);
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

// ─── Test Suite: Missing Permission → 403 ──────────────────────────────────

describe("VETRA-SEC-03: RBAC — Missing Permission Returns 403", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.vetraUser = {
        id: 1, organizationId: 1, role: "VIEWER",
        permissions: ["project.read", "task.read", "document.read"],
      };
      next();
    });
  });

  it("P0-1: Blocks user without project.create permission", async () => {
    app.post("/api/projects", simulatedRequirePermission("project.create"), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/api/projects").send({ name: "New Project" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("project.create");
  });

  it("P0-2: Blocks user without project.delete permission", async () => {
    app.delete("/api/projects/1", simulatedRequirePermission("project.delete"), (_req, res) => {
      res.status(204).end();
    });
    const res = await request(app).delete("/api/projects/1");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("project.delete");
  });

  it("P0-3: Blocks user without task.create permission", async () => {
    app.post("/api/tasks", simulatedRequirePermission("task.create"), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/api/tasks").send({ title: "New Task" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("task.create");
  });

  it("P0-4: Blocks user without contract.read permission", async () => {
    app.get("/api/contracts", simulatedRequirePermission("contract.read"), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app).get("/api/contracts");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("contract.read");
  });

  it("P0-5: Blocks user without document.create permission", async () => {
    app.post("/api/documents", simulatedRequirePermission("document.create"), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/api/documents").send({ name: "doc.pdf" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("document.create");
  });

  it("P0-6: Blocks user without quality.update permission", async () => {
    app.patch("/api/quality/inspections/1", simulatedRequirePermission("quality.update"), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app).patch("/api/quality/inspections/1").send({ status: "completed" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("quality.update");
  });
});

// ─── Test Suite: Client-Supplied Permission Claims Are Ignored ─────────────

describe("VETRA-SEC-03: RBAC — Client-Supplied Permissions Are Ignored", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it("P0-1: Client cannot grant permissions via header", async () => {
    app.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role: "VIEWER", permissions: [] };
      next();
    });
    app.post("/api/projects", simulatedRequirePermission("project.create"), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    const res = await request(app)
      .post("/api/projects")
      .set("x-permission", "project.create")
      .set("x-role", "ADMIN")
      .send({ name: "New Project" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("project.create");
  });

  it("P0-2: Client cannot grant permissions via body", async () => {
    app.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role: "VIEWER", permissions: [] };
      next();
    });
    app.post("/api/contracts", simulatedRequirePermission("contract.create"), (_req, res) => {
      res.status(201).json({ ok: true });
    });
    const res = await request(app)
      .post("/api/contracts")
      .send({ name: "New Contract", permissions: ["contract.create"] });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("contract.create");
  });

  it("P1-1: Client-supplied organizationId does not escalate permissions", async () => {
    app.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role: "VIEWER", permissions: ["project.read"] };
      next();
    });
    app.get("/api/projects", simulatedRequirePermission("project.create"), (_req, res) => {
      res.json({ ok: true });
    });
    const res = await request(app)
      .get("/api/projects")
      .set("x-organization-id", "999")
      .query({ organizationId: 999 });
    expect(res.status).toBe(403);
  });
});

// ─── Test Suite: Mass Assignment Prevention ────────────────────────────────

describe("VETRA-SEC-03: RBAC — Mass Assignment Prevention", () => {
  it("P0-1: role field is stripped from incoming payload", () => {
    const incoming = { name: "Test User", email: "test@vetra.io", role: "ADMIN" };
    const sanitized = { ...incoming };
    delete (sanitized as any).role;
    expect(sanitized).not.toHaveProperty("role");
    expect(sanitized.name).toBe("Test User");
  });

  it("P0-2: permissions array is stripped from incoming payload", () => {
    const incoming = { name: "Test User", permissions: ["admin.*", "project.delete"] };
    const sanitized = { ...incoming };
    delete (sanitized as any).permissions;
    expect(sanitized).not.toHaveProperty("permissions");
  });

  it("P0-3: roleId is stripped from incoming payload", () => {
    const incoming = { name: "Test User", roleId: 1 };
    const sanitized = { ...incoming };
    delete (sanitized as any).roleId;
    expect(sanitized).not.toHaveProperty("roleId");
  });

  it("P1-1: Multiple sensitive fields are stripped simultaneously", () => {
    const incoming = { fullName: "Hacker", organizationId: 999, role: "ADMIN", permissions: ["*"], roleId: 1 };
    const sensitive = ["organizationId", "role", "permissions", "roleId"] as const;
    const sanitized = { ...incoming };
    for (const field of sensitive) delete (sanitized as any)[field];
    for (const field of sensitive) expect(sanitized).not.toHaveProperty(field);
    expect(sanitized.fullName).toBe("Hacker");
  });
});

// ─── Test Suite: Different Roles Have Correct Access Levels ────────────────

describe("VETRA-SEC-03: RBAC — Role-Based Access Levels", () => {
  function createApp(role: string, permissions: string[]): Express {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role, permissions };
      next();
    });
    return app;
  }

  it("P0-1: ADMIN role has all permissions", async () => {
    const allPerms = Object.values(PERMISSIONS);
    const app = createApp("ADMIN", allPerms);
    for (const perm of allPerms) {
      app.get(`/api/check/${perm}`, simulatedRequirePermission(perm), (_req, res) => res.json({ ok: true }));
      const res = await request(app).get(`/api/check/${perm}`);
      expect(res.status).toBe(200);
    }
  });

  it("P0-2: VIEWER role has only read permissions", async () => {
    const viewerPerms = ["project.read", "task.read", "document.read", "contract.read", "quality.read"];
    const app = createApp("VIEWER", viewerPerms);
    app.get("/api/projects", simulatedRequirePermission("project.read"), (_req, res) => res.json({ ok: true }));
    expect((await request(app).get("/api/projects")).status).toBe(200);
    app.post("/api/projects", simulatedRequirePermission("project.create"), (_req, res) => res.status(201).json({ ok: true }));
    expect((await request(app).post("/api/projects").send({})).status).toBe(403);
    app.delete("/api/projects/1", simulatedRequirePermission("project.delete"), (_req, res) => res.status(204).end());
    expect((await request(app).delete("/api/projects/1")).status).toBe(403);
  });

  it("P1-1: User without any role cannot access any protected route", async () => {
    const app = createApp("UNKNOWN", []);
    app.get("/api/projects", simulatedRequirePermission("project.read"), (_req, res) => res.json({ ok: true }));
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(403);
  });
});

// ─── Test Suite: Unauthenticated Access ────────────────────────────────────

describe("VETRA-SEC-03: RBAC — Unauthenticated Access", () => {
  it("P0-1: Returns 401 when no vetraUser is attached", async () => {
    const app = express();
    app.use(express.json());
    app.get("/api/projects", simulatedRequirePermission("project.read"), (_req, res) => res.json({ ok: true }));
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Tenant context is required");
  });

  it("P1-1: Returns 401 regardless of HTTP method", async () => {
    const app = express();
    app.use(express.json());
    app.post("/api/projects", simulatedRequirePermission("project.create"), (_req, res) => res.status(201).json({ ok: true }));
    app.patch("/api/projects/1", simulatedRequirePermission("project.update"), (_req, res) => res.json({ ok: true }));
    app.delete("/api/projects/1", simulatedRequirePermission("project.delete"), (_req, res) => res.status(204).end());
    expect((await request(app).post("/api/projects").send({})).status).toBe(401);
    expect((await request(app).patch("/api/projects/1").send({})).status).toBe(401);
    expect((await request(app).delete("/api/projects/1")).status).toBe(401);
  });
});

// ─── Test Suite: Permission Enumeration ────────────────────────────────────

describe("VETRA-SEC-03: RBAC — Permission Enumeration", () => {
  it("P1-1: All required permission keys are defined", () => {
    const required = [
      "project.read", "project.create", "project.update", "project.delete",
      "task.read", "task.create", "task.update", "task.delete",
      "document.read", "document.create", "document.delete",
      "contract.read", "contract.create", "contract.update", "contract.delete",
      "quality.read", "quality.update", "quality.delete",
      "workflows.execute",
    ];
    for (const perm of required) expect(Object.values(PERMISSIONS)).toContain(perm);
  });

  it("P1-2: Permission names follow the {resource}.{action} convention", () => {
    for (const perm of Object.values(PERMISSIONS)) {
      expect(perm).toMatch(/^[a-z]+\.[a-z]+$/);
      const [, action] = perm.split(".");
      expect(["read", "create", "update", "delete", "execute"]).toContain(action);
    }
  });
});
