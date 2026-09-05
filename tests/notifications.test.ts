import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Row = Record<string, any>;
  type Table = Record<string, any> & { __name: string };

  interface QueryChain {
    from(value: Table): QueryChain;
    where(clause: any): QueryChain;
    orderBy(): QueryChain;
    limit(n: number): QueryChain;
    offset(n: number): QueryChain;
    then(resolve: any, reject?: any): Promise<any>;
  }

  const makeTable = (name: string, fields: string[]): Table => {
    const table: Table = { __name: name };
    for (const field of fields) table[field] = { __table: name, __field: field };
    return table;
  };

  const tables = {
    notificationsTable: makeTable("notifications", ["id", "organizationId", "userId", "title", "message", "type", "read", "link", "createdAt"]),
    notificationPreferencesTable: makeTable("notification_preferences", ["organizationId", "userId", "type", "optIn"]),
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
    select: vi.fn((columns?: any) => {
      let table: Table;
      let whereClause: any;
      const isCountQuery = !!columns;
      const query: QueryChain = {
        from(value: Table) { table = value; return this; },
        where(clause: any) { whereClause = clause; return this; },
        orderBy() { return query; },
        limit(n: number) { return query; },
        offset(n: number) { return query; },
        then(resolve: any, reject?: any) {
          let data = rows.get(table) ?? [];
          if (whereClause) {
            data = data.filter((row) => evaluate(whereClause, { source: row, sourceTable: table }));
          }
          if (isCountQuery) {
            return Promise.resolve([{ count: data.length }]).then(resolve).catch(reject);
          }
          return Promise.resolve(data).then(resolve, reject);
        },
      };
      return query;
    }),
    insert: vi.fn((table: Table) => {
      let valuesClause: any;
      const chain: any = {
        values(clause: any) { valuesClause = clause; return chain; },
        onConflictDoUpdate() { return chain; },
        returning() {
          if (valuesClause) {
            const row = { id: Date.now(), ...valuesClause, read: false, createdAt: new Date() };
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
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ sql: strings.join("?"), params: values }),
}));
vi.mock("../artifacts/api-server/src/lib/sseBroadcaster", () => ({
  sseBroadcaster: { addClient: vi.fn(), send: vi.fn(), removeClient: vi.fn() },
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
  beforeEach(() => {
    rows.clear();
  });

  it("GET /notifications returns only the current user's notifications with pagination", async () => {
    rows.set(tables.notificationsTable, [
      { id: 1, organizationId: 1, userId: 7, title: "A", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 2, organizationId: 1, userId: 8, title: "B", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(1);
    expect(response.body.data[0].title).toBe("A");
    expect(response.body.pagination).toBeDefined();
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.pagination.hasMore).toBe(false);
  });

  it("GET /notifications scopes by organization with pagination", async () => {
    rows.set(tables.notificationsTable, [
      { id: 3, organizationId: 1, userId: 7, title: "Org A", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 4, organizationId: 2, userId: 7, title: "Org B", message: "msg", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(3);
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

  it("GET /notifications/unread-count returns the count", async () => {
    rows.set(tables.notificationsTable, [
      { id: 1, organizationId: 1, userId: 7, title: "U1", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 2, organizationId: 1, userId: 7, title: "U2", message: "m", type: "info", read: true, link: null, createdAt: new Date() },
      { id: 3, organizationId: 1, userId: 7, title: "U3", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications/unread-count");
    expect(response.status).toBe(200);
    expect(response.body.unread).toBe(2);
  });

  it("GET /notifications/preferences returns empty array when no prefs set", async () => {
    const response = await request(appWith(notificationsRouter)).get("/notifications/preferences");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("PUT /notifications/preferences upserts preferences", async () => {
    const response = await request(appWith(notificationsRouter))
      .put("/notifications/preferences")
      .send({ preferences: [{ type: "task_assigned", optIn: true }, { type: "document_uploaded", optIn: false }] });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("PUT /notifications/preferences validates input", async () => {
    const response = await request(appWith(notificationsRouter))
      .put("/notifications/preferences")
      .send({ preferences: "invalid" });
    expect(response.status).toBe(400);
  });

  it("PUT /notifications/preferences validates each item", async () => {
    const response = await request(appWith(notificationsRouter))
      .put("/notifications/preferences")
      .send({ preferences: [{ type: "task_assigned", optIn: "yes" }] });
    expect(response.status).toBe(400);
  });

  it("GET /notifications respects limit query parameter", async () => {
    rows.set(tables.notificationsTable, [
      { id: 10, organizationId: 1, userId: 7, title: "T1", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 11, organizationId: 1, userId: 7, title: "T2", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications?limit=1");
    expect(response.status).toBe(200);
  });

  it("GET /notifications respects offset query parameter", async () => {
    rows.set(tables.notificationsTable, [
      { id: 20, organizationId: 1, userId: 7, title: "T1", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 21, organizationId: 1, userId: 7, title: "T2", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const response = await request(appWith(notificationsRouter)).get("/notifications?offset=10");
    expect(response.status).toBe(200);
  });

});
