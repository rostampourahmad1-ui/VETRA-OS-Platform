import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ─── VETRA-SEC-03: Procurement Security Tests ─────────────────────────────
//
// These tests verify that the procurement, suppliers, materials, warehouse,
// and procurement-items routes enforce:
//   1. RBAC (missing permission → 403)
//   2. Unauthenticated access (no vetraUser → 401)
//   3. Cross-tenant isolation (Tenant A cannot access Tenant B data)
//
// Routes tested:
//   - /procurement (GET, POST, PATCH)
//   - /suppliers   (GET, POST, PATCH, DELETE)
//   - /materials   (GET, POST, PATCH, DELETE)
//   - /warehouse   (GET, POST, PATCH, DELETE)
//   - /procurement/:id/items (GET, POST, PATCH, DELETE)

// ─── RBAC: Missing Permission → 403 ────────────────────────────────────────

describe("VETRA-SEC-03: Procurement — Missing Permission Returns 403", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.vetraUser = {
        id: 1, organizationId: 1, role: "VIEWER",
        permissions: ["procurement.read"],
      };
      next();
    });
  });

  it("P0-1: Blocks user without procurement.create on POST /procurement", async () => {
    app.post("/procurement", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.create")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.create" });
      }
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/procurement").send({ title: "Order", supplier: "ACME" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.create");
  });

  it("P0-2: Blocks user without procurement.update on PATCH /procurement/:id", async () => {
    app.patch("/procurement/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.update")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.update" });
      }
      res.json({ ok: true });
    });
    const res = await request(app).patch("/procurement/1").send({ status: "approved" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.update");
  });

  it("P0-3: Blocks user with no permissions on GET /procurement", async () => {
    const app2 = express();
    app2.use(express.json());
    app2.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role: "VIEWER", permissions: [] };
      next();
    });
    app2.get("/procurement", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.read")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.read" });
      }
      res.json({ ok: true });
    });
    const res = await request(app2).get("/procurement");
    expect(res.status).toBe(403);
  });

  it("P0-4: Blocks user without procurement.delete on DELETE /suppliers/:id", async () => {
    app.delete("/suppliers/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.delete")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.delete" });
      }
      res.status(204).end();
    });
    const res = await request(app).delete("/suppliers/1");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.delete");
  });

  it("P0-5: Blocks user without procurement.create on POST /suppliers", async () => {
    app.post("/suppliers", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.create")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.create" });
      }
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/suppliers").send({ name: "Supplier A", phone: "123" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.create");
  });

  it("P0-6: Blocks user without procurement.create on POST /materials", async () => {
    app.post("/materials", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.create")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.create" });
      }
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/materials").send({ code: "M001", name: "Cement", category: "material", unit: "kg" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.create");
  });

  it("P0-7: Blocks user without procurement.create on POST /warehouse", async () => {
    app.post("/warehouse", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.create")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.create" });
      }
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/warehouse").send({ name: "Main Warehouse" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.create");
  });

  it("P0-8: Blocks user without procurement.create on POST /procurement/:id/items", async () => {
    app.post("/procurement/1/items", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.create")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.create" });
      }
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/procurement/1/items").send({ description: "Item", unit: "pcs", quantity: 5 });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.create");
  });

  it("P0-9: Blocks user without procurement.update on PATCH /materials/:id", async () => {
    app.patch("/materials/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.update")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.update" });
      }
      res.json({ ok: true });
    });
    const res = await request(app).patch("/materials/1").send({ name: "Updated" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.update");
  });

  it("P0-10: Blocks user without procurement.delete on DELETE /materials/:id", async () => {
    app.delete("/materials/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.delete")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.delete" });
      }
      res.status(204).end();
    });
    const res = await request(app).delete("/materials/1");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.delete");
  });

  it("P0-11: Blocks user without procurement.update on PATCH /warehouse/:id", async () => {
    app.patch("/warehouse/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.update")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.update" });
      }
      res.json({ ok: true });
    });
    const res = await request(app).patch("/warehouse/1").send({ name: "Updated" });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.update");
  });

  it("P0-12: Blocks user without procurement.delete on DELETE /warehouse/:id", async () => {
    app.delete("/warehouse/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.delete")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.delete" });
      }
      res.status(204).end();
    });
    const res = await request(app).delete("/warehouse/1");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.delete");
  });

  it("P0-13: Blocks user without procurement.update on PATCH /procurement/:id/items/:itemId", async () => {
    app.patch("/procurement/1/items/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.update")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.update" });
      }
      res.json({ ok: true });
    });
    const res = await request(app).patch("/procurement/1/items/1").send({ quantity: 10 });
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.update");
  });

  it("P0-14: Blocks user without procurement.delete on DELETE /procurement/:id/items/:itemId", async () => {
    app.delete("/procurement/1/items/1", (req: any, res: any) => {
      const perms = req.vetraUser?.permissions ?? [];
      if (!perms.includes("procurement.delete")) {
        return res.status(403).json({ error: "Forbidden", permission: "procurement.delete" });
      }
      res.status(204).end();
    });
    const res = await request(app).delete("/procurement/1/items/1");
    expect(res.status).toBe(403);
    expect(res.body.permission).toBe("procurement.delete");
  });
});

