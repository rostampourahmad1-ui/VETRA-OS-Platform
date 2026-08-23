import express from "express";
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
    notificationsTable: makeTable("notifications", ["id", "organizationId", "userId", "title", "message", "type", "read", "link", "createdAt"]),
  };

  const rows = new Map<Table, Row[]>();

  const valueOf = (column: any, pair: { source: Row; sourceTable: Table }) => {
    if (!column || !column.__field) return column;
    if (column.__table === pair.sourceTable.__name) return pair.source[column.__field];
    return undefined;
  };

  const evaluate = (expression: any, pair: { source: Row; sourceTable: Table }): boolean => {
    if (!expression) return true;
    if (Array.isArray(expression)) {
      return expression.every((item: any) => evaluate(item, pair));
    }
    if (expression.kind === "eq") return valueOf(expression.left, pair) === expression.right;
    return true;
  };

  const db = {
    select: vi.fn(() => {
      let table: Table;
      let whereClause: any;
      const query: any = {
        from(value: Table) { table = value; return this; },
        where(clause: any) { whereClause = clause; return this; },
        orderBy() { return query; },
        then(resolve: any, reject?: any) {
          let data = rows.get(table) ?? [];
          if (whereClause) {
            data = data.filter((row) => evaluate(whereClause, { source: row, sourceTable: table }));
          }
          return Promise.resolve(data).then(resolve, reject);
        },
      };
      return query;
    }),
    update: vi.fn((table: Table) => {
      let setClause: any;
      let whereClause: any;
      const chain: any = {
        set(clause: any) { setClause = clause; return chain; },
        where(clause: any) { whereClause = clause; return chain; },
        returning() {
          let data = rows.get(table) ?? [];
          if (whereClause) {
            data = data.filter((row) => evaluate(whereClause, { source: row, sourceTable: table }));
          }
          if (data.length > 0 && setClause?.read === true) {
            data[0].read = true;
          }
          return Promise.resolve(data.length > 0 ? [data[0]] : []);
        },
      };
      return chain;
    }),
  };

  return { tables, rows, db };
});
const { tables, rows, db } = mocks;
vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ kind: "eq", left, right }),
  and: (...args: any[]) => args,
  sql: (strings: any) => strings,
}));
vi.mock("../artifacts/api-server/src/middlewares/permissions", () => ({ requirePermission: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../artifacts/api-server/src/middlewares/requireAuth", () => ({ requireAuth: (_req: any, _res: any, next: any) => next() }));

import notificationsRouter from "../artifacts/api-server/src/routes/notifications";

function appWith(router: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 7, organizationId: 1, role: "ENGINEER" };
    next();
  });
  app.use(router);
  return app;
}

describe("VETRA-SEC-03: Notification routes", () => {
  beforeEach(() => rows.clear());

  it("GET /notifications returns only the current user's notifications", async () => {
    rows.set(tables.notificationsTable, [
      { id: 1, organizationId: 1, userId: 7, title: "A", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 2, organizationId: 1, userId: 8, title: "B", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(1);
    expect(response.body[0].title).toBe("A");
  });

  it("GET /notifications scopes by organization", async () => {
    rows.set(tables.notificationsTable, [
      { id: 3, organizationId: 1, userId: 7, title: "Org A", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 4, organizationId: 2, userId: 7, title: "Org B", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(3);
  });

  it("PATCH /notifications/:id/read marks a notification as read", async () => {
    rows.set(tables.notificationsTable, [
      { id: 5, organizationId: 1, userId: 7, title: "C", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).patch("/notifications/5/read");
    expect(response.status).toBe(200);
    expect(response.body.read).toBe(true);
    expect(response.body.id).toBe(5);
  });

  it("PATCH /notifications/:id/read returns 404 for another user's notification", async () => {
    rows.set(tables.notificationsTable, [
      { id: 6, organizationId: 1, userId: 9, title: "D", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).patch("/notifications/6/read");
    expect(response.status).toBe(404);
  });

  it("PATCH /notifications/:id/read returns 404 for another organization's notification", async () => {
    rows.set(tables.notificationsTable, [
      { id: 7, organizationId: 2, userId: 7, title: "E", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).patch("/notifications/7/read");
    expect(response.status).toBe(404);
  });

  it("PATCH /notifications/:id/read returns 400 for invalid ID", async () => {
    const response = await request(appWith(notificationsRouter)).patch("/notifications/abc/read");
    expect(response.status).toBe(400);
  });

  it("PATCH /notifications/:id/read returns 404 for non-existent notification", async () => {
    const response = await request(appWith(notificationsRouter)).patch("/notifications/999/read");
    expect(response.status).toBe(404);
  });
});
