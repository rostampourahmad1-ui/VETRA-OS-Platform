import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Row = Record<string, any>;
  type Table = Record<string, any> & { __name: string };

  const makeTable = (name: string, fields: string[]): Table => {
    const table: Table = { __name: name };
    for (const field of fields) table[field] = { __table: name, __field: field };
    return table;
  };

  const tables = {
    projectsTable: makeTable("projects", ["id", "name", "status", "progress", "budget", "spent", "endDate", "organizationId", "managerId", "createdAt"]),
    tasksTable: makeTable("tasks", ["id", "title", "status", "priority", "projectId", "organizationId", "assigneeId", "dueDate", "createdAt"]),
    usersTable: makeTable("users", ["id", "name", "email", "role", "active", "organizationId", "createdAt"]),
    equipmentTable: makeTable("equipment", ["id", "name", "type", "model", "serialNumber", "status", "location", "projectId", "organizationId", "nextMaintenance", "createdAt"]),
    activityTable: makeTable("activity", ["id", "type", "description", "user", "projectName", "organizationId", "createdAt"]),
    documentsTable: makeTable("documents", ["id", "name", "type", "size", "projectId", "organizationId", "uploadedBy", "url", "storagePath", "createdAt"]),
    contractsTable: makeTable("contracts", ["id", "name", "contractor", "value", "status", "type", "projectId", "organizationId", "startDate", "endDate", "signedDate", "createdAt"]),
    clientsTable: makeTable("clients", ["id", "name", "company", "email", "organizationId", "createdAt"]),
    dailyReportsTable: makeTable("dailyReports", ["id", "date", "weather", "temperature", "progress", "workersOnSite", "issues", "notes", "projectId", "organizationId", "createdBy", "createdAt"]),
    meetingsTable: makeTable("meetings", ["id", "title", "date", "location", "status", "agenda", "minutes", "attendees", "projectId", "organizationId", "organizer", "createdAt"]),
    inventoryTable: makeTable("inventory", ["id", "name", "category", "quantity", "unit", "minStock", "projectId", "organizationId", "supplier", "unitCost", "createdAt"]),
    procurementTable: makeTable("procurement", ["id", "title", "supplier", "totalAmount", "status", "projectId", "organizationId", "requestedBy", "approvedBy", "deliveryDate", "notes", "createdAt"]),
    expensesTable: makeTable("expenses", ["id", "organizationId", "projectId", "amount", "description", "createdAt"]),
    organizationsTable: makeTable("organizations", ["id", "name"]),
    formTemplatesTable: makeTable("formTemplates", ["id", "organizationId", "projectId", "workflowId", "name", "description", "status", "definition", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"]),
    formTemplateVersionsTable: makeTable("formTemplateVersions", ["id", "organizationId", "templateId", "version", "definition", "publishedBy", "createdAt"]),
    formSubmissionsTable: makeTable("formSubmissions", ["id", "organizationId", "projectId", "templateId", "templateVersionId", "workflowRunId", "status", "answers", "submittedBy", "submittedAt", "createdAt", "updatedAt", "deletedAt"]),
    workflowsTable: makeTable("workflows", ["id", "organizationId", "name", "entityType", "active", "createdBy", "updatedBy", "createdAt", "updatedAt", "deletedAt"]),
    workflowStepsTable: makeTable("workflowSteps", ["id", "workflowId", "stepOrder", "name", "requiredPermission", "status"]),
    workflowRunsTable: makeTable("workflowRuns", ["id", "organizationId", "workflowId", "entityType", "entityId", "currentStep", "status", "submittedBy", "updatedBy", "payload", "createdAt", "updatedAt", "completedAt"]),
    workflowRunEventsTable: makeTable("workflowRunEvents", ["id", "organizationId", "workflowRunId", "workflowStepId", "action", "comment", "actorId", "createdAt"]),
  };

  const rows = new Map<Table, Row[]>();

  const valueOf = (column: any, pair: { source: Row; sourceTable: Table; joined?: Row; joinedTable?: Table }) => {
    if (!column || !column.__field) return column;
    if (column.__table === pair.sourceTable.__name) return pair.source[column.__field];
    if (pair.joinedTable && column.__table === pair.joinedTable.__name) return pair.joined?.[column.__field];
    return undefined;
  };

  const evaluate = (expression: any, pair: { source: Row; sourceTable: Table; joined?: Row; joinedTable?: Table }): boolean => {
    if (!expression) return true;
    if (expression.kind === "and") return expression.items.every((item: any) => evaluate(item, pair));
    if (expression.kind === "or") return expression.items.some((item: any) => evaluate(item, pair));
    if (expression.kind === "eq") return valueOf(expression.left, pair) === valueOf(expression.right, pair);
    if (expression.kind === "ilike") {
      const actual = String(valueOf(expression.left, pair) ?? "").toLowerCase();
      const needle = String(expression.pattern).replace(/^%|%$/g, "").toLowerCase();
      return actual.includes(needle);
    }
    if (Array.isArray(expression.queryChunks)) {
      const chunks = expression.queryChunks as any[];
      const nested = chunks.filter((chunk) => Array.isArray(chunk?.queryChunks));
      const sqlText = chunks
        .map((chunk) => (Array.isArray(chunk?.value) ? chunk.value.join("") : ""))
        .join("")
        .toLowerCase();
      if (nested.length === 1 && !sqlText.includes(" and ") && !sqlText.includes(" or ")) {
        return evaluate(nested[0], pair);
      }
      if (sqlText.includes(" and ")) return nested.every((item) => evaluate(item, pair));
      if (sqlText.includes(" or ")) return nested.some((item) => evaluate(item, pair));
      const column = chunks.find((chunk) => chunk?.__field);
      const parameter = chunks.find((chunk) => chunk !== column && (
        typeof chunk === "string"
        || typeof chunk === "number"
        || (chunk?.value !== undefined && !Array.isArray(chunk.value))
      ));
      if (sqlText.includes(" ilike ")) {
        const actual = String(valueOf(column, pair) ?? "").toLowerCase();
        const expected = String(parameter?.value ?? parameter ?? "").replace(/^%|%$/g, "").toLowerCase();
        return actual.includes(expected);
      }
      if (sqlText.includes(" = ")) return valueOf(column, pair) === (parameter?.value ?? parameter);
    }
    return true;
  };

  const executeSelect = (selection: any, sourceTable: Table, condition: any, joinedTable?: Table, joinCondition?: any, limit?: number) => {
    let pairs = (rows.get(sourceTable) ?? []).map((source) => ({ source, sourceTable }));
    if (joinedTable) {
      const joinedRows = rows.get(joinedTable) ?? [];
      pairs = pairs.flatMap((pair) => joinedRows
        .filter((joined) => evaluate(joinCondition, { ...pair, joined, joinedTable }))
        .map((joined) => ({ ...pair, joined, joinedTable })));
    }
    pairs = pairs.filter((pair) => evaluate(condition, pair));
    if (limit !== undefined) pairs = pairs.slice(0, limit);
    return pairs.map((pair) => {
      if (!selection) {
        return pair.joined
          ? { [pair.sourceTable.__name]: pair.source, [pair.joinedTable?.__name ?? "joined"]: pair.joined }
          : pair.source;
      }
      const result: Row = {};
      for (const [key, column] of Object.entries(selection)) result[key] = valueOf(column, pair);
      return result;
    });
  };

  const db = {
    select(selection?: any) {
      let sourceTable: Table | undefined;
      let joinedTable: Table | undefined;
      let joinCondition: any;
      let condition: any;
      let limit: number | undefined;
      const builder: any = {
        from(table: Table) {
          sourceTable = table;
          return builder;
        },
        innerJoin(table: Table, expression: any) {
          joinedTable = table;
          joinCondition = expression;
          return builder;
        },
        where(expression: any) {
          condition = expression;
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit(value: number) {
          limit = value;
          return builder;
        },
        then(resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) {
          try {
            const result = executeSelect(selection, sourceTable!, condition, joinedTable, joinCondition, limit);
            return Promise.resolve(result).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return builder;
    },
    insert(table: Table) {
      let values: Row | Row[] = {};
      return {
        values(input: Row | Row[]) {
          values = input;
          return this;
        },
        returning() {
          const inserted = (Array.isArray(values) ? values : [values]).map((row) => ({ ...row }));
          rows.set(table, [...(rows.get(table) ?? []), ...inserted]);
          return Promise.resolve(inserted);
        },
      };
    },
    update(table: Table) {
      let values: Row = {};
      let condition: any;
      return {
        set(input: Row) {
          values = input;
          return this;
        },
        where(expression: any) {
          condition = expression;
          return this;
        },
        returning() {
          const updated = (rows.get(table) ?? []).filter((source) => evaluate(condition, { source, sourceTable: table }));
          updated.forEach((source) => Object.assign(source, values));
          return Promise.resolve(updated.map((row) => ({ ...row })));
        },
      };
    },
    delete(table: Table) {
      let condition: any;
      return {
        where(expression: any) {
          condition = expression;
          const current = rows.get(table) ?? [];
          const kept = current.filter((source) => !evaluate(condition, { source, sourceTable: table }));
          rows.set(table, kept);
          return Promise.resolve({ rowCount: current.length - kept.length });
        },
      };
    },
  };

  const drizzle = {
    eq: (left: any, right: any) => ({ kind: "eq", left, right }),
    and: (...items: any[]) => ({ kind: "and", items }),
    or: (...items: any[]) => ({ kind: "or", items }),
    ilike: (left: any, pattern: string) => ({ kind: "ilike", left, pattern }),
    sql: () => ({ kind: "sql" }),
  };

  return {
    tables,
    rows,
    db,
    drizzle,
    reset() {
      rows.clear();
    },
  };
});

vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../artifacts/api-server/src/middlewares/tenant", () => ({
  tenantId: (req: any) => req.organizationId,
  ownedProject: async (req: any, projectId: number) =>
    (mocks.rows.get(mocks.tables.projectsTable) ?? []).find(
      (project) => project.id === projectId && project.organizationId === req.organizationId,
    ) ?? null,
}));

import dashboardRouter from "../artifacts/api-server/src/routes/dashboard";
import searchRouter from "../artifacts/api-server/src/routes/search";
import dailyReportsRouter from "../artifacts/api-server/src/routes/daily-reports";
import meetingsRouter from "../artifacts/api-server/src/routes/meetings";
import equipmentRouter from "../artifacts/api-server/src/routes/equipment";
import inventoryRouter from "../artifacts/api-server/src/routes/inventory";
import procurementRouter from "../artifacts/api-server/src/routes/procurement";
import phase2Router from "../artifacts/api-server/src/routes/phase2";
import documentsRouter from "../artifacts/api-server/src/routes/documents";

function appWith(routers: any[], organizationId = 1): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.organizationId = organizationId;
    req.vetraUser = { id: 11, organizationId, role: "CEO" };
    next();
  });
  routers.forEach((router) => app.use(router));
  return app;
}

