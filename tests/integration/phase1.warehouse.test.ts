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
    stockMovementsTable: makeTable("stock_movements", [
      "id", "organizationId", "materialId", "warehouseId", "type", "quantity",
      "refType", "refId", "barcode", "notes", "createdBy", "createdAt",
    ]),
    materialsTable: makeTable("materials", [
      "id", "organizationId", "name", "unit", "currentStock", "lowStockThreshold", "category", "updatedAt",
    ]),
    warehouseTable: makeTable("warehouse", ["id", "organizationId", "name", "status"]),
    procurementItemsTable: makeTable("procurement_items", [
      "id", "organizationId", "quantity", "receivedQuantity", "updatedAt",
    ]),
    userRolesTable: makeTable("user_roles", ["userId", "roleId"]),
    rolePermissionsTable: makeTable("role_permissions", ["roleId", "permissionId"]),
    permissionsTable: makeTable("permissions", ["id", "name"]),
    usersTable: makeTable("users", ["id", "organizationId"]),
  };

  const rows = new Map<Table, Row[]>();
  let idSeq = 1000;

  const valueOf = (col: any, pair: { source: Row; sourceTable: Table }) => {
    if (!col || !col.__field) return col;
    if (col.__table === pair.sourceTable.__name) return pair.source[col.__field];
    return undefined;
  };

  const evaluate = (expr: any, pair: { source: Row; sourceTable: Table }): boolean => {
    if (!expr) return true;
    if (Array.isArray(expr)) return expr.every((e: any) => evaluate(e, pair));
    if (expr.kind === "eq") return valueOf(expr.left, pair) === expr.right;
    return true;
  };

  function makeDb() {
    return {
      select: vi.fn(() => {
        let table: Table;
        let whereClause: any;
        const query: any = {
          from(v: Table) { table = v; return this; },
          where(c: any) { whereClause = c; return this; },
          orderBy() { return query; },
          limit() { return query; },
          offset() { return query; },
          then(resolve: any, reject?: any) {
            let data = rows.get(table) ?? [];
            if (whereClause) data = data.filter((r) => evaluate(whereClause, { source: r, sourceTable: table }));
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
              const row = { id: idSeq++, ...valuesClause, createdAt: new Date() };
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
        const applySet = () => {
          let data = rows.get(table) ?? [];
          if (whereClause) data = data.filter((r) => evaluate(whereClause, { source: r, sourceTable: table }));
          for (const row of data) {
            for (const [k, v] of Object.entries(setClause ?? {})) {
              if (v && typeof v === "object" && "sqlDelta" in (v as any)) {
                row[k] = Number(row[k]) + (v as any).sqlDelta;
              } else {
                row[k] = v;
              }
            }
          }
          return data;
        };
        const chain: any = {
          set(c: any) { setClause = c; return chain; },
          where(c: any) { whereClause = c; return chain; },
          returning() { return Promise.resolve(applySet()); },
          then(resolve: any, reject?: any) { return Promise.resolve(applySet()).then(resolve, reject); },
        };
        return chain;
      }),
      transaction: vi.fn(async (cb: any) => cb(dbHandle)),
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
  sql: (strings: TemplateStringsArray, ...values: any[]) => {
    const text = strings.join("?");
    if (values.length === 2 && (text.includes(" + ") || text.includes(" - "))) {
      const delta = Number(values[1]);
      return { sqlDelta: text.includes(" - ") ? -delta : delta };
    }
    return { sql: text, params: values };
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
}));
vi.mock("../../artifacts/api-server/src/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("../../artifacts/api-server/src/lib/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  NotificationType: { LOW_STOCK: "low_stock" },
}));
vi.mock("../../artifacts/api-server/src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import stockRouter from "../../artifacts/api-server/src/routes/stock";

/* ──────────────────────── Helpers ──────────────────────── */

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 7, organizationId: 1, role: "ENGINEER" };
    next();
  });
  a.use(stockRouter);
  return a;
}

function seedMaterial(overrides: Partial<Record<string, any>> = {}) {
  const row = { id: 1, organizationId: 1, name: "Cement", unit: "bag", currentStock: "100", lowStockThreshold: "10", category: "raw", updatedAt: new Date(), ...overrides };
  rows.set(tables.materialsTable, [row]);
  return row;
}

function seedWarehouses() {
  rows.set(tables.warehouseTable, [
    { id: 1, organizationId: 1, name: "Main", status: "active" },
    { id: 2, organizationId: 1, name: "Secondary", status: "active" },
  ]);
}

