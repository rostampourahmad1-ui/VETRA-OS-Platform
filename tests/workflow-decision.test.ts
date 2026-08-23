import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const table = (name: string, fields: string[]) => Object.fromEntries([
    ["__name", name],
    ...fields.map((field) => [field, { __table: name, __field: field }]),
  ]);
  const tables = {
    workflowsTable: table("workflows", ["id", "organizationId", "active", "deletedAt"]),
    workflowRunsTable: table("workflowRuns", ["id", "organizationId", "workflowId", "currentStep", "status", "entityType", "entityId"]),
    workflowStepsTable: table("workflowSteps", ["id", "workflowId", "stepOrder", "requiredPermission", "approvalType", "requiredApprovals"]),
    workflowRunEventsTable: table("workflowRunEvents", ["id", "organizationId"]),
    formSubmissionsTable: table("formSubmissions", ["id", "organizationId", "workflowRunId", "deletedAt"]),
  };
  const rows: Record<string, Record<string, unknown>[]> = {
    workflowRuns: [{ id: 81, organizationId: 1, workflowId: 9, currentStep: 1, status: "pending", entityType: "form_submission", entityId: 51 }],
    workflowSteps: [{ id: 91, workflowId: 9, stepOrder: 1, requiredPermission: "quality.approve", approvalType: "single", requiredApprovals: 1 }],
  };
  const db = {
    select() {
      let source = "";
      const builder: any = {
        from(input: { __name: string }) { source = input.__name; return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        then(resolve: (value: Record<string, unknown>[]) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(rows[source] ?? []).then(resolve, reject);
        },
      };
      return builder;
    },
    update: vi.fn(),
    insert: vi.fn(),
  };
  return { db, tables, hasPermission: vi.fn() };
});

vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({
  and: (...items: unknown[]) => items,
  asc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => ({ left, right }),
  isNull: (value: unknown) => value,
}));
vi.mock("../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  hasPermission: mocks.hasPermission,
}));
vi.mock("../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../artifacts/api-server/src/middlewares/tenant", () => ({
  tenantId: (req: { organizationId: number }) => req.organizationId,
}));
vi.mock("../artifacts/api-server/src/lib/audit", () => ({ audit: vi.fn() }));

import workflowsRouter from "../artifacts/api-server/src/routes/workflows";

function appWithWorkflow(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 11, organizationId: 1, role: "Supervisor" };
    next();
  });
  app.use(workflowsRouter);
  return app;
}

describe("workflow approval hardening", () => {
  beforeEach(() => mocks.hasPermission.mockReset());

  it("rejects an approver who lacks the current step's required permission", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const response = await request(appWithWorkflow())
      .post("/workflow-runs/81/decision")
      .send({ decision: "approve" });

    expect(response.status).toBe(403);
    expect(response.body.permission).toBe("quality.approve");
    expect(mocks.hasPermission).toHaveBeenCalledWith(11, 1, "quality.approve");
  });

  it("requires an explanatory comment for revision requests before querying a run", async () => {
    const response = await request(appWithWorkflow())
      .post("/workflow-runs/81/decision")
      .send({ decision: "request_revision" });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("requires a comment");
    expect(mocks.hasPermission).not.toHaveBeenCalled();
  });
});

describe("workflow approval gate", () => {
  beforeEach(() => {
    mocks.hasPermission.mockReset();
    mocks.hasPermission.mockResolvedValue(true);
    mocks.db.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) }) });
    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 81, currentStep: 1, status: "pending", updatedAt: new Date().toISOString() }])
        })
      })
    });
  });

  it("passes a single-approval step immediately (default type)", async () => {
    const newRows = {
      workflowRuns: [{ id: 81, organizationId: 1, workflowId: 9, currentStep: 1, status: "pending", entityType: "form_submission", entityId: 51 }],
      workflowSteps: [{ id: 91, workflowId: 9, stepOrder: 1, requiredPermission: "quality.approve", approvalType: "single", requiredApprovals: 1 }],
      workflowRunEvents: [],
    };
    mocks.db.select = vi.fn(() => {
      let source = "";
      const builder = {
        from(input) { source = input.__name; return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        then(resolve) { return Promise.resolve(newRows[source] ?? []).then(resolve); },
      };
      return builder;
    });
    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 81, currentStep: 2, status: "pending", updatedAt: new Date().toISOString() }])
        })
      })
    });

    const response = await request(appWithWorkflow())
      .post("/workflow-runs/81/decision")
      .send({ decision: "approve", comment: "Approved" });

    expect(response.status).toBe(200);
  });

  it("holds at a step when the any-type gate has not collected enough approvals", async () => {
    const newRows = {
      workflowRuns: [{ id: 81, organizationId: 1, workflowId: 9, currentStep: 1, status: "pending", entityType: "form_submission", entityId: 51 }],
      workflowSteps: [{ id: 91, workflowId: 9, stepOrder: 1, requiredPermission: "quality.approve", approvalType: "any", requiredApprovals: 2 }],
      workflowRunEvents: [{ id: 1, workflowRunId: 81, workflowStepId: 91, action: "approve", actorId: 11 }],
    };
    mocks.db.select = vi.fn(() => {
      let source = "";
      const builder = {
        from(input) { source = input.__name; return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        then(resolve) { return Promise.resolve(newRows[source] ?? []).then(resolve); },
      };
      return builder;
    });
    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 81, currentStep: 1, status: "pending", updatedAt: new Date().toISOString() }])
        })
      })
    });

    const response = await request(appWithWorkflow())
      .post("/workflow-runs/81/decision")
      .send({ decision: "approve", comment: "First approval" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("pending");
    expect(response.body.currentStep).toBe(1);
  });

  it("advances when the any-type gate has collected enough approvals", async () => {
    const newRows = {
      workflowRuns: [{ id: 81, organizationId: 1, workflowId: 9, currentStep: 1, status: "pending", entityType: "form_submission", entityId: 51 }],
      workflowSteps: [
        { id: 91, workflowId: 9, stepOrder: 1, requiredPermission: "quality.approve", approvalType: "any", requiredApprovals: 2 },
        { id: 92, workflowId: 9, stepOrder: 2, requiredPermission: "quality.approve", approvalType: "single", requiredApprovals: 1 },
      ],
      workflowRunEvents: [
        { id: 1, workflowRunId: 81, workflowStepId: 91, action: "approve", actorId: 11 },
        { id: 2, workflowRunId: 81, workflowStepId: 91, action: "approve", actorId: 12 },
      ],
    };
    mocks.db.select = vi.fn(() => {
      let source = "";
      const builder = {
        from(input) { source = input.__name; return builder; },
        where() { return builder; },
        orderBy() { return builder; },
        then(resolve) { return Promise.resolve(newRows[source] ?? []).then(resolve); },
      };
      return builder;
    });
    mocks.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 81, currentStep: 2, status: "pending", updatedAt: new Date().toISOString() }])
        })
      })
    });

    const response = await request(appWithWorkflow())
      .post("/workflow-runs/81/decision")
      .send({ decision: "approve", comment: "Third approval, gate met" });

    expect(response.status).toBe(200);
    expect(response.body.currentStep).toBe(2);
  });
});
