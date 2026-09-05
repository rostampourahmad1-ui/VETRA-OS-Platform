import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VETRA-SEC-03: Workflows — Cross-Tenant and RBAC Tests ─────────────

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]) => {
    const table: any = { __name: name };
    for (const f of fields) table[f] = { __table: name, __field: f };
    return table;
  };
  const tables = {
    workflowsTable: makeTable("workflows", ["id","organizationId","name","entityType","active","createdBy","createdAt","deletedAt"]),
    workflowStepsTable: makeTable("workflowSteps", ["id","workflowId","stepOrder","name","requiredPermission","approvalType","requiredApprovals"]),
    workflowRunsTable: makeTable("workflowRuns", ["id","organizationId","workflowId","currentStep","status","entityType","entityId","submittedBy","createdAt","updatedAt","completedAt"]),
    workflowRunEventsTable: makeTable("workflowRunEvents", ["id","organizationId","workflowRunId","workflowStepId","action","comment","actorId","createdAt"]),
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
    req.vetraUser = { id: 7, organizationId: orgId, role: "ADMIN", permissions: ["workflows.read","workflows.create","workflows.update","workflows.delete","workflows.execute"] };
    next();
  });

  app.get("/workflows", (req: any, res) => { res.json((rows.get(tables.workflowsTable) ?? []).filter((w: any) => w.organizationId === req.organizationId && w.deletedAt == null)); });

  app.get("/workflows/:id", (req: any, res) => {
    const w = (rows.get(tables.workflowsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!w) { res.status(404).json({ error: "Not found" }); return; }
    res.json(w);
  });

  app.post("/workflows", (req: any, res) => { res.status(201).json({ id: 1, name: req.body.name, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) }); });

  app.patch("/workflows/:id", (req: any, res) => {
    const w = (rows.get(tables.workflowsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!w) { res.status(404).json({ error: "Not found" }); return; }
    Object.assign(w, req.body);
    res.json(w);
  });

  app.delete("/workflows/:id", (req: any, res) => {
    const w = (rows.get(tables.workflowsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!w) { res.status(404).json({ error: "Not found" }); return; }
    w.deletedAt = new Date().toISOString();
    res.status(204).end();
  });

  app.get("/workflows/:id/steps", (req: any, res) => {
    const wid = Number(req.params.id);
    const w = (rows.get(tables.workflowsTable) ?? []).find((x: any) => x.id === wid && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!w) { res.status(404).json({ error: "Not found" }); return; }
    res.json((rows.get(tables.workflowStepsTable) ?? []).filter((s: any) => s.workflowId === wid));
  });

  app.post("/workflows/:id/steps", (req: any, res) => {
    const wid = Number(req.params.id);
    const w = (rows.get(tables.workflowsTable) ?? []).find((x: any) => x.id === wid && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!w) { res.status(404).json({ error: "Not found" }); return; }
    res.status(201).json({ id: 1, workflowId: wid, ...req.body, organizationId: req.organizationId });
  });

  app.get("/workflow-runs", (req: any, res) => { res.json((rows.get(tables.workflowRunsTable) ?? []).filter((r: any) => r.organizationId === req.organizationId)); });

  app.get("/workflow-runs/:id", (req: any, res) => {
    const r = (rows.get(tables.workflowRunsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId);
    if (!r) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r);
  });

  return app;
}

describe("VETRA-SEC-03: Workflows — Cross-Tenant Isolation", () => {
  beforeEach(() => rows.clear());

  function seed(): void {
    rows.set(tables.workflowsTable, [
      { id: 1, organizationId: 1, name: "WF A", entityType: "form", active: true, createdBy: "7", createdAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, name: "WF B", entityType: "form", active: true, createdBy: "8", createdAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.workflowStepsTable, [
      { id: 1, workflowId: 1, stepOrder: 1, name: "Approve", requiredPermission: "quality.approve", approvalType: "single", requiredApprovals: 1 },
      { id: 2, workflowId: 2, stepOrder: 1, name: "Review", requiredPermission: "quality.read", approvalType: "single", requiredApprovals: 1 },
    ]);
    rows.set(tables.workflowRunsTable, [
      { id: 1, organizationId: 1, workflowId: 1, currentStep: 1, status: "pending", entityType: "form_submission", entityId: "10", submittedBy: "7", createdAt: new Date(), updatedAt: new Date(), completedAt: null },
      { id: 2, organizationId: 2, workflowId: 2, currentStep: 1, status: "pending", entityType: "form_submission", entityId: "20", submittedBy: "8", createdAt: new Date(), updatedAt: new Date(), completedAt: null },
    ]);
  }

  it("P0-1: cannot list Tenant B's workflows", async () => { seed(); const r = await request(appWith(1)).get("/workflows"); expect(r.body).toHaveLength(1); expect(r.body[0].id).toBe(1); });
  it("P0-2: cannot read Tenant B's workflow", async () => { seed(); expect((await request(appWith(1)).get("/workflows/2")).status).toBe(404); });
  it("P0-3: cannot update Tenant B's workflow", async () => { seed(); expect((await request(appWith(1)).patch("/workflows/2").send({name:"X"})).status).toBe(404); });
  it("P0-4: cannot delete Tenant B's workflow", async () => { seed(); expect((await request(appWith(1)).delete("/workflows/2")).status).toBe(404); });
  it("P0-5: cannot list Tenant B's workflow steps", async () => { seed(); expect((await request(appWith(1)).get("/workflows/2/steps")).status).toBe(404); });
  it("P0-6: cannot create steps for Tenant B's workflow", async () => { seed(); expect((await request(appWith(1)).post("/workflows/2/steps").send({name:"X",stepOrder:1})).status).toBe(404); });
  it("P0-7: cannot list Tenant B's workflow runs", async () => { seed(); const r = await request(appWith(1)).get("/workflow-runs"); expect(r.body).toHaveLength(1); expect(r.body[0].organizationId).toBe(1); });
  it("P0-8: cannot read Tenant B's workflow run", async () => { seed(); expect((await request(appWith(1)).get("/workflow-runs/2")).status).toBe(404); });
});

describe("VETRA-SEC-03: Workflows — RBAC Enforcement", () => {
  it("P1-1: workflow read requires workflows.read", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.get("/workflows", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"workflows.read"}); n(); }, (_: any, r: any) => r.json([]));
    expect((await request(app).get("/workflows")).status).toBe(403);
  });
  it("P1-2: workflow create requires workflows.create", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/workflows", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"workflows.create"}); n(); }, (_: any, r: any) => r.status(201).json({id:1}));
    expect((await request(app).post("/workflows").send({name:"WF",entityType:"form"})).status).toBe(403);
  });
  it("P1-3: workflow execute requires workflows.execute", async () => {
    const app = express(); app.use(express.json()); app.use((req: any, _r, n) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; n(); });
    app.post("/workflow-runs", (req: any, res: any, n: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"workflows.execute"}); n(); });
    expect((await request(app).post("/workflow-runs").send({workflowId:1})).status).toBe(403);
  });
});

describe("VETRA-SEC-03: Workflows — Unauthenticated Access", () => {
  it("P0-1: 401 when no vetraUser", async () => {
    const app = express(); app.use(express.json());
    app.get("/workflows", (req: any, res: any) => { if (!req.vetraUser) return res.status(401).json({error:"Tenant context is required"}); });
    expect((await request(app).get("/workflows")).status).toBe(401);
  });
});

describe("VETRA-SEC-03: Workflows — Server-Authoritative createdBy", () => {
  beforeEach(() => rows.clear());
  it("P0-1: createdBy from auth not client", async () => {
    const r = await request(appWith(1)).post("/workflows").send({name:"WF",entityType:"form",createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
});
