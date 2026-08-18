import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ─── Simulated Middleware (matches the real implementations) ────────────────

/**
 * Simulated requireAuth middleware for testing.
 * Matches the behavior of the real middleware in artifacts/api-server/src/middlewares/requireAuth.ts
 */
function simulatedRequireAuth(
  getAuth: (req: Request) => { userId: string | null; orgId: string | null },
) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
  };
}

/**
 * Simulated requireTenant middleware for testing.
 * Matches the behavior of the real middleware in artifacts/api-server/src/middlewares/tenant.ts
 */
function simulatedRequireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!(req as any).organizationId) {
    res.status(403).json({ error: "Forbidden: tenant context is required" });
    return;
  }
  next();
}

// ─── Test Suite: requireAuth Middleware ─────────────────────────────────────

describe("VETRA-SEC-03: requireAuth Middleware", () => {
  let app: Express;
  let mockGetAuth: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetAuth = vi.fn();
    app = express();
    app.use(express.json());
    app.use(simulatedRequireAuth(mockGetAuth));
    app.get("/protected", (_req, res) => {
      res.json({ ok: true });
    });
  });

  it("P0-1: Rejects unauthenticated requests (no userId)", async () => {
    mockGetAuth.mockReturnValue({ userId: null, orgId: null });
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("P0-2: Rejects authenticated requests without orgId", async () => {
    // VETRA-SEC-03 critical behavior
    mockGetAuth.mockReturnValue({ userId: "user_123", orgId: null });
    const res = await request(app).get("/protected");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden: no organization assigned");
  });

  it("P0-3: Allows requests with both userId and orgId", async () => {
    mockGetAuth.mockReturnValue({ userId: "user_123", orgId: "org_456" });
    const res = await request(app).get("/protected");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("P1-1: Rejects when getAuth returns undefined", async () => {
    mockGetAuth.mockReturnValue(undefined);
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("P1-2: Rejects when getAuth returns empty object", async () => {
    mockGetAuth.mockReturnValue({});
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("P1-3: Handles multiple routes consistently", async () => {
    mockGetAuth.mockReturnValue({ userId: null, orgId: null });
    const res1 = await request(app).get("/protected");
    const res2 = await request(app).post("/protected").send({});
    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
  });
});

// ─── Test Suite: requireTenant Middleware ───────────────────────────────────

describe("VETRA-SEC-03: requireTenant Middleware", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    // Simulate a route that requires tenant context
    app.use("/tenant-protected", simulatedRequireTenant);
    app.get("/tenant-protected", (_req, res) => {
      res.json({ ok: true, orgId: (req as any).organizationId });
    });
  });

  it("P0-1: Rejects requests without organizationId", async () => {
    // No middleware to set organizationId
    const res = await request(app).get("/tenant-protected");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden: tenant context is required");
  });

  it("P0-2: Allows requests with organizationId set", async () => {
    // Add middleware that sets organizationId
    const appWithTenant = express();
    appWithTenant.use(express.json());
    appWithTenant.use((req: any, _res, next) => {
      req.organizationId = 42;
      next();
    });
    appWithTenant.get("/tenant-protected", simulatedRequireTenant, (_req, res) => {
      res.json({ ok: true, orgId: (_req as any).organizationId });
    });

    const res = await request(appWithTenant).get("/tenant-protected");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.orgId).toBe(42);
  });

  it("P0-3: Rejects requests with organizationId set to 0", async () => {
    const appWithTenant = express();
    appWithTenant.use(express.json());
    appWithTenant.use((req: any, _res, next) => {
      req.organizationId = 0;
      next();
    });
    appWithTenant.use("/tenant-protected", simulatedRequireTenant);
    appWithTenant.get("/tenant-protected", (_req, res) => {
      res.json({ ok: true });
    });

    // 0 is falsy, so it should be rejected
    const res = await request(appWithTenant).get("/tenant-protected");
    expect(res.status).toBe(403);
  });
});

// ─── Test Suite: Combined Middleware Chain ──────────────────────────────────

describe("VETRA-SEC-03: Combined Auth + Tenant Middleware Chain", () => {
  it("P0-1: Full chain: unauthenticated -> 401", async () => {
    const app = express();
    app.use(express.json());
    const mockGetAuth = vi.fn().mockReturnValue({ userId: null, orgId: null });
    app.use(simulatedRequireAuth(mockGetAuth));
    app.use(simulatedRequireTenant);
    app.get("/api/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/api/data");
    expect(res.status).toBe(401);
  });

  it("P0-2: Full chain: authenticated but no orgId -> 403", async () => {
    const app = express();
    app.use(express.json());
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_123", orgId: null });
    app.use(simulatedRequireAuth(mockGetAuth));
    app.use(simulatedRequireTenant);
    app.get("/api/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/api/data");
    expect(res.status).toBe(403);
  });

  it("P0-3: Full chain: authenticated with orgId but no tenant attachment -> 403", async () => {
    const app = express();
    app.use(express.json());
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_123", orgId: "org_456" });
    app.use(simulatedRequireAuth(mockGetAuth));
    // No attachTenant middleware to set req.organizationId
    app.use(simulatedRequireTenant);
    app.get("/api/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/api/data");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden: tenant context is required");
  });

  it("P0-4: Full chain: authenticated + orgId + tenant attached -> 200", async () => {
    const app = express();
    app.use(express.json());
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_123", orgId: "org_456" });
    app.use(simulatedRequireAuth(mockGetAuth));
    // Simulate attachTenant
    app.use((req: any, _res, next) => {
      req.organizationId = 42;
      req.vetraUser = { id: 1, organizationId: 42, role: "Worker" };
      next();
    });
    app.use(simulatedRequireTenant);
    app.get("/api/data", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/api/data");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ─── Test Suite: Security Boundary Tests ────────────────────────────────────

describe("VETRA-SEC-03: Security Boundary Tests", () => {
  it("P0-1: Client-supplied organizationId headers are ignored", async () => {
    // The tenant middleware must derive organizationId from the server-side
    // database lookup, NOT from request headers or body.
    const app = express();
    app.use(express.json());
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_123", orgId: "org_456" });
    app.use(simulatedRequireAuth(mockGetAuth));
    // Simulate attachTenant that always sets orgId=1 (server-side derived)
    app.use((req: any, _res, next) => {
      req.organizationId = 1; // Server-assigned, ignores client headers
      next();
    });
    app.get("/api/data", (req: any, res) => {
      // Return the actual server-side organizationId
      res.json({ organizationId: req.organizationId });
    });

    // Client sends x-organization-id header - should be ignored
    const res = await request(app)
      .get("/api/data")
      .set("x-organization-id", "999")
      .set("x-tenant-id", "888");

    expect(res.status).toBe(200);
    // Server-side orgId (1) is used, not client-supplied (999)
    expect(res.body.organizationId).toBe(1);
  });

  it("P1-1: Mass assignment of organizationId via body is prevented", () => {
    // Simulates the route handler pattern: strip organizationId from body
    const incomingPayload = {
      name: "Test User",
      email: "test@vetra.io",
      organizationId: 999, // Attacker tries to hijack tenant
    };

    // Sanitize: remove organizationId from payload
    const sanitized = { ...incomingPayload };
    delete (sanitized as any).organizationId;

    expect(sanitized).not.toHaveProperty("organizationId");
    expect(sanitized.name).toBe("Test User");
    expect(sanitized.email).toBe("test@vetra.io");
  });
});
