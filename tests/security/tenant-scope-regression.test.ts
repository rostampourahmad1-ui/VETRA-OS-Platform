import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── In-memory DB mock with multi-join support ────────────────────────────────
// Mirrors the shape of drizzle-orm objects consumed by the routes under test.
// Supports: select (multi innerJoin), insert, update (with simple `col +/- n`
// SQL expression evaluation), delete, and transaction().

type Row = Record<string, any>;
type Table = Record<string, any> & { __name: string };

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]): Table => {
    const table: Table = { __name: name };
    for (const field of fields) table[field] = { __table: name, __field: field };
    return table;
  };

  const tables = {
    usersTable: makeTable("users", ["id", "name", "organizationId", "active"]),
    projectsTable: makeTable("projects", ["id", "name", "status", "budget", "spent", "organizationId", "managerId", "createdAt"]),
    employeesTable: makeTable("employees", ["id", "organizationId", "projectId", "userId", "firstName", "deletedAt"]),
    suppliersTable: makeTable("suppliers", ["id", "name", "organizationId"]),
    materialsTable: makeTable("materials", ["id", "code", "name", "category", "unit", "organizationId", "supplierId", "projectId", "currentStock", "minStock", "deletedAt"]),
    warehouseTable: makeTable("warehouse", ["id", "name", "organizationId", "projectId", "deletedAt"]),
    expenseCategoriesTable: makeTable("expenseCategories", ["id", "name", "organizationId"]),
    budgetsTable: makeTable("budgets", ["id", "name", "amount", "organizationId", "projectId", "categoryId"]),
    rolesTable: makeTable("roles", ["id", "name", "organizationId"]),
    userRolesTable: makeTable("userRoles", ["userId", "roleId"]),
    rolePermissionsTable: makeTable("rolePermissions", ["roleId", "permissionId"]),
    permissionsTable: makeTable("permissions", ["id", "key"]),
    stockMovementsTable: makeTable("stockMovements", ["id", "organizationId", "materialId", "warehouseId", "type", "quantity", "createdBy"]),
    procurementTable: makeTable("procurement", ["id", "organizationId", "projectId", "status", "title"]),
    procurementItemsTable: makeTable("procurementItems", ["id", "organizationId", "procurementId", "materialId", "warehouseId", "receivedQuantity", "quantity"]),
  };

  const rows = new Map<Table, Row[]>();

  const colValue = (column: any, pair: any): any => {
    if (!column || !column.__field) return column;
    if (column.__table === pair.sourceTable?.__name) return pair.source?.[column.__field];
    for (const j of pair.joined ?? []) if (column.__table === j.table.__name) return j.row[column.__field];
    return undefined;
  };

  const evaluate = (expression: any, pair: any): boolean => {
    if (!expression) return true;
    if (expression.kind === "and") return expression.items.every((item: any) => evaluate(item, pair));
    if (expression.kind === "or") return expression.items.some((item: any) => evaluate(item, pair));
    if (expression.kind === "eq") return colValue(expression.left, pair) === colValue(expression.right, pair);
    if (expression.kind === "isNull") return colValue(expression.column, pair) == null;
    if (expression.kind === "in") {
      const left = colValue(expression.left, pair);
      return expression.right.map((v: any) => colValue(v, pair)).includes(left);
    }
    return true;
  };

  // Evaluate a `${column} + n` / `${column} - n` set-value SQL expression.
  const evalSqlValue = (expr: any, source: Row): any => {
    const col = expr.values.find((v: any) => v && v.__field);
    const operand = expr.values.find((v: any) => v !== col);
    const opStr = expr.strings.find((s: any) => typeof s === "string" && /[+-]/.test(s));
    if (col && opStr && operand !== undefined) {
      const base = Number(source[col.__field]);
      const delta = Number(operand);
      return String(opStr.includes("-") ? base - delta : base + delta);
    }
    return undefined;
  };

  const db: any = {
    select(selection?: any) {
      let sourceTable: Table | undefined;
      const joins: { table: Table; condition: any }[] = [];
      let condition: any;
      let limit: number | undefined;
      const builder: any = {
        from(table: Table) {
          sourceTable = table;
          return builder;
        },
        innerJoin(table: Table, expression: any) {
          joins.push({ table, condition: expression });
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
        then(resolve: (v: Row[]) => unknown) {
          let pairs: any[] = (rows.get(sourceTable!) ?? []).map((source) => ({ source, sourceTable, joined: [] as any[] }));
          for (const join of joins) {
            pairs = pairs.flatMap((pair: any) => {
              const matched = (rows.get(join.table) ?? []).filter((jr: any) =>
                evaluate(join.condition, { ...pair, source: pair.source, joined: [...pair.joined, { table: join.table, row: jr }] }),
              );
              return matched.map((jr: any) => ({ ...pair, joined: [...pair.joined, { table: join.table, row: jr }] }));
            });
          }
          pairs = pairs.filter((pair) => evaluate(condition, { ...pair, source: pair.source, joined: pair.joined, sourceTable }));
          if (limit !== undefined) pairs = pairs.slice(0, limit);
          const result = pairs.map((pair) => {
            if (!selection) return pair.source;
            const out: Row = {};
            for (const [key, column] of Object.entries(selection)) out[key] = colValue(column, pair);
            return out;
          });
          return Promise.resolve(result).then(resolve);
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
          const matched = (rows.get(table) ?? []).filter((source) => evaluate(condition, { source, sourceTable: table, joined: [] }));
          matched.forEach((source) => {
            const out: Row = {};
            for (const [key, v] of Object.entries(values)) {
              out[key] = v && v.__sql ? evalSqlValue(v, source) : v;
            }
            Object.assign(source, out);
          });
          return Promise.resolve(matched.map((row) => ({ ...row })));
        },
      };
    },
    delete(table: Table) {
      let condition: any;
      return {
        where(expression: any) {
          condition = expression;
          const current = rows.get(table) ?? [];
          const kept = current.filter((source) => !evaluate(condition, { source, sourceTable: table, joined: [] }));
          rows.set(table, kept);
          return Promise.resolve({ rowCount: current.length - kept.length });
        },
      };
    },
    transaction(cb: (tx: any) => Promise<any>) {
      return cb(db);
    },
  };

  const drizzle = {
    eq: (left: any, right: any) => ({ kind: "eq", left, right }),
    and: (...items: any[]) => ({ kind: "and", items }),
    or: (...items: any[]) => ({ kind: "or", items }),
    inArray: (left: any, right: any[]) => ({ kind: "in", left, right }),
    isNull: (column: any) => ({ kind: "isNull", column }),
    sql: (strings: any, ...values: any[]) => ({ __sql: true, strings, values }),
  };

  const reset = () => rows.clear();

  return { tables, rows, db, drizzle, reset };
});

vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  hasPermission: async () => true,
}));
vi.mock("../../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../artifacts/api-server/src/middlewares/tenant", () => ({
  tenantId: (req: any) => req.organizationId,
  ownedProject: async (req: any, projectId: number) =>
    (mocks.rows.get(mocks.tables.projectsTable) ?? []).find((p: any) => p.id === projectId && p.organizationId === req.organizationId) ?? null,
  isProjectMember: async () => true,
}));
vi.mock("../../artifacts/api-server/src/lib/notifications", () => ({
  createNotification: vi.fn(async () => {}),
  notifyWorkflowDecision: vi.fn(async () => {}),
  NotificationType: { LOW_STOCK: "LOW_STOCK" },
}));

import projectsRouter from "../../artifacts/api-server/src/routes/projects";
import hrRouter from "../../artifacts/api-server/src/routes/hr";
import procurementExtRouter from "../../artifacts/api-server/src/routes/procurement-ext";
import costControlRouter from "../../artifacts/api-server/src/routes/cost-control";
import stockRouter from "../../artifacts/api-server/src/routes/stock";
import { createNotification } from "../../artifacts/api-server/src/lib/notifications";

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

describe("cross-tenant reference validation", () => {
  beforeEach(() => {
    mocks.reset();
    vi.mocked(createNotification).mockClear();
  });

  it("rejects a project whose managerId belongs to another tenant", async () => {
    mocks.rows.set(mocks.tables.usersTable, [{ id: 99, name: "Other org user", organizationId: 2 }]);
    const app = appWith([projectsRouter], 1);
    const res = await request(app).post("/projects").send({ name: "P", managerId: 99 });
    expect(res.status).toBe(400);
    expect(mocks.rows.get(mocks.tables.projectsTable)).toBeUndefined();
  });

  it("rejects updating an employee's projectId to another tenant's project", async () => {
    mocks.rows.set(mocks.tables.employeesTable, [{ id: 1, organizationId: 1, firstName: "A" }]);
    mocks.rows.set(mocks.tables.projectsTable, [{ id: 2, name: "Other", organizationId: 2 }]);
    const app = appWith([hrRouter], 1);
    const res = await request(app).patch("/employees/1").send({ projectId: 2 });
    expect(res.status).toBe(404);
  });

  it("rejects updating an employee's userId to another tenant's user", async () => {
    mocks.rows.set(mocks.tables.employeesTable, [{ id: 1, organizationId: 1, firstName: "A" }]);
    mocks.rows.set(mocks.tables.usersTable, [{ id: 22, name: "Other", organizationId: 2 }]);
    const app = appWith([hrRouter], 1);
    const res = await request(app).patch("/employees/1").send({ userId: 22 });
    expect(res.status).toBe(400);
  });

  it("rejects creating a material linked to another tenant's supplier", async () => {
    mocks.rows.set(mocks.tables.suppliersTable, [{ id: 5, name: "Other supplier", organizationId: 2 }]);
    const app = appWith([procurementExtRouter], 1);
    const res = await request(app).post("/materials").send({ code: "M", name: "M", category: "c", unit: "u", supplierId: 5 });
    expect(res.status).toBe(400);
    expect(mocks.rows.get(mocks.tables.materialsTable)).toBeUndefined();
  });

  it("rejects creating a warehouse linked to another tenant's project", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [{ id: 9, name: "Other", organizationId: 2 }]);
    const app = appWith([procurementExtRouter], 1);
    const res = await request(app).post("/warehouse").send({ name: "W", projectId: 9 });
    expect(res.status).toBe(404);
  });

  it("rejects creating a budget linked to another tenant's expense category", async () => {
    mocks.rows.set(mocks.tables.expenseCategoriesTable, [{ id: 7, name: "Other cat", organizationId: 2 }]);
    const app = appWith([costControlRouter], 1);
    const res = await request(app).post("/cost-control/budgets").send({ name: "B", amount: 100, categoryId: 7 });
    expect(res.status).toBe(400);
    expect(mocks.rows.get(mocks.tables.budgetsTable)).toBeUndefined();
  });
});