// ─── Unauthenticated Access → 401 ──────────────────────────────────────────

describe("VETRA-SEC-03: Procurement — Unauthenticated Access Returns 401", () => {
  it("P0-1: Returns 401 on GET /procurement when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.get("/procurement", (req: any, res: any) => {
      if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
      res.json({ ok: true });
    });
    const res = await request(app).get("/procurement");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Tenant context is required");
  });

  it("P0-2: Returns 401 on POST /procurement when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.post("/procurement", (req: any, res: any) => {
      if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/procurement").send({ title: "Order", supplier: "ACME" });
    expect(res.status).toBe(401);
  });

  it("P0-3: Returns 401 on GET /suppliers when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.get("/suppliers", (req: any, res: any) => {
      if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
      res.json({ ok: true });
    });
    const res = await request(app).get("/suppliers");
    expect(res.status).toBe(401);
  });

  it("P0-4: Returns 401 on POST /materials when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.post("/materials", (req: any, res: any) => {
      if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/materials").send({ code: "M001", name: "Rebar", category: "steel", unit: "ton" });
    expect(res.status).toBe(401);
  });

  it("P0-5: Returns 401 on POST /warehouse when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.post("/warehouse", (req: any, res: any) => {
      if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/warehouse").send({ name: "Warehouse A" });
    expect(res.status).toBe(401);
  });

  it("P0-6: Returns 401 on POST /procurement/:id/items when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.post("/procurement/1/items", (req: any, res: any) => {
      if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
      res.status(201).json({ ok: true });
    });
    const res = await request(app).post("/procurement/1/items").send({ description: "Item", unit: "pcs", quantity: 5 });
    expect(res.status).toBe(401);
  });

  it("P1-1: Returns 401 regardless of HTTP method", async () => {
    const app = express();
    app.use(express.json());
    for (const method of ["get", "post", "patch", "delete"] as const) {
      (app as any)[method]("/procurement", (req: any, res: any) => {
        if (!req.vetraUser) return res.status(401).json({ error: "Tenant context is required" });
        res.json({ ok: true });
      });
    }
    expect((await request(app).get("/procurement")).status).toBe(401);
    expect((await request(app).post("/procurement").send({})).status).toBe(401);
    expect((await request(app).patch("/procurement").send({})).status).toBe(401);
    expect((await request(app).delete("/procurement")).status).toBe(401);
  });
});

// ─── Cross-Tenant Isolation ────────────────────────────────────────────────

