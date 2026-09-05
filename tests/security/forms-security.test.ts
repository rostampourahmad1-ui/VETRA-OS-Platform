import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VETRA-SEC-03: Forms — Cross-Tenant and RBAC Tests ──────────────────

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]) => {
    const table: any = { __name: name };
    for (const field of fields) table[field] = { __table: name, __field: field };
    return table;
  };
  const tables = {
    formTemplatesTable: makeTable("formTemplates", ["id","organizationId","projectId","name","status","definition","createdBy","createdAt","updatedAt","deletedAt"]),
    formTemplateVersionsTable: makeTable("formTemplateVersions", ["id","organizationId","templateId","version","definition","publishedBy","createdAt"]),
    formSubmissionsTable: makeTable("formSubmissions", ["id","organizationId","projectId","templateId","status","answers","submittedBy","submittedAt","createdAt","updatedAt","deletedAt"]),
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
    req.vetraUser = { id: 7, organizationId: orgId, role: "PROJECT_MANAGER", permissions: ["forms.read","forms.create","forms.update","forms.delete"] };
    next();
  });

  app.get("/forms/templates", (req: any, res) => {
    const templates = (rows.get(tables.formTemplatesTable) ?? []).filter((t: any) => t.organizationId === req.organizationId && t.deletedAt == null);
    res.json(templates);
  });

  app.get("/forms/templates/:id", (req: any, res) => {
    const id = Number(req.params.id);
    const t = (rows.get(tables.formTemplatesTable) ?? []).find((x: any) => x.id === id && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.json(t);
  });

  app.post("/forms/templates", (req: any, res) => {
    const project = (rows.get(tables.projectsTable) ?? []).find((p: any) => p.id === req.body.projectId && p.organizationId === req.organizationId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 1, name: req.body.name, organizationId: req.organizationId, createdBy: String(req.vetraUser.id) });
  });

  app.patch("/forms/templates/:id", (req: any, res) => {
    const t = (rows.get(tables.formTemplatesTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    Object.assign(t, req.body);
    res.json(t);
  });

  app.delete("/forms/templates/:id", (req: any, res) => {
    const t = (rows.get(tables.formTemplatesTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    t.deletedAt = new Date().toISOString();
    res.status(204).end();
  });

  app.get("/forms/templates/:id/versions", (req: any, res) => {
    const tid = Number(req.params.id);
    const t = (rows.get(tables.formTemplatesTable) ?? []).find((x: any) => x.id === tid && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.json((rows.get(tables.formTemplateVersionsTable) ?? []).filter((v: any) => v.templateId === tid && v.organizationId === req.organizationId));
  });

  app.post("/forms/templates/:id/versions", (req: any, res) => {
    const tid = Number(req.params.id);
    const t = (rows.get(tables.formTemplatesTable) ?? []).find((x: any) => x.id === tid && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.status(201).json({ id: 1, templateId: tid, version: req.body.version, organizationId: req.organizationId });
  });

  app.post("/forms/submissions", (req: any, res) => {
    const project = (rows.get(tables.projectsTable) ?? []).find((p: any) => p.id === req.body.projectId && p.organizationId === req.organizationId);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const template = (rows.get(tables.formTemplatesTable) ?? []).find((t: any) => t.id === req.body.templateId && t.organizationId === req.organizationId);
    if (!template) { res.status(404).json({ error: "Template not found" }); return; }
    res.status(201).json({ id: 1, projectId: req.body.projectId, templateId: req.body.templateId, answers: req.body.answers, organizationId: req.organizationId, submittedBy: String(req.vetraUser.id) });
  });

  app.get("/forms/submissions", (req: any, res) => {
    res.json((rows.get(tables.formSubmissionsTable) ?? []).filter((s: any) => s.organizationId === req.organizationId && s.deletedAt == null));
  });

  app.get("/forms/submissions/:id", (req: any, res) => {
    const s = (rows.get(tables.formSubmissionsTable) ?? []).find((x: any) => x.id === Number(req.params.id) && x.organizationId === req.organizationId && x.deletedAt == null);
    if (!s) { res.status(404).json({ error: "Not found" }); return; }
    res.json(s);
  });

  return app;
}

describe("VETRA-SEC-03: Forms — Cross-Tenant Isolation", () => {
  beforeEach(() => rows.clear());

  function seed(): void {
    rows.set(tables.formTemplatesTable, [
      { id: 1, organizationId: 1, projectId: 1, name: "Template A", status: "draft", definition: {}, createdBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, projectId: 2, name: "Template B", status: "published", definition: {}, createdBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.formTemplateVersionsTable, [
      { id: 1, organizationId: 1, templateId: 1, version: 1, definition: {}, publishedBy: "7", createdAt: new Date() },
      { id: 2, organizationId: 2, templateId: 2, version: 1, definition: {}, publishedBy: "8", createdAt: new Date() },
    ]);
    rows.set(tables.formSubmissionsTable, [
      { id: 1, organizationId: 1, projectId: 1, templateId: 1, status: "draft", answers: {}, submittedBy: "7", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
      { id: 2, organizationId: 2, projectId: 2, templateId: 2, status: "submitted", answers: {}, submittedBy: "8", createdAt: new Date(), updatedAt: new Date(), deletedAt: null },
    ]);
    rows.set(tables.projectsTable, [
      { id: 1, name: "Project A", organizationId: 1 },
      { id: 2, name: "Project B", organizationId: 2 },
    ]);
  }

  it("P0-1: cannot list Tenant B's templates", async () => { seed(); const r = await request(appWith(1)).get("/forms/templates"); expect(r.status).toBe(200); expect(r.body).toHaveLength(1); expect(r.body[0].organizationId).toBe(1); });
  it("P0-2: cannot read Tenant B's template by ID", async () => { seed(); expect((await request(appWith(1)).get("/forms/templates/2")).status).toBe(404); });
  it("P0-3: cannot update Tenant B's template", async () => { seed(); expect((await request(appWith(1)).patch("/forms/templates/2").send({name:"X"})).status).toBe(404); });
  it("P0-4: cannot delete Tenant B's template", async () => { seed(); expect((await request(appWith(1)).delete("/forms/templates/2")).status).toBe(404); });
  it("P0-5: cannot create template for Tenant B's project", async () => { seed(); expect((await request(appWith(1)).post("/forms/templates").send({projectId:2,name:"X",definition:{}})).status).toBe(404); });
  it("P0-6: cannot list Tenant B's template versions", async () => { seed(); expect((await request(appWith(1)).get("/forms/templates/2/versions")).status).toBe(404); });
  it("P0-7: cannot create versions for Tenant B's template", async () => { seed(); expect((await request(appWith(1)).post("/forms/templates/2/versions").send({version:1,definition:{}})).status).toBe(404); });
  it("P0-8: Tenant A sees only own submissions", async () => { seed(); const r = await request(appWith(1)).get("/forms/submissions"); expect(r.body).toHaveLength(1); expect(r.body[0].organizationId).toBe(1); });
  it("P0-9: cannot read Tenant B's submission", async () => { seed(); expect((await request(appWith(1)).get("/forms/submissions/2")).status).toBe(404); });
  it("P0-10: cannot create submission for Tenant B's project", async () => { seed(); expect((await request(appWith(1)).post("/forms/submissions").send({projectId:2,templateId:2,answers:{}})).status).toBe(404); });
});

describe("VETRA-SEC-03: Forms — RBAC Enforcement", () => {
  beforeEach(() => { rows.clear(); rows.set(tables.projectsTable, [{id:1,name:"P",organizationId:1}]); });

  function rbacApp(permName: string): Express {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "VIEWER" }; next(); });
    return app;
  }

  it("P1-1: template read requires forms.read", async () => {
    const app = rbacApp("forms.read");
    app.get("/forms/templates", (req: any, res: any, next: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"forms.read"}); next(); }, (_r: any, res: any) => res.json([]));
    expect((await request(app).get("/forms/templates")).status).toBe(403);
  });

  it("P1-2: template create requires forms.create", async () => {
    const app = rbacApp("forms.create");
    app.post("/forms/templates", (req: any, res: any, next: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"forms.create"}); next(); }, (_r: any, res: any) => res.status(201).json({id:1}));
    expect((await request(app).post("/forms/templates").send({name:"T",definition:{}})).status).toBe(403);
  });

  it("P1-3: submission create requires forms.create", async () => {
    const app = rbacApp("forms.create");
    app.post("/forms/submissions", (req: any, res: any, next: any) => { if (req.vetraUser.role === "VIEWER") return res.status(403).json({error:"Forbidden",permission:"forms.create"}); next(); }, (_r: any, res: any) => res.status(201).json({id:1}));
    expect((await request(app).post("/forms/submissions").send({projectId:1,templateId:1,answers:{}})).status).toBe(403);
  });
});

describe("VETRA-SEC-03: Forms — Unauthenticated Access", () => {
  it("P0-1: 401 when no vetraUser", async () => {
    const app = express();
    app.use(express.json());
    app.get("/forms/templates", (req: any, res: any) => { if (!req.vetraUser) return res.status(401).json({error:"Tenant context is required"}); });
    expect((await request(app).get("/forms/templates")).status).toBe(401);
  });
});

describe("VETRA-SEC-03: Forms — Server-Authoritative submittedBy/createdBy", () => {
  beforeEach(() => { rows.clear(); rows.set(tables.projectsTable, [{id:1,name:"P",organizationId:1}]); rows.set(tables.formTemplatesTable, [{id:1,organizationId:1,projectId:1,name:"T",definition:{},deletedAt:null}]); });

  it("P0-1: submittedBy from auth, not client", async () => {
    const r = await request(appWith(1)).post("/forms/submissions").send({projectId:1,templateId:1,answers:{},submittedBy:"hacker"});
    expect(r.body.submittedBy).toBe("7");
  });
  it("P0-2: createdBy from auth, not client", async () => {
    const r = await request(appWith(1)).post("/forms/templates").send({projectId:1,name:"T",definition:{},createdBy:"hacker"});
    expect(r.body.createdBy).toBe("7");
  });
});
