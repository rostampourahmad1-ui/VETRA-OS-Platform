import { describe, expect, it, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

/* ──────────────────────── Mock layer ──────────────────────── */

const mocks = vi.hoisted(() => {
  type Row = Record<string, any>;
  type Table = Record<string, any> & { __name: string };

  const makeTable = (name: string, fields: string[]): Table => {
    const t: Table = { __name: name };
    for (const f of fields) t[f] = { __table: name, __field: f };
    return t;
  };

  const tables = {
    formTemplatesTable: makeTable("form_templates", [
      "id", "organizationId", "projectId", "workflowId", "name", "description", "definition",
      "status", "createdBy", "updatedBy", "deletedAt", "createdAt", "updatedAt",
    ]),
    formTemplateVersionsTable: makeTable("form_template_versions", [
      "id", "organizationId", "templateId", "version", "definition", "publishedBy", "createdAt",
    ]),
    formSubmissionsTable: makeTable("form_submissions", [
      "id", "organizationId", "projectId", "templateId", "templateVersionId", "answers", "status",
      "submittedBy", "submittedAt", "workflowRunId", "deletedAt", "createdAt", "updatedAt",
    ]),
    workflowsTable: makeTable("workflows", ["id", "organizationId", "entityType", "active"]),
    workflowStepsTable: makeTable("workflow_steps", ["id", "workflowId", "stepOrder", "name"]),
    workflowRunsTable: makeTable("workflow_runs", [
      "id", "organizationId", "workflowId", "entityType", "entityId", "status", "currentStep",
      "submittedBy", "updatedBy", "payload", "completedAt", "createdAt", "updatedAt",
    ]),
    workflowRunEventsTable: makeTable("workflow_run_events", [
      "id", "organizationId", "workflowRunId", "workflowStepId", "action", "comment", "actorId", "createdAt",
    ]),
  };

  const rows = new Map<Table, Row[]>();
  let idSeq = 3000;

  const valueOf = (col: any, pair: { source: Row; sourceTable: Table }) => {
    if (!col || !col.__field) return col;
    if (col.__table === pair.sourceTable.__name) return pair.source[col.__field];
    return undefined;
  };

  const evaluate = (expr: any, pair: { source: Row; sourceTable: Table }): boolean => {
    if (!expr) return true;
    if (Array.isArray(expr)) return expr.every((e: any) => evaluate(e, pair));
    if (expr.kind === "eq") return valueOf(expr.left, pair) === expr.right;
    if (expr.kind === "isNull") return valueOf(expr.col, pair) == null;
    return true;
  };

  function makeDb() {
    return {
      select: vi.fn(() => {
        let table: Table;
        let whereClause: any;
        let orderCol: any;
        let orderDir = "asc";
        const query: any = {
          from(v: Table) { table = v; return this; },
          where(c: any) { whereClause = c; return this; },
          orderBy(spec: any) {
            if (spec && spec.__desc) { orderCol = spec.col; orderDir = "desc"; }
            else { orderCol = spec; orderDir = "asc"; }
            return query;
          },
          then(resolve: any, reject?: any) {
            let data = rows.get(table) ?? [];
            if (whereClause) data = data.filter((r) => evaluate(whereClause, { source: r, sourceTable: table }));
            if (orderCol && orderCol.__field) {
              const field = orderCol.__field;
              data = [...data].sort((a, b) => {
                const av = a[field], bv = b[field];
                const cmp = av > bv ? 1 : av < bv ? -1 : 0;
                return orderDir === "desc" ? -cmp : cmp;
              });
            }
            return Promise.resolve(data).then(resolve, reject);
          },
        };
        return query;
      }),
      insert: vi.fn((table: Table) => {
        let valuesClause: any;
        const chain: any = {
          values(c: any) { valuesClause = c; return chain; },
          returning() {
            if (valuesClause) {
              const row = { id: idSeq++, status: "draft", ...valuesClause, createdAt: new Date(), updatedAt: new Date() };
              if (!rows.has(table)) rows.set(table, []);
              rows.get(table)!.push(row);
              return Promise.resolve([row]);
            }
            return Promise.resolve([]);
          },
        };
        return chain;
      }),
      update: vi.fn((table: Table) => {
        let setClause: any;
        let whereClause: any;
        const chain: any = {
          set(c: any) { setClause = c; return chain; },
          where(c: any) { whereClause = c; return chain; },
          returning() {
            let data = rows.get(table) ?? [];
            if (whereClause) data = data.filter((r) => evaluate(whereClause, { source: r, sourceTable: table }));
            for (const row of data) Object.assign(row, setClause);
            return Promise.resolve(data);
          },
        };
        return chain;
      }),
    };
  }

  const dbHandle: any = makeDb();

  return { tables, rows, db: dbHandle };
});

const { tables, rows, db } = mocks;

vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ kind: "eq", left, right }),
  and: (...args: any[]) => args,
  isNull: (col: any) => ({ kind: "isNull", col }),
  asc: (col: any) => col,
  desc: (col: any) => ({ __desc: true, col }),
}));
vi.mock("@workspace/api-zod", () => ({
  GetFormSubmissionsIdParams: { safeParse: (v: any) => { const id = Number(v?.id); return Number.isSafeInteger(id) && id > 0 ? { success: true, data: { id } } : { success: false, error: { message: "invalid" } }; } },
  GetFormsTemplatesIdParams: { safeParse: (v: any) => { const id = Number(v?.id); return Number.isSafeInteger(id) && id > 0 ? { success: true, data: { id } } : { success: false, error: { message: "invalid" } }; } },
  PatchFormSubmissionsIdBody: { safeParse: (v: any) => (v && typeof v.answers === "object" ? { success: true, data: v } : { success: false, error: { message: "invalid" } }) },
  PatchFormsTemplatesIdBody: { safeParse: (v: any) => ({ success: true, data: v ?? {} }) },
  PostFormSubmissionsBody: {
    safeParse: (v: any) => (v && typeof v.templateId === "number" && v.answers && typeof v.answers === "object"
      ? { success: true, data: v }
      : { success: false, error: { message: "templateId and answers are required" } }),
  },
  PostFormsTemplatesBody: {
    safeParse: (v: any) => (v && typeof v.name === "string" && v.definition
      ? { success: true, data: v }
      : { success: false, error: { message: "name and definition are required" } }),
  },
}));
vi.mock("../../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../artifacts/api-server/src/middlewares/tenant", () => ({
  tenantId: (req: any) => req.organizationId,
  ownedProject: vi.fn().mockResolvedValue(true),
}));
vi.mock("../../artifacts/api-server/src/lib/audit", () => ({ audit: vi.fn() }));