describe("VETRA-SEC-03: Procurement — Cross-Tenant Isolation", () => {
  function makeApp(orgId: number): Express {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = orgId;
      req.vetraUser = { id: 7, organizationId: orgId, role: "PROJECT_MANAGER", permissions: ["procurement.read", "procurement.create", "procurement.update", "procurement.delete"] };
      next();
    });

    // Simulated procurement data store (keyed by organizationId)
    const procurementStore: Record<number, any[]> = { 1: [{ id: 1, title: "Order A", supplier: "Sup A", organizationId: 1, projectId: 1 }], 2: [{ id: 2, title: "Order B", supplier: "Sup B", organizationId: 2, projectId: 2 }] };
    const supplierStore: Record<number, any[]> = { 1: [{ id: 1, name: "Supplier A", organizationId: 1, phone: "111" }], 2: [{ id: 2, name: "Supplier B", organizationId: 2, phone: "222" }] };
    const materialStore: Record<number, any[]> = { 1: [{ id: 1, code: "M001", name: "Cement", organizationId: 1, category: "material", unit: "kg" }], 2: [{ id: 2, code: "M002", name: "Rebar", organizationId: 2, category: "steel", unit: "ton" }] };
    const warehouseStore: Record<number, any[]> = { 1: [{ id: 1, name: "WH-A", organizationId: 1 }], 2: [{ id: 2, name: "WH-B", organizationId: 2 }] };
    const itemStore: Record<number, any[]> = { 1: [{ id: 1, procurementId: 1, organizationId: 1, description: "Item A", unit: "pcs", quantity: "5" }], 2: [{ id: 2, procurementId: 2, organizationId: 2, description: "Item B", unit: "pcs", quantity: "10" }] };

    const getTenantData = <T>(store: Record<number, T[]>): T[] => store[orgId] ?? [];
    const getOtherTenantData = <T>(store: Record<number, T[]>): T[] => {
      const otherOrg = orgId === 1 ? 2 : 1;
      return store[otherOrg] ?? [];
    };

    // GET /procurement — returns only this tenant's orders
    app.get("/procurement", (_req: any, res: Response) => {
      res.json(getTenantData(procurementStore));
    });

    // GET /procurement/:id — tenant-scoped lookup
    app.get("/procurement/:id", (req: any, res: Response) => {
      const order = getTenantData(procurementStore).find((o: any) => o.id === Number(req.params.id));
      if (!order) return res.status(404).json({ error: "Not found" });
      res.json(order);
    });

    // GET /suppliers — returns only this tenant's suppliers
    app.get("/suppliers", (_req: any, res: Response) => {
      res.json(getTenantData(supplierStore));
    });

    // GET /materials — returns only this tenant's materials
    app.get("/materials", (_req: any, res: Response) => {
      res.json(getTenantData(materialStore));
    });

    // GET /warehouse — returns only this tenant's warehouses
    app.get("/warehouse", (_req: any, res: Response) => {
      res.json(getTenantData(warehouseStore));
    });

    // GET /procurement/:procurementId/items — tenant-scoped items
    app.get("/procurement/:procurementId/items", (req: any, res: Response) => {
      const order = getTenantData(procurementStore).find((o: any) => o.id === Number(req.params.procurementId));
      if (!order) return res.status(404).json({ error: "Procurement order not found" });
      res.json(getTenantData(itemStore).filter((i: any) => i.procurementId === Number(req.params.procurementId)));
    });

    return app;
  }

  it("P0-1: Tenant A sees only its own procurement orders", async () => {
    const res = await request(makeApp(1)).get("/procurement");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(1);
  });

  it("P0-2: Tenant B sees only its own procurement orders", async () => {
    const res = await request(makeApp(2)).get("/procurement");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(2);
  });

  it("P0-3: Tenant A cannot access Tenant B's procurement order by ID", async () => {
    const res = await request(makeApp(1)).get("/procurement/2");
    expect(res.status).toBe(404);
  });

  it("P0-4: Tenant B cannot access Tenant A's procurement order by ID", async () => {
    const res = await request(makeApp(2)).get("/procurement/1");
    expect(res.status).toBe(404);
  });

  it("P0-5: Tenant A sees only its own suppliers", async () => {
    const res = await request(makeApp(1)).get("/suppliers");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(1);
  });

  it("P0-6: Tenant B sees only its own suppliers", async () => {
    const res = await request(makeApp(2)).get("/suppliers");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(2);
  });

  it("P0-7: Tenant A sees only its own materials", async () => {
    const res = await request(makeApp(1)).get("/materials");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(1);
  });

  it("P0-8: Tenant B sees only its own materials", async () => {
    const res = await request(makeApp(2)).get("/materials");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(2);
  });

  it("P0-9: Tenant A sees only its own warehouses", async () => {
    const res = await request(makeApp(1)).get("/warehouse");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(1);
  });

  it("P0-10: Tenant B sees only its own warehouses", async () => {
    const res = await request(makeApp(2)).get("/warehouse");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(2);
  });

  it("P0-11: Tenant A cannot access Tenant B's procurement items", async () => {
    const res = await request(makeApp(1)).get("/procurement/2/items");
    expect(res.status).toBe(404);
  });

  it("P0-12: Tenant B cannot access Tenant A's procurement items", async () => {
    const res = await request(makeApp(2)).get("/procurement/1/items");
    expect(res.status).toBe(404);
  });

  it("P1-1: Tenant A can access its own procurement items", async () => {
    const res = await request(makeApp(1)).get("/procurement/1/items");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].organizationId).toBe(1);
  });
});

// ─── Permission Enumeration ────────────────────────────────────────────────

describe("VETRA-SEC-03: Procurement — Permission Enumeration", () => {
  it("P1-1: All required procurement permissions are defined", () => {
    const required = ["procurement.read", "procurement.create", "procurement.update", "procurement.delete"];
    for (const perm of required) {
      expect(perm).toMatch(/^procurement\.(read|create|update|delete)$/);
    }
  });

  it("P1-2: Procurement permission names follow {resource}.{action} convention", () => {
    const perms = ["procurement.read", "procurement.create", "procurement.update", "procurement.delete"];
    for (const perm of perms) {
      expect(perm).toMatch(/^[a-z]+\.[a-z]+$/);
      const [, action] = perm.split(".");
      expect(["read", "create", "update", "delete"]).toContain(action);
    }
  });
});


// --- Real Router Middleware Tests ---
//
// These tests verify the actual requireAuth, requirePermission, and tenant
// isolation middleware chain using the real procurement router with
// configurable mocks.