const date = new Date("2026-08-18T00:00:00.000Z");

describe("cross-tenant isolation", () => {
  beforeEach(() => mocks.reset());

  it("scopes dashboard and global search to the authenticated organization", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [
      { id: 1, name: "Alpha shared", status: "active", progress: "50", budget: "100", spent: "20", endDate: "2026-12-01", organizationId: 1 },
      { id: 2, name: "Beta shared", status: "active", progress: "90", budget: "900", spent: "800", endDate: "2026-12-01", organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.tasksTable, [
      { id: 10, title: "shared task", status: "todo", projectId: 1, organizationId: 1, createdAt: date },
      { id: 20, title: "shared task", status: "todo", projectId: 2, organizationId: 2, createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.usersTable, [
      { id: 11, name: "A", active: true, organizationId: 1 },
      { id: 22, name: "B", active: true, organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.equipmentTable, [
      { id: 30, name: "A crane", status: "in-use", organizationId: 1, createdAt: date },
      { id: 40, name: "B crane", status: "in-use", organizationId: 2, createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.documentsTable, [
      { id: 50, name: "shared drawing", organizationId: 1, projectId: 1, storagePath: null, createdAt: date },
      { id: 60, name: "shared drawing", organizationId: 2, projectId: 2, storagePath: null, createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.contractsTable, [
      { id: 70, name: "shared contract", organizationId: 1, projectId: 1, value: "1", createdAt: date },
      { id: 80, name: "shared contract", organizationId: 2, projectId: 2, value: "2", createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.clientsTable, [
      { id: 90, name: "shared client", organizationId: 1 },
      { id: 91, name: "shared client", organizationId: 2 },
    ]);

    const app = appWith([dashboardRouter, searchRouter]);
    const dashboard = await request(app).get("/dashboard/summary");
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.activeProjects).toBe(1);
    expect(dashboard.body.totalWorkforce).toBe(1);
    expect(dashboard.body.equipmentTotal).toBe(1);
    expect(dashboard.body.openTasks).toBe(1);

    const search = await request(app).get("/search?q=shared");
    expect(search.status).toBe(200);
    expect(search.body).toHaveLength(5);
    expect(search.body.every((item: any) => ![2, 20, 60, 80, 91].includes(item.id))).toBe(true);
  });

  it("scopes daily reports, meetings, equipment, inventory and procurement lists", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [
      { id: 1, name: "Alpha", organizationId: 1 },
      { id: 2, name: "Beta", organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.dailyReportsTable, [
      { id: 101, date: "2026-08-18", weather: "clear", temperature: "20", progress: "10", workersOnSite: 2, projectId: 1, organizationId: 1, createdBy: "11", createdAt: date },
      { id: 102, date: "2026-08-18", weather: "clear", temperature: "20", progress: "90", workersOnSite: 9, projectId: 2, organizationId: 2, createdBy: "22", createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.meetingsTable, [
      { id: 201, title: "A meeting", date, location: "A", status: "scheduled", attendees: "", projectId: 1, organizationId: 1, organizer: "11", createdAt: date },
      { id: 202, title: "B meeting", date, location: "B", status: "scheduled", attendees: "", projectId: 2, organizationId: 2, organizer: "22", createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.equipmentTable, [
      { id: 301, name: "A equipment", type: "crane", status: "available", projectId: 1, organizationId: 1, createdAt: date },
      { id: 302, name: "B equipment", type: "crane", status: "available", projectId: 2, organizationId: 2, createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.inventoryTable, [
      { id: 401, name: "A steel", category: "material", quantity: "2", unit: "ton", projectId: 1, organizationId: 1, createdAt: date },
      { id: 402, name: "B steel", category: "material", quantity: "8", unit: "ton", projectId: 2, organizationId: 2, createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.procurementTable, [
      { id: 501, title: "A order", supplier: "A supplier", totalAmount: "10", status: "draft", projectId: 1, organizationId: 1, requestedBy: "11", createdAt: date },
      { id: 502, title: "B order", supplier: "B supplier", totalAmount: "20", status: "draft", projectId: 2, organizationId: 2, requestedBy: "22", createdAt: date },
    ]);

    const app = appWith([dailyReportsRouter, meetingsRouter, equipmentRouter, inventoryRouter, procurementRouter]);
    for (const path of ["/daily-reports", "/meetings", "/equipment", "/inventory", "/procurement"]) {
      const response = await request(app).get(path);
      expect(response.status, path).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBeGreaterThan(0);
      expect(response.body[0].id % 100).toBe(1);
    }
  });

  it("blocks cross-tenant detail and update operations", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [
      { id: 1, name: "Alpha", organizationId: 1 },
      { id: 2, name: "Beta", organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.dailyReportsTable, [
      { id: 601, date: "2026-08-18", weather: "clear", temperature: "20", progress: "10", workersOnSite: 2, projectId: 2, organizationId: 2, createdBy: "22", createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.meetingsTable, [
      { id: 602, title: "B meeting", date, location: "B", status: "scheduled", attendees: "", projectId: 2, organizationId: 2, organizer: "22", createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.equipmentTable, [
      { id: 603, name: "B equipment", type: "crane", status: "available", projectId: 2, organizationId: 2, createdAt: date },
    ]);
    mocks.rows.set(mocks.tables.procurementTable, [
      { id: 604, title: "B order", supplier: "B supplier", totalAmount: "20", status: "draft", projectId: 2, organizationId: 2, requestedBy: "22", createdAt: date },
    ]);

    const app = appWith([dailyReportsRouter, meetingsRouter, equipmentRouter, procurementRouter]);
    expect((await request(app).get("/daily-reports/601")).status).toBe(404);
    expect((await request(app).patch("/meetings/602").send({ title: "tampered" })).status).toBe(404);
    expect((await request(app).patch("/equipment/603").send({ name: "tampered" })).status).toBe(404);
    expect((await request(app).patch("/procurement/604").send({ status: "approved" })).status).toBe(404);
    expect(mocks.rows.get(mocks.tables.meetingsTable)?.[0].title).toBe("B meeting");
  });

  it("scopes phase2 workspace and report aggregates", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [
      { id: 1, name: "Alpha", status: "active", budget: "100", organizationId: 1 },
      { id: 2, name: "Beta", status: "active", budget: "900", organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.tasksTable, [
      { id: 701, title: "A task", status: "todo", projectId: 1, organizationId: 1 },
      { id: 702, title: "B task", status: "todo", projectId: 2, organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.expensesTable, [
      { id: 801, amount: "25", organizationId: 1, projectId: 1 },
      { id: 802, amount: "900", organizationId: 2, projectId: 2 },
    ]);

    const app = appWith([phase2Router]);
    const workspace = await request(app).get("/workspaces/CEO");
    expect(workspace.status).toBe(200);
    expect(workspace.body.metrics.projects).toBe(1);
    expect(workspace.body.metrics.spent).toBe(25);
    expect(workspace.body.projects.map((project: any) => project.id)).toEqual([1]);

    const report = await request(app).get("/reports/summary");
    expect(report.status).toBe(200);
    expect(report.body.projects.total).toBe(1);
    expect(report.body.tasks.total).toBe(1);
    expect(report.body.costs.spent).toBe(25);
  });

  it("does not allow a tenant to download another tenant's document", async () => {
    mocks.rows.set(mocks.tables.documentsTable, [
      { id: 901, name: "private.txt", organizationId: 2, projectId: 2, storagePath: "C:\\private\\secret.txt", createdAt: date },
    ]);
    const response = await request(appWith([documentsRouter])).get("/documents/901/download");
    expect(response.status).toBe(404);
  });
});

