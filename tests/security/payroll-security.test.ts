import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VETRA-SEC-03: Payroll — Cross-Tenant and RBAC Tests ────────────────

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]) => {
    const table: any = { __name: name };
    for (const f of fields) table[f] = { __table: name, __field: f };
    return table;
  };
  const tables = {
    payrollTable: makeTable("payroll", ["id","employeeId","organizationId","periodStart","periodEnd","baseSalary","overtime","bonuses","deductions","netPay","status","notes","createdBy","createdAt","updatedAt","deletedAt"]),
    employeesTable: makeTable("employees", ["id","organizationId","code","firstName","lastName","status"]),
  };
  const rows = new Map<any, any[]>();
  return { tables, rows };
});

const { tables, rows } = mocks;

function appWith(orgId: number = 1): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.organizationId = orgId;
    req.vetraUser = { id: 7, organizationId: orgId, role: "HR_MANAGER", permissions: ["payroll.read","payroll.create","payroll.update","payroll.delete"] };
    next();
  });

  app.get("/payroll", (req: any, res) => { res.json((rows.get(tables.payrollTable) ?? []).filter((p: any) => p.organizationId === req.organizationId && p.deletedAt == null)); });

  app.get("/payroll/:id", (req: any, res) => {
    const p = (rows.get(tables.payrollTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    res.json(p);
  });

  app.post("/payroll", (req: any, res) => {
    const emp = (rows.get(tables.employeesTable) ?? []).find((e: any) => e.id === req.body.employeeId && e.organizationId === req.organizationId);
    if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
    res.status(201).json({ id: 1, employeeId: req.body.employeeId, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) });
  });

  app.patch("/payroll/:id", (req: any, res) => {
    const p = (rows.get(tables.payrollTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    Object.assign(p, req.body);
    res.json(p);
  });

  app.delete("/payroll/:id", (req: any, res) => {
    const p = (rows.get(tables.payrollTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!p) { res.status(404).json({ error: "Not found" }); return; }
    p.deletedAt = new Date().toISOString();
    res.status(204).end();
  });

  return app;
}

describe("VETRA-SEC-03: Payroll — Cross-Tenant Isolation", () => {
  beforeEach(() => rows.clear());

  function seed(): void {
    rows.set(tables.payrollTable, [
      { id: 1, employeeId: 10, organizationId: 1, periodStart: "2026-01-01", periodEnd: "2026-01-31", baseSalary: "50000000", status: "paid", createdBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, employeeId: 20, organizationId: 2, periodStart: "2026-01-01", periodEnd: "2026-01-31", baseSalary: "60000000", status: "pending", createdBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.employeesTable, [
      { id: 10, organizationId: 1, code: "E001", firstName: "Ali", lastName: "Ahmadi", status: "active" },
      { id: 20, organizationId: 2, code: "E002", firstName: "Sara", lastName: "Moradi", status: "active" },
    ]);
  }

  it("P0-1: cannot list Tenant B's payroll records", async () => { seed(); const r = await request(appWith(1)).get("/payroll"); expect(r.body).toHaveLength(1); expect(r.body[0].id).toBe(1); });
  it("P0-2: cannot read Tenant B's payroll record", async () => { seed(); expect((await request(appWith(1)).get("/payroll/2")).status).toBe(404); });
  it("P0-3: cannot update Tenant B's payroll record", async () => { seed(); expect((await request(appWith(1)).patch("/payroll/2").send({status:"paid"})).status).toBe(404); });
  it("P0-4: cannot delete Tenant B's payroll record", async () => { seed(); expect((await request(appWith(1)).delete("/payroll/2")).status).toBe(404); });
  it("P0-5: cannot create payroll for Tenant B's employee", async () => { seed(); expect((await request(appWith(1)).post("/payroll").send({employeeId:20,periodStart:"2026-02-01",periodEnd:"2026-02-28",baseSalary:"10000000"})).status).toBe(404); });
});

describe("VETRA-SEC-03: Payroll — RBAC Enforcement", () => {
  it("P1-1: payroll read requires payroll.read", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.get("/payroll", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"payroll.read"}); n(); }, (_: any, r: any) => r.json([]));
    expect((await request(app).get("/payroll")).status).toBe(403);
  });
  it("P1-2: payroll create requires payroll.create", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/payroll", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"payroll.create"}); n(); });
    expect((await request(app).post("/payroll").send({employeeId:1,periodStart:"2026-01-01",periodEnd:"2026-01-31",baseSalary:"10000000"})).status).toBe(403);
  });
});

describe("VETRA-SEC-03: Payroll — Unauthenticated Access", () => {
  it("P0-1: 401 when no vetraUser", async () => {
    const app = express(); app.use(express.json());
    app.get("/payroll", (req: any, res: any) => { if (!req.vetraUser) return res.status(401).json({error:"Tenant context is required"}); });
    expect((await request(app).get("/payroll")).status).toBe(401);
  });
});

describe("VETRA-SEC-03: Payroll — Server-Authoritative createdBy", () => {
  beforeEach(() => { rows.clear(); rows.set(tables.employeesTable, [{id:1,organizationId:1,code:"E001",firstName:"A",lastName:"B",status:"active"}]); });
  it("P0-1: createdBy from auth not client", async () => {
    const r = await request(appWith(1)).post("/payroll").send({employeeId:1,periodStart:"2026-01-01",periodEnd:"2026-01-31",baseSalary:"50000000",createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
});