describe("low-stock notification tenant scoping", () => {
  beforeEach(() => {
    mocks.reset();
    vi.mocked(createNotification).mockClear();
  });

  it("does not notify users of another tenant when stock runs low", async () => {
    mocks.rows.set(mocks.tables.materialsTable, [
      { id: 1, code: "M", name: "Cement", category: "c", unit: "bag", organizationId: 1, currentStock: "2", minStock: "5" },
    ]);
    mocks.rows.set(mocks.tables.warehouseTable, [{ id: 1, name: "WH", organizationId: 1 }]);
    mocks.rows.set(mocks.tables.permissionsTable, [{ id: 10, key: "stock.read" }]);
    mocks.rows.set(mocks.tables.rolesTable, [
      { id: 100, name: "Manager", organizationId: 1 },
      { id: 200, name: "OtherManager", organizationId: 2 },
    ]);
    mocks.rows.set(mocks.tables.userRolesTable, [
      { userId: 11, roleId: 100 },
      { userId: 22, roleId: 200 },
    ]);
    mocks.rows.set(mocks.tables.rolePermissionsTable, [
      { roleId: 100, permissionId: 10 },
      { roleId: 200, permissionId: 10 },
    ]);
    mocks.rows.set(mocks.tables.usersTable, [
      { id: 11, name: "Org1 Admin", organizationId: 1 },
      { id: 22, name: "Org2 Admin", organizationId: 2 },
    ]);

    const app = appWith([stockRouter], 1);
    const res = await request(app).post("/stock/receive").send({ materialId: 1, warehouseId: 1, quantity: 1 });
    expect(res.status).toBe(201);

    await vi.waitFor(() => {
      const notifiedIds = vi.mocked(createNotification).mock.calls.map((c: any) => c[0].userId);
      expect(notifiedIds).toContain(11);
    });
    const notifiedIds = vi.mocked(createNotification).mock.calls.map((c: any) => c[0].userId);
    expect(notifiedIds).not.toContain(22);
  });
});
