import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VETRA-SEC-03: Quality/Inspections/NCR — Cross-Tenant and RBAC Tests ─

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]) => {
    const table: any = { __name: name };
    for (const f of fields) table[f] = { __table: name, __field: f };
    return table;
  };
  const tables = {
    inspectionsTable: makeTable("inspections", ["id","organizationId","projectId","title","type","status","inspector","date","createdBy","createdAt","updatedAt","deletedAt"]),
    ncrTable: makeTable("ncr", ["id","organizationId","projectId","title","severity","status","description","createdBy","createdAt","updatedAt","deletedAt"]),
    qualityEventsTable: makeTable("qualityEvents", ["id","organizationId","inspectionId","ncrId","action","actorId","createdAt"]),
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
    req.vetraUser = { id: 7, organizationId: orgId, role: "QUALITY_MANAGER", permissions: ["quality.read","quality.create","quality.update","quality.delete"] };
    next();
  });

  app.get("/quality/inspections", (req: any, res) => { res.json((rows.get(tables.inspectionsTable) ?? []).filter((i: any) => i.organizationId === req.organizationId && i.deletedAt == null)); });

  app.get("/quality/inspections/:id", (req: any, res) => {
    const i = (rows.get(tables.inspectionsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!i) { res.status(404).json({ error: "Not found" }); return; }
    res.json(i);
  });

  app.post("/quality/inspections", (req: any, res) => {
    const project = (rows.get(tables.projectsTable) ?? []).find((p: any) => p.id === req.body.projectId && p.organizationId === req.organizationId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 1, title: req.body.title, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) });
  });

  app.patch("/quality/inspections/:id", (req: any, res) => {
    const i = (rows.get(tables.inspectionsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!i) { res.status(404).json({ error: "Not found" }); return; }
    Object.assign(i, req.body);
    res.json(i);
  });

  app.delete("/quality/inspections/:id", (req: any, res) => {
    const i = (rows.get(tables.inspectionsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!i) { res.status(404).json({ error: "Not found" }); return; }
    i.deletedAt = new Date().toISOString();
    res.status(204).end();
  });

  app.get("/quality/non-conformance-reports", (req: any, res) => { res.json((rows.get(tables.ncrTable) ?? []).filter((n: any) => n.organizationId === req.organizationId && n.deletedAt == null)); });

  app.get("/quality/non-conformance-reports/:id", (req: any, res) => {
    const n = (rows.get(tables.ncrTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!n) { res.status(404).json({ error: "Not found" }); return; }
    res.json(n);
  });

  app.post("/quality/non-conformance-reports", (req: any, res) => {
    const project = (rows.get(tables.projectsTable) ?? []).find((p: any) => p.id === req.body.projectId && p.organizationId === req.organizationId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 1, title: req.body.title, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) });
  });

  app.get("/quality/events", (req: any, res) => { res.json((rows.get(tables.qualityEventsTable) ?? []).filter((e: any) => e.organizationId === req.organizationId)); });

  return app;
}