import formsRouter from "../../artifacts/api-server/src/routes/forms";

/* ──────────────────────── Helpers ──────────────────────── */

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 7, organizationId: 1, role: "ENGINEER" };
    next();
  });
  a.use(formsRouter);
  return a;
}

const SIMPLE_DEFINITION = {
  fields: [{ id: "f1", label: "Name", type: "text", required: true }],
};

function seedDraftTemplate(overrides: Partial<Record<string, any>> = {}) {
  const row = {
    id: 1, organizationId: 1, projectId: null, workflowId: null, name: "Safety Checklist",
    description: null, definition: SIMPLE_DEFINITION, status: "draft", createdBy: 7, updatedBy: 7,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
  rows.set(tables.formTemplatesTable, [row]);
  return row;
}

/* ──────────────────────── Tests ──────────────────────── */

describe("Phase 1 Step 4: Forms & Workflow", () => {
  beforeEach(() => rows.clear());

  // ---------- Template CRUD ----------
  it("creates a form template as draft", async () => {
    const res = await request(app()).post("/forms/templates").send({
      name: "Safety Checklist", definition: SIMPLE_DEFINITION,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
  });

  it("rejects template creation missing required fields", async () => {
    const res = await request(app()).post("/forms/templates").send({ name: "No definition" });
    expect(res.status).toBe(400);
  });

  it("lists templates scoped to tenant", async () => {
    rows.set(tables.formTemplatesTable, [
      { id: 1, organizationId: 1, name: "A", status: "draft", definition: SIMPLE_DEFINITION, deletedAt: null },
      { id: 2, organizationId: 2, name: "B", status: "draft", definition: SIMPLE_DEFINITION, deletedAt: null },
    ]);
    const res = await request(app()).get("/forms/templates");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns template with its versions", async () => {
    seedDraftTemplate();
    rows.set(tables.formTemplateVersionsTable, [
      { id: 1, organizationId: 1, templateId: 1, version: 1, definition: SIMPLE_DEFINITION, publishedBy: 7, createdAt: new Date() },
    ]);
    const res = await request(app()).get("/forms/templates/1");
    expect(res.status).toBe(200);
    expect(res.body.versions).toHaveLength(1);
  });

  it("allows editing a draft template", async () => {
    seedDraftTemplate();
    const res = await request(app()).patch("/forms/templates/1").send({ name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
  });

  // ---------- Publish lifecycle ----------
  it("publishes a draft template, creating version 1", async () => {
    seedDraftTemplate();
    const res = await request(app()).post("/forms/templates/1/publish");
    expect(res.status).toBe(200);
    expect(res.body.template.status).toBe("published");
    expect(res.body.version.version).toBe(1);
  });

  it("rejects publishing an already-published template", async () => {
    seedDraftTemplate({ status: "published" });
    const res = await request(app()).post("/forms/templates/1/publish");
    expect(res.status).toBe(409);
  });

  it("rejects editing a published template", async () => {
    seedDraftTemplate({ status: "published" });
    const res = await request(app()).patch("/forms/templates/1").send({ name: "Hack" });
    expect(res.status).toBe(409);
  });

  // ---------- Duplicate ----------
  it("duplicates a template with (Copy) suffix", async () => {
    seedDraftTemplate();
    const res = await request(app()).post("/forms/templates/1/duplicate");
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Safety Checklist (Copy)");
    expect(res.body.status).toBe("draft");
  });

  // ---------- Archive ----------
  it("archives a published template", async () => {
    seedDraftTemplate({ status: "published" });
    const res = await request(app()).post("/forms/templates/1/archive");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("archived");
  });

  it("rejects archiving a draft template", async () => {
    seedDraftTemplate();
    const res = await request(app()).post("/forms/templates/1/archive");
    expect(res.status).toBe(409);
  });

  // ---------- Delete ----------
  it("soft-deletes a draft template", async () => {
    seedDraftTemplate();
    const res = await request(app()).delete("/forms/templates/1");
    expect(res.status).toBe(204);
    const [row] = rows.get(tables.formTemplatesTable)!;
    expect(row.deletedAt).not.toBeNull();
  });

  it("rejects deleting a published template", async () => {
    seedDraftTemplate({ status: "published" });
    const res = await request(app()).delete("/forms/templates/1");
    expect(res.status).toBe(409);
  });

  // ---------- Form submissions ----------
  it("rejects submission creation for a non-published template", async () => {
    seedDraftTemplate();
    const res = await request(app()).post("/form-submissions").send({
      templateId: 1, answers: { f1: "value" },
    });
    expect(res.status).toBe(404);
  });

  it("creates a submission for a published template", async () => {
    seedDraftTemplate({ status: "published" });
    rows.set(tables.formTemplateVersionsTable, [
      { id: 1, organizationId: 1, templateId: 1, version: 1, definition: SIMPLE_DEFINITION, publishedBy: 7, createdAt: new Date() },
    ]);
    const res = await request(app()).post("/form-submissions").send({
      templateId: 1, answers: { f1: "value" },
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("draft");
  });

  it("rejects submission missing required answers", async () => {
    seedDraftTemplate({ status: "published" });
    rows.set(tables.formTemplateVersionsTable, [
      { id: 1, organizationId: 1, templateId: 1, version: 1, definition: SIMPLE_DEFINITION, publishedBy: 7, createdAt: new Date() },
    ]);
    const res = await request(app()).post("/form-submissions").send({ templateId: 1, answers: {} });
    expect(res.status).toBe(400);
  });

  it("lists submissions scoped to tenant", async () => {
    rows.set(tables.formSubmissionsTable, [
      { id: 1, organizationId: 1, templateId: 1, status: "draft", answers: {}, deletedAt: null },
      { id: 2, organizationId: 2, templateId: 1, status: "draft", answers: {}, deletedAt: null },
    ]);
    const res = await request(app()).get("/form-submissions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  // ---------- Submit + workflow creation ----------
  it("submits a draft submission and creates a workflow run when template has a workflow", async () => {
    seedDraftTemplate({ status: "published", workflowId: 10 });
    rows.set(tables.formTemplateVersionsTable, [
      { id: 1, organizationId: 1, templateId: 1, version: 1, definition: SIMPLE_DEFINITION, publishedBy: 7, createdAt: new Date() },
    ]);
    rows.set(tables.formSubmissionsTable, [
      { id: 1, organizationId: 1, projectId: null, templateId: 1, templateVersionId: 1, answers: { f1: "value" }, status: "draft", submittedBy: 7, workflowRunId: null, deletedAt: null },
    ]);
    rows.set(tables.workflowsTable, [{ id: 10, organizationId: 1, entityType: "form_submission", active: 1 }]);
    rows.set(tables.workflowStepsTable, [{ id: 1, workflowId: 10, stepOrder: 1, name: "Review" }]);

    const res = await request(app()).post("/form-submissions/1/submit");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
    expect(res.body.workflowRunId).toBeDefined();
    expect(rows.get(tables.workflowRunsTable)).toHaveLength(1);
  });

  it("blocks a non-submitter from submitting someone else's form", async () => {
    seedDraftTemplate({ status: "published" });
    rows.set(tables.formTemplateVersionsTable, [
      { id: 1, organizationId: 1, templateId: 1, version: 1, definition: SIMPLE_DEFINITION, publishedBy: 7, createdAt: new Date() },
    ]);
    rows.set(tables.formSubmissionsTable, [
      { id: 1, organizationId: 1, templateId: 1, templateVersionId: 1, answers: { f1: "value" }, status: "draft", submittedBy: 99, workflowRunId: null, deletedAt: null },
    ]);
    const res = await request(app()).post("/form-submissions/1/submit");
    expect(res.status).toBe(403);
  });

  // ---------- Bulk approve ----------
  it("bulk-approves eligible submissions and advances workflow run", async () => {
    rows.set(tables.formSubmissionsTable, [
      { id: 1, organizationId: 1, templateId: 1, status: "submitted", workflowRunId: 1, deletedAt: null, answers: {} },
    ]);
    rows.set(tables.workflowRunsTable, [
      { id: 1, organizationId: 1, workflowId: 10, entityType: "form_submission", entityId: 1, status: "pending", currentStep: 1, updatedAt: new Date() },
    ]);
    rows.set(tables.workflowStepsTable, [{ id: 1, workflowId: 10, stepOrder: 1, name: "Review" }]);

    const res = await request(app()).post("/form-submissions/bulk-approve").send({ submissionIds: [1] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
    const [run] = rows.get(tables.workflowRunsTable)!;
    expect(run.status).toBe("approved");
  });

  it("rejects bulk-approve with empty submissionIds", async () => {
    const res = await request(app()).post("/form-submissions/bulk-approve").send({ submissionIds: [] });
    expect(res.status).toBe(400);
  });

  it("rejects bulk-approve with more than 50 ids", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    const res = await request(app()).post("/form-submissions/bulk-approve").send({ submissionIds: ids });
    expect(res.status).toBe(400);
  });

  it("reports ineligible submissions in bulk-approve results", async () => {
    rows.set(tables.formSubmissionsTable, [
      { id: 2, organizationId: 1, templateId: 1, status: "approved", workflowRunId: 1, deletedAt: null, answers: {} },
    ]);
    const res = await request(app()).post("/form-submissions/bulk-approve").send({ submissionIds: [2] });
    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(false);
  });

  // ---------- Analytics ----------
  it("computes forms analytics: approval rate, cycle time, bottlenecks", async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000);
    rows.set(tables.formSubmissionsTable, [
      { id: 1, organizationId: 1, templateId: 1, status: "approved", submittedAt: twoHoursAgo, updatedAt: now, deletedAt: null },
      { id: 2, organizationId: 1, templateId: 1, status: "rejected", submittedAt: twoHoursAgo, updatedAt: now, deletedAt: null },
      { id: 3, organizationId: 1, templateId: 2, status: "submitted", submittedAt: now, updatedAt: now, deletedAt: null },
    ]);
    rows.set(tables.formTemplatesTable, [
      { id: 1, organizationId: 1, name: "T1", status: "published", deletedAt: null },
      { id: 2, organizationId: 1, name: "T2", status: "published", deletedAt: null },
    ]);
    rows.set(tables.workflowRunsTable, [
      { id: 1, organizationId: 1, workflowId: 10, entityType: "form_submission", entityId: 3, status: "pending", currentStep: 1, updatedAt: twoHoursAgo },
    ]);
    rows.set(tables.workflowStepsTable, [{ id: 1, workflowId: 10, stepOrder: 1, name: "Review" }]);

    const res = await request(app()).get("/forms/analytics");
    expect(res.status).toBe(200);
    expect(res.body.totalSubmissions).toBe(3);
    expect(res.body.approvalRate).toBe(50);
    expect(res.body.avgCycleTimeHours).toBeCloseTo(2, 1);
    expect(res.body.submissionsByTemplate.length).toBeGreaterThan(0);
    expect(res.body.bottlenecks.length).toBeGreaterThan(0);
    expect(res.body.bottlenecks[0].stepName).toBe("Review");
  });
});
