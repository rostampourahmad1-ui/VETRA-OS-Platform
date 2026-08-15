import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tables = Object.fromEntries(["projectsTable", "usersTable", "tasksTable", "budgetsTable", "expensesTable", "expenseCategoriesTable"].map((name) => [name, { name }])) as Record<string, any>;
  const rows = new Map<any, any[]>();
  const db = { select: vi.fn(() => { let table: any; return { from(value: any) { table = value; return this; }, where() { return Promise.resolve(rows.get(table) ?? []); }, then(resolve: any, reject?: any) { return Promise.resolve(rows.get(table) ?? []).then(resolve, reject); } }; }) };
  return { tables, rows, db };
});
const { tables, rows, db } = mocks;
vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: (...args: any[]) => args, ilike: () => ({}) }));
vi.mock("../artifacts/api-server/src/middlewares/permissions", () => ({ requirePermission: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../artifacts/api-server/src/middlewares/tenant", () => ({ tenantId: () => 1 }));

import projectsRouter from "../artifacts/api-server/src/routes/projects";
import tasksRouter from "../artifacts/api-server/src/routes/tasks";
import costRouter from "../artifacts/api-server/src/routes/cost-control";

function appWith(router: any) { const app = express(); app.use(express.json()); app.use((req: any, _res, next) => { req.organizationId = 1; req.vetraUser = { id: 7, organizationId: 1, role: "CEO" }; next(); }); app.use(router); return app; }

describe("tenant-scoped API routes", () => {
  beforeEach(() => rows.clear());
  it("projects route returns only the current organization", async () => {
    rows.set(tables.projectsTable, [{ id: 1, organizationId: 1, name: "Alpha", managerId: 7, progress: "0", budget: "10", spent: "1", createdAt: new Date() }]);
    rows.set(tables.usersTable, [{ id: 7, organizationId: 1, name: "Manager" }]);
    const response = await request(appWith(projectsRouter)).get("/projects");
    expect(response.status).toBe(200); expect(response.body[0].organizationId).toBe(1); expect(response.body[0].managerName).toBe("Manager");
  });
  it("tasks route scopes tasks through organization projects", async () => {
    rows.set(tables.projectsTable, [{ id: 2, organizationId: 1, name: "Alpha" }]);
    rows.set(tables.tasksTable, [{ id: 3, projectId: 2, title: "Pour concrete", status: "todo", priority: "high", createdAt: new Date() }]);
    rows.set(tables.usersTable, []);
    const response = await request(appWith(tasksRouter)).get("/tasks/summary");
    expect(response.status).toBe(200); expect(response.body.total).toBe(1); expect(response.body.todo).toBe(1);
  });
  it("cost-control summary only exposes tenant-owned financial rows", async () => {
    rows.set(tables.budgetsTable, [{ organizationId: 1, amount: "100", projectId: 1 }]);
    rows.set(tables.expensesTable, [{ organizationId: 1, amount: "25", projectId: 1 }]);
    rows.set(tables.expenseCategoriesTable, []);
    const response = await request(appWith(costRouter)).get("/cost-control/summary");
    expect(response.status).toBe(200); expect(response.body.budgetTotal).toBe(100); expect(response.body.spentTotal).toBe(25);
  });
});