/* ──────────────────────── Tests ──────────────────────── */

describe("Phase 1 Step 2: Warehouse Stock Movements", () => {
  beforeEach(() => rows.clear());

  // ---------- POST /stock/receive ----------
  it("receives stock and increments material balance", async () => {
    seedMaterial();
    seedWarehouses();
    const res = await request(app()).post("/stock/receive").send({ materialId: 1, warehouseId: 1, quantity: 20 });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("in");
    expect(res.body.quantity).toBe(20);
    const [material] = rows.get(tables.materialsTable)!;
    expect(Number(material.currentStock)).toBe(120);
  });

  it("rejects receive with missing required fields", async () => {
    const res = await request(app()).post("/stock/receive").send({ materialId: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects receive with non-positive quantity", async () => {
    seedMaterial();
    seedWarehouses();
    const res = await request(app()).post("/stock/receive").send({ materialId: 1, warehouseId: 1, quantity: -5 });
    expect(res.status).toBe(400);
  });

  it("rejects receive for material not in tenant", async () => {
    seedWarehouses();
    const res = await request(app()).post("/stock/receive").send({ materialId: 999, warehouseId: 1, quantity: 10 });
    expect(res.status).toBe(404);
  });

  it("rejects over-receive against a procurement item", async () => {
    seedMaterial();
    seedWarehouses();
    rows.set(tables.procurementItemsTable, [
      { id: 5, organizationId: 1, quantity: "10", receivedQuantity: "8", updatedAt: new Date() },
    ]);
    const res = await request(app()).post("/stock/receive").send({
      materialId: 1, warehouseId: 1, quantity: 5, refType: "procurement_item", refId: 5,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Over-receive");
  });

  // ---------- POST /stock/issue ----------
  it("issues stock and decrements material balance", async () => {
    seedMaterial();
    seedWarehouses();
    const res = await request(app()).post("/stock/issue").send({ materialId: 1, warehouseId: 1, quantity: 30 });
    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(-30);
    const [material] = rows.get(tables.materialsTable)!;
    expect(Number(material.currentStock)).toBe(70);
  });

  it("rejects issue when insufficient stock", async () => {
    seedMaterial({ currentStock: "5" });
    seedWarehouses();
    const res = await request(app()).post("/stock/issue").send({ materialId: 1, warehouseId: 1, quantity: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Insufficient stock");
  });

  // ---------- POST /stock/adjust ----------
  it("allows positive stock adjustment", async () => {
    seedMaterial();
    seedWarehouses();
    const res = await request(app()).post("/stock/adjust").send({ materialId: 1, warehouseId: 1, quantity: 15 });
    expect(res.status).toBe(201);
    expect(res.body.newBalance).toBe(115);
  });

  it("rejects adjustment resulting in negative stock", async () => {
    seedMaterial({ currentStock: "5" });
    seedWarehouses();
    const res = await request(app()).post("/stock/adjust").send({ materialId: 1, warehouseId: 1, quantity: -10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("negative stock");
  });

  // ---------- POST /stock/transfer ----------
  it("transfers stock between warehouses creating paired movements", async () => {
    seedMaterial();
    seedWarehouses();
    const res = await request(app()).post("/stock/transfer").send({
      materialId: 1, fromWarehouseId: 1, toWarehouseId: 2, quantity: 25,
    });
    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(25);
    expect(res.body.outMovementId).toBeDefined();
    expect(res.body.inMovementId).toBeDefined();
  });

  it("rejects transfer to the same warehouse", async () => {
    seedMaterial();
    seedWarehouses();
    const res = await request(app()).post("/stock/transfer").send({
      materialId: 1, fromWarehouseId: 1, toWarehouseId: 1, quantity: 10,
    });
    expect(res.status).toBe(400);
  });

  it("rejects transfer with insufficient stock", async () => {
    seedMaterial({ currentStock: "5" });
    seedWarehouses();
    const res = await request(app()).post("/stock/transfer").send({
      materialId: 1, fromWarehouseId: 1, toWarehouseId: 2, quantity: 20,
    });
    expect(res.status).toBe(409);
  });

  it("rejects transfer to a non-existent destination warehouse", async () => {
    seedMaterial();
    rows.set(tables.warehouseTable, [{ id: 1, organizationId: 1, name: "Main", status: "active" }]);
    const res = await request(app()).post("/stock/transfer").send({
      materialId: 1, fromWarehouseId: 1, toWarehouseId: 999, quantity: 10,
    });
    expect(res.status).toBe(404);
  });
});