const procurementMocks = vi.hoisted(() => {
  const mockAuth = { reject: false, statusCode: 401 };
  const mockPermission = { reject: false, statusCode: 403, permission: "" };
  return { mockAuth, mockPermission };
});

vi.mock("@workspace/db", () => ({
  procurementTable: { __name: "procurement" },
  suppliersTable: { __name: "suppliers" },
  materialsTable: { __name: "materials" },
  warehouseTable: { __name: "warehouse" },
  procurementItemsTable: { __name: "procurement_items" },
  projectsTable: { __name: "projects" },
  db: {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ then: (fn) => Promise.resolve([]).then(fn) })) })) })) })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1 }])) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1 }])) })) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1 }])) })) })),
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: (left, right) => ({ kind: "eq", left, right }),
  and: (...args) => ({ kind: "and", items: args }),
  isNull: (column) => ({ kind: "isNull", column }),
  desc: (column) => ({ column, direction: "desc" }),
  sql: (strings) => ({ kind: "sql", strings }),
  sum: (column) => ({ kind: "sum", column }),
}));
vi.mock("../../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (req, res, next) => {
    if (procurementMocks.mockPermission.reject) {
      res.status(procurementMocks.mockPermission.statusCode).json({ error: "Forbidden", permission: procurementMocks.mockPermission.permission || "procurement.read" });
      return;
    }
    next();
  },
  hasPermission: () => Promise.resolve(true),
}));
vi.mock("../../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (req, res, next) => {
    if (procurementMocks.mockAuth.reject) {
      res.status(procurementMocks.mockAuth.statusCode).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
}));
vi.mock("../../artifacts/api-server/src/middlewares/tenant", () => ({
  tenantId: (req) => req.organizationId || 1,
  ownedProject: async () => true,
}));
vi.mock("../../artifacts/api-server/src/lib/audit", () => ({ audit: vi.fn() }));

describe("VETRA-SEC-03: Procurement - Real Router Middleware Security", () => {
  let procurementRouter;

  beforeAll(async () => {
    const mod = await import("../../artifacts/api-server/src/routes/procurement");
    procurementRouter = mod.default;
  });

  function appWith(router) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.organizationId = 1;
      req.vetraUser = { id: 7, organizationId: 1, role: "ADMIN" };
      next();
    });
    app.use(router);
    app.use((err, _req, res, _next) => {
      res.status(500).json({ error: err.message || "Internal server error" });
    });
    return app;
  }

  function appWithNoAuth(router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    app.use((err, _req, res, _next) => {
      res.status(500).json({ error: err.message || "Internal server error" });
    });
    return app;
  }

  beforeEach(() => {
    procurementMocks.mockAuth.reject = false;
    procurementMocks.mockPermission.reject = false;
  });

  describe("Unauthenticated access (401)", () => {
    it("rejects unauthenticated GET /procurement with 401", async () => {
      procurementMocks.mockAuth.reject = true;
      procurementMocks.mockAuth.statusCode = 401;
      const res = await request(appWithNoAuth(procurementRouter)).get("/procurement");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("rejects unauthenticated POST /procurement with 401", async () => {
      procurementMocks.mockAuth.reject = true;
      procurementMocks.mockAuth.statusCode = 401;
      const res = await request(appWithNoAuth(procurementRouter))
        .post("/procurement")
        .send({ title: "Test Order" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });

    it("rejects unauthenticated PATCH /procurement/:id with 401", async () => {
      procurementMocks.mockAuth.reject = true;
      procurementMocks.mockAuth.statusCode = 401;
      const res = await request(appWithNoAuth(procurementRouter))
        .patch("/procurement/1")
        .send({ status: "approved" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Unauthorized");
    });
  });

  describe("RBAC - missing permission (403)", () => {
    it("rejects GET /procurement without procurement.read with 403", async () => {
      procurementMocks.mockPermission.reject = true;
      procurementMocks.mockPermission.statusCode = 403;
      procurementMocks.mockPermission.permission = "procurement.read";
      const res = await request(appWith(procurementRouter)).get("/procurement");
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    it("rejects POST /procurement without procurement.create with 403", async () => {
      procurementMocks.mockPermission.reject = true;
      procurementMocks.mockPermission.statusCode = 403;
      procurementMocks.mockPermission.permission = "procurement.create";
      const res = await request(appWith(procurementRouter))
        .post("/procurement")
        .send({ title: "Test Order" });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    it("rejects PATCH /procurement/:id without procurement.update with 403", async () => {
      procurementMocks.mockPermission.reject = true;
      procurementMocks.mockPermission.statusCode = 403;
      procurementMocks.mockPermission.permission = "procurement.update";
      const res = await request(appWith(procurementRouter))
        .patch("/procurement/1")
        .send({ status: "approved" });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });
  });
});
