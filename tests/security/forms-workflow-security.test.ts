import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  let storedRows: Record<string, Row[]> = {};

  const table = (name: string, fields: string[]) => {
    const t: Record<string, unknown> & { __name: string } = { __name: name };
    for (const f of fields) t[f] = { __table: name, __field: f };
    return t;
  };

  const tables = {
    formTemplatesTable: table("formTemplates", ["id", "organizationId", "name", "description", "status", "definition", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"]),
    formTemplateVersionsTable: table("formTemplateVersions", ["id", "organizationId", "templateId", "version", "definition", "publishedBy", "createdAt"]),
    formSubmissionsTable: table("formSubmissions", ["id", "organizationId", "templateId", "templateVersionId", "workflowRunId", "status", "answers", "submittedBy", "submittedAt", "createdAt", "updatedAt", "deletedAt"]),
    workflowsTable: table("workflows", ["id", "organizationId", "name", "entityType", "active", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"]),
    workflowStepsTable: table("workflowSteps", ["id", "workflowId", "stepOrder", "name", "requiredPermission", "approvalType", "requiredApprovals", "status"]),
    workflowRunsTable: table("workflowRuns", ["id", "organizationId", "workflowId", "entityType", "entityId", "currentStep", "status", "submittedBy", "updatedBy", "payload", "createdAt", "updatedAt", "completedAt"]),
    workflowRunEventsTable: table("workflowRunEvents", ["id", "organizationId", "workflowRunId", "workflowStepId", "action", "comment", "actorId", "createdAt"]),
  };

  const db = {
    select() {
      let src = "";
      return { from(s: { __name: string }) { src = s.__name; return this; }, where() { return this; }, orderBy() { return this; }, then(r: (v: Row[]) => unknown) { return Promise.resolve(storedRows[src] ?? []).then(r); } };
    },
    insert: vi.fn(() => ({ values: vi.fn((vals: Row | Row[]) => ({ returning: vi.fn(() => Promise.resolve(Array.isArray(vals) ? vals : [vals])) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 1, currentStep: 1, status: "pending", updatedAt: new Date().toISOString() }])) })) })) })),
    delete: vi.fn(),
  };

  return {
    db, tables,
    hasPermission: vi.fn().mockResolvedValue(true),
    __setRows: (t: string, rows: Row[]) => { storedRows[t] = rows; },
    __resetRows: () => { storedRows = {}; },
  };
});

vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({ and: (...i: unknown[]) => ({ kind: "and", items: i }), asc: (v: unknown) => v, eq: (l: unknown, r: unknown) => ({ kind: "eq", left: l, right: r }), isNull: (v: unknown) => ({ kind: "isNull", column: v }) }));
vi.mock("../../artifacts/api-server/src/middlewares/permissions", () => ({ requirePermission: () => (_r: unknown, _s: unknown, n: () => void) => n(), hasPermission: (...a: unknown[]) => mocks.hasPermission(...a) }));
vi.mock("../../artifacts/api-server/src/middlewares/requireAuth", () => ({ requireAuth: (_r: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("../../artifacts/api-server/src/middlewares/tenant", () => ({ tenantId: (r: { organizationId: number }) => r.organizationId, ownedProject: async () => true }));
vi.mock("../../artifacts/api-server/src/lib/audit", () => ({ audit: vi.fn() }));

import formsRouter from "../../artifacts/api-server/src/routes/forms";
import workflowsRouter from "../../artifacts/api-server/src/routes/workflows";

function appWith(routers: express.Router[], orgId = 1): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.organizationId = orgId; req.vetraUser = { id: 11, organizationId: orgId, role: "Supervisor" }; next(); });
  for (const r of routers) app.use(r);
  return app;
}

describe("Forms security: client-supplied tenant/actor ignored", () => {
  beforeEach(() => { mocks.hasPermission.mockReset(); mocks.hasPermission.mockResolvedValue(true); mocks.__resetRows(); });

  it("server uses authenticated organization, ignoring body organizationId", async () => {
    expect((await request(appWith([formsRouter])).post("/forms/templates").send({ name: "T", definition: { fields: [{ id: "f1", label: "Field 1", type: "text", required: false }] }, organizationId: 2 })).status).toBe(201);
  });

  it("server uses authenticated user, ignoring body createdBy", async () => {
    expect((await request(appWith([formsRouter])).post("/forms/templates").send({ name: "T", definition: { fields: [{ id: "f1", label: "Field 1", type: "text", required: false }] }, createdBy: 999 })).status).toBe(201);
  });

  it("rejects editing published template", async () => {
    mocks.__setRows("formTemplates", [{ id: 10, organizationId: 1, name: "P", status: "published", definition: { fields: [] }, deletedAt: null }]);
    const r = await request(appWith([formsRouter])).patch("/forms/templates/10").send({ name: "E" });
    expect(r.status).toBe(409); expect(r.body.error).toContain("draft");
  });

  it("rejects editing archived template", async () => {
    mocks.__setRows("formTemplates", [{ id: 11, organizationId: 1, name: "A", status: "archived", definition: { fields: [] }, deletedAt: null }]);
    const r = await request(appWith([formsRouter])).patch("/forms/templates/11").send({ name: "E" });
    expect(r.status).toBe(409); expect(r.body.error).toContain("draft");
  });

  it("allows editing draft template", async () => {
    mocks.__setRows("formTemplates", [{ id: 12, organizationId: 1, name: "D", status: "draft", definition: { fields: [] }, deletedAt: null }]);
    expect((await request(appWith([formsRouter])).patch("/forms/templates/12").send({ name: "U", definition: { fields: [{ id: "f1", label: "Field 1", type: "text", required: false }] } })).status).toBe(200);
  });
});

describe("Workflow security: permission and events", () => {
  beforeEach(() => { mocks.hasPermission.mockReset(); mocks.hasPermission.mockResolvedValue(true); mocks.__resetRows(); });

  it("rejects approver lacking step requiredPermission", async () => {
    mocks.__setRows("workflowRuns", [{ id: 81, organizationId: 1, workflowId: 9, currentStep: 1, status: "pending", entityType: "form_submission", entityId: 51 }]);
    mocks.__setRows("workflowSteps", [{ id: 91, workflowId: 9, stepOrder: 1, requiredPermission: "quality.approve", approvalType: "single", requiredApprovals: 1 }]);
    mocks.hasPermission.mockResolvedValue(false);
    const r = await request(appWith([workflowsRouter])).post("/workflow-runs/81/decision").send({ decision: "approve" });
    expect(r.status).toBe(403); expect(r.body.permission).toBe("quality.approve");
  });

  it("requires comment for request_revision", async () => {
    const r = await request(appWith([workflowsRouter])).post("/workflow-runs/81/decision").send({ decision: "request_revision" });
    expect(r.status).toBe(400); expect(r.body.error).toContain("comment");
  });

  it("creates decision event on approve", async () => {
    mocks.__setRows("workflowRuns", [{ id: 81, organizationId: 1, workflowId: 9, currentStep: 1, status: "pending", entityType: "form_submission", entityId: 51 }]);
    mocks.__setRows("workflowSteps", [{ id: 91, workflowId: 9, stepOrder: 1, requiredPermission: "quality.approve", approvalType: "single", requiredApprovals: 1 }]);
    mocks.__setRows("workflowRunEvents", []);
    const r = await request(appWith([workflowsRouter])).post("/workflow-runs/81/decision").send({ decision: "approve", comment: "OK" });
    expect(r.status).toBe(200);
    expect(mocks.db.insert).toHaveBeenCalled();
  });
});

describe("Forms: submission lifecycle", () => {
  beforeEach(() => { mocks.hasPermission.mockReset(); mocks.hasPermission.mockResolvedValue(true); mocks.__resetRows(); });

  it("rejects submit with missing required field in answers", async () => {
    mocks.__setRows("formTemplates", [{ id: 1, organizationId: 1, name: "T", status: "published", definition: { fields: [{ id: "title", label: "Title", type: "text", required: true }] }, deletedAt: null }]);
    mocks.__setRows("formTemplateVersions", [{ id: 1, organizationId: 1, templateId: 1, version: 1, definition: { fields: [{ id: "title", label: "Title", type: "text", required: true }] }, publishedBy: 1, createdAt: new Date().toISOString() }]);
    mocks.__setRows("formSubmissions", [{ id: 1, organizationId: 1, templateId: 1, templateVersionId: 1, status: "draft", answers: {}, submittedBy: 11, submittedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }]);
    const r = await request(appWith([formsRouter])).post("/form-submissions/1/submit").send();
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("Required");
  });

  it("rejects submit with invalid answer type", async () => {
    mocks.__setRows("formTemplates", [{ id: 1, organizationId: 1, name: "T", status: "published", definition: { fields: [{ id: "qty", label: "Quantity", type: "number", required: false }] }, deletedAt: null }]);
    mocks.__setRows("formTemplateVersions", [{ id: 1, organizationId: 1, templateId: 1, version: 1, definition: { fields: [{ id: "qty", label: "Quantity", type: "number", required: false }] }, publishedBy: 1, createdAt: new Date().toISOString() }]);
    mocks.__setRows("formSubmissions", [{ id: 2, organizationId: 1, templateId: 1, templateVersionId: 1, status: "draft", answers: { qty: "not_a_number" }, submittedBy: 11, submittedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }]);
    const r = await request(appWith([formsRouter])).post("/form-submissions/2/submit").send();
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("Invalid number");
  });

  it("rejects submit from non-owner", async () => {
    mocks.__setRows("formSubmissions", [{ id: 3, organizationId: 1, templateId: 1, templateVersionId: 1, status: "draft", answers: {}, submittedBy: 7, submittedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }]);
    const r = await request(appWith([formsRouter])).post("/form-submissions/3/submit").send();
    expect(r.status).toBe(403);
    expect(r.body.error).toContain("submitter");
  });

  it("rejects submit with wrong current status", async () => {
    mocks.__setRows("formSubmissions", [{ id: 4, organizationId: 1, templateId: 1, templateVersionId: 1, status: "approved", answers: {}, submittedBy: 11, submittedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }]);
    const r = await request(appWith([formsRouter])).post("/form-submissions/4/submit").send();
    expect(r.status).toBe(409);
  });

  it("rejects submit when template not found", async () => {
    mocks.__setRows("formSubmissions", [{ id: 5, organizationId: 1, templateId: 99, templateVersionId: 1, status: "draft", answers: {}, submittedBy: 11, submittedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }]);
    mocks.__setRows("formTemplateVersions", [{ id: 1, organizationId: 1, templateId: 5, templateVersionId: 1, version: 1, definition: { fields: [] }, publishedBy: 1, createdAt: new Date().toISOString() }]);
    const r = await request(appWith([formsRouter])).post("/form-submissions/5/submit").send();
    expect(r.status).toBe(409);
  });
});