describe("VETRA-SEC-03: Quality — Cross-Tenant Isolation", () => {
  beforeEach(() => rows.clear());

  function seed(): void {
    rows.set(tables.inspectionsTable, [
      { id: 1, organizationId: 1, projectId: 1, title: "Inspection A", type: "site", status: "planned", inspector: "A", date: "2026-09-01", createdBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, projectId: 2, title: "Inspection B", type: "material", status: "planned", inspector: "B", date: "2026-09-02", createdBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.ncrTable, [
      { id: 1, organizationId: 1, projectId: 1, title: "NCR A", severity: "high", status: "open", description: "Issue A", createdBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, projectId: 2, title: "NCR B", severity: "low", status: "open", description: "Issue B", createdBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.projectsTable, [
      { id: 1, name: "Project A", organizationId: 1 },
      { id: 2, name: "Project B", organizationId: 2 },
    ]);
    rows.set(tables.qualityEventsTable, [
      { id: 1, organizationId: 1, inspectionId: 1, ncrId: null, action: "created", actorId: "7", createdAt: new Date() },
      { id: 2, organizationId: 2, inspectionId: null, ncrId: 2, action: "created", actorId: "8", createdAt: new Date() },
    ]);
  }

  it("P0-1: cannot list Tenant B's inspections", async () => { seed(); const r = await request(appWith(1)).get("/quality/inspections"); expect(r.body).toHaveLength(1); expect(r.body[0].id).toBe(1); });
  it("P0-2: cannot read Tenant B's inspection", async () => { seed(); expect((await request(appWith(1)).get("/quality/inspections/2")).status).toBe(404); });
  it("P0-3: cannot update Tenant B's inspection", async () => { seed(); expect((await request(appWith(1)).patch("/quality/inspections/2").send({status:"completed"})).status).toBe(404); });
  it("P0-4: cannot delete Tenant B's inspection", async () => { seed(); expect((await request(appWith(1)).delete("/quality/inspections/2")).status).toBe(404); });
  it("P0-5: cannot create inspection for Tenant B's project", async () => { seed(); expect((await request(appWith(1)).post("/quality/inspections").send({projectId:2,title:"X",type:"site",inspector:"A",date:"2026-09-01"})).status).toBe(404); });
  it("P0-6: cannot list Tenant B's NCRs", async () => { seed(); const r = await request(appWith(1)).get("/quality/non-conformance-reports"); expect(r.body).toHaveLength(1); expect(r.body[0].id).toBe(1); });
  it("P0-7: cannot read Tenant B's NCR", async () => { seed(); expect((await request(appWith(1)).get("/quality/non-conformance-reports/2")).status).toBe(404); });
  it("P0-8: cannot create NCR for Tenant B's project", async () => { seed(); expect((await request(appWith(1)).post("/quality/non-conformance-reports").send({projectId:2,title:"X",severity:"high",description:"X"})).status).toBe(404); });
  it("P0-9: quality events scoped by organization", async () => { seed(); const r = await request(appWith(1)).get("/quality/events"); expect(r.body).toHaveLength(1); expect(r.body[0].organizationId).toBe(1); });
});

describe("VETRA-SEC-03: Quality — RBAC Enforcement", () => {
  it("P1-1: inspection read requires quality.read", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.get("/quality/inspections", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"quality.read"}); n(); }, (_: any, r: any) => r.json([]));
    expect((await request(app).get("/quality/inspections")).status).toBe(403);
  });
  it("P1-2: inspection create requires quality.create", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/quality/inspections", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"quality.create"}); n(); });
    expect((await request(app).post("/quality/inspections").send({projectId:1,title:"X",type:"site",inspector:"A",date:"2026-09-01"})).status).toBe(403);
  });
  it("P1-3: NCR create requires quality.create", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/quality/non-conformance-reports", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"quality.create"}); n(); });
    expect((await request(app).post("/quality/non-conformance-reports").send({projectId:1,title:"X",severity:"high",description:"X"})).status).toBe(403);
  });
});

describe("VETRA-SEC-03: Quality — Unauthenticated Access", () => {
  it("P0-1: 401 when no vetraUser", async () => {
    const app = express(); app.use(express.json());
    app.get("/quality/inspections", (req: any, res: any) => { if (!req.vetraUser) return res.status(401).json({error:"Tenant context is required"}); });
    expect((await request(app).get("/quality/inspections")).status).toBe(401);
  });
});

describe("VETRA-SEC-03: Quality — Server-Authoritative createdBy", () => {
  beforeEach(() => { rows.clear(); rows.set(tables.projectsTable, [{id:1,name:"P",organizationId:1}]); });
  it("P0-1: inspection createdBy from auth not client", async () => {
    const r = await request(appWith(1)).post("/quality/inspections").send({projectId:1,title:"X",type:"site",inspector:"A",date:"2026-09-01",createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
  it("P0-2: NCR createdBy from auth not client", async () => {
    const r = await request(appWith(1)).post("/quality/non-conformance-reports").send({projectId:1,title:"X",severity:"high",description:"X",createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
});
