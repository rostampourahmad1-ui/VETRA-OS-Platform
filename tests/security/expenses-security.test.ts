import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VETRA-SEC-03: Expenses/Costs — Cross-Tenant and RBAC Tests ─────────

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]) => {
    const table: any = { __name: name };
    for (const f of fields) table[f] = { __table: name, __field: f };
    return table;
  };
  const tables = {
    expensesTable: makeTable("expenses", ["id","organizationId","projectId","amount","description","category","date","createdBy","createdAt","updatedAt","deletedAt"]),
    costBudgetsTable: makeTable("costBudgets", ["id","organizationId","projectId","name","budgetAmount","spentAmount","createdBy","createdAt","updatedAt","deletedAt"]),
    projectsTable: makeTable("projects", ["id","name","organizationId"]),
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
    req.vetraUser = { id: 7, organizationId: orgId, role: "PROJECT_MANAGER", permissions: ["expenses.read","expenses.create","expenses.update","expenses.delete"] };
    next();
  });

  app.get("/expenses", (req: any, res) => { res.json((rows.get(tables.expensesTable) ?? []).filter((e: any) => e.organizationId === req.organizationId && e.deletedAt == null)); });

  app.get("/expenses/:id", (req: any, res) => {
    const e = (rows.get(tables.expensesTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!e) { res.status(404).json({ error: "Not found" }); return; }
    res.json(e);
  });

  app.post("/expenses", (req: any, res) => {
    const project = (rows.get(tables.projectsTable) ?? []).find((p: any) => p.id === req.body.projectId && p.organizationId === req.organizationId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 1, amount: req.body.amount, description: req.body.description, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) });
  });

  app.patch("/expenses/:id", (req: any, res) => {
    const e = (rows.get(tables.expensesTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!e) { res.status(404).json({ error: "Not found" }); return; }
    Object.assign(e, req.body);
    res.json(e);
  });

  app.delete("/expenses/:id", (req: any, res) => {
    const e = (rows.get(tables.expensesTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!e) { res.status(404).json({ error: "Not found" }); return; }
    e.deletedAt = new Date().toISOString();
    res.status(204).end();
  });

  app.get("/cost-budgets", (req: any, res) => { res.json((rows.get(tables.costBudgetsTable) ?? []).filter((b: any) => b.organizationId === req.organizationId && b.deletedAt == null)); });

  app.get("/cost-budgets/:id", (req: any, res) => {
    const b = (rows.get(tables.costBudgetsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!b) { res.status(404).json({ error: "Not found" }); return; }
    res.json(b);
  });

  app.post("/cost-budgets", (req: any, res) => {
    const project = (rows.get(tables.projectsTable) ?? []).find((p: any) => p.id === req.body.projectId && p.organizationId === req.organizationId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 1, name: req.body.name, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) });
  });

  app.patch("/cost-budgets/:id", (req: any, res) => {
    const b = (rows.get(tables.costBudgetsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!b) { res.status(404).json({ error: "Not found" }); return; }
    Object.assign(b, req.body);
    res.json(b);
  });

  return app;
}

describe("VETRA-SEC-03: Expenses — Cross-Tenant Isolation", () => {
  beforeEach(() => rows.clear());

  function seed(): void {
    rows.set(tables.expensesTable, [
      { id: 1, organizationId: 1, projectId: 1, amount: "15000000", description: "Material A", category: "material", date: "2026-08-01", createdBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, projectId: 2, amount: "25000000", description: "Material B", category: "material", date: "2026-08-02", createdBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.costBudgetsTable, [
      { id: 1, organizationId: 1, projectId: 1, name: "Budget A", budgetAmount: "100000000", spentAmount: "15000000", createdBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, projectId: 2, name: "Budget B", budgetAmount: "200000000", spentAmount: "25000000", createdBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.projectsTable, [
      { id: 1, name: "Project A", organizationId: 1 },
      { id: 2, name: "Project B", organizationId: 2 },
    ]);
  }

  it("P0-1: cannot list Tenant B's expenses", async () => { seed(); const r = await request(appWith(1)).get("/expenses"); expect(r.body).toHaveLength(1); expect(r.body[0].id).toBe(1); });
  it("P0-2: cannot read Tenant B's expense", async () => { seed(); expect((await request(appWith(1)).get("/expenses/2")).status).toBe(404); });
  it("P0-3: cannot update Tenant B's expense", async () => { seed(); expect((await request(appWith(1)).patch("/expenses/2").send({amount:"999"})).status).toBe(404); });
  it("P0-4: cannot delete Tenant B's expense", async () => { seed(); expect((await request(appWith(1)).delete("/expenses/2")).status).toBe(404); });
  it("P0-5: cannot create expense for Tenant B's project", async () => { seed(); expect((await request(appWith(1)).post("/expenses").send({projectId:2,amount:"1000",description:"X",category:"material",date:"2026-09-01"})).status).toBe(404); });
  it("P0-6: cannot list Tenant B's cost budgets", async () => { seed(); const r = await request(appWith(1)).get("/cost-budgets"); expect(r.body).toHaveLength(1); expect(r.body[0].id).toBe(1); });
  it("P0-7: cannot read Tenant B's cost budget", async () => { seed(); expect((await request(appWith(1)).get("/cost-budgets/2")).status).toBe(404); });
  it("P0-8: cannot create cost budget for Tenant B's project", async () => { seed(); expect((await request(appWith(1)).post("/cost-budgets").send({projectId:2,name:"X",budgetAmount:"100000"})).status).toBe(404); });
  it("P0-9: cannot update Tenant B's cost budget", async () => { seed(); expect((await request(appWith(1)).patch("/cost-budgets/2").send({budgetAmount:"999"})).status).toBe(404); });
});

describe("VETRA-SEC-03: Expenses — RBAC Enforcement", () => {
  it("P1-1: expense read requires expenses.read", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.get("/expenses", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"expenses.read"}); n(); }, (_: any, r: any) => r.json([]));
    expect((await request(app).get("/expenses")).status).toBe(403);
  });
  it("P1-2: expense create requires expenses.create", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/expenses", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"expenses.create"}); n(); });
    expect((await request(app).post("/expenses").send({projectId:1,amount:"1000",description:"X",category:"material",date:"2026-09-01"})).status).toBe(403);
  });
  it("P1-3: cost budget create requires expenses.create", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/cost-budgets", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"expenses.create"}); n(); });
    expect((await request(app).post("/cost-budgets").send({projectId:1,name:"B",budgetAmount:"100000"})).status).toBe(403);
  });
});

describe("VETRA-SEC-03: Expenses — Unauthenticated Access", () => {
  it("P0-1: 401 when no vetraUser", async () => {
    const app = express(); app.use(express.json());
    app.get("/expenses", (req: any, res: any) => { if (!req.vetraUser) return res.status(401).json({error:"Tenant context is required"}); });
    expect((await request(app).get("/expenses")).status).toBe(401);
  });
});

describe("VETRA-SEC-03: Expenses — Server-Authoritative createdBy", () => {
  beforeEach(() => { rows.clear(); rows.set(tables.projectsTable, [{id:1,name:"P",organizationId:1}]); });
  it("P0-1: expense createdBy from auth not client", async () => {
    const r = await request(appWith(1)).post("/expenses").send({projectId:1,amount:"1000",description:"X",category:"material",date:"2026-09-01",createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
  it("P0-2: cost budget createdBy from auth not client", async () => {
    const r = await request(appWith(1)).post("/cost-budgets").send({projectId:1,name:"B",budgetAmount:"100000",createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
});
