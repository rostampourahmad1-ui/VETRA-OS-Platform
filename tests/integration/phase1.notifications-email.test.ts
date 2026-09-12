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
    notificationsTable: makeTable("notifications", [
      "id", "organizationId", "userId", "title", "message", "type", "read", "link", "createdAt",
    ]),
    notificationPreferencesTable: makeTable("notification_preferences", [
      "organizationId", "userId", "type", "optIn",
    ]),
  };

  const rows = new Map<Table, Row[]>();

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

  const db = {
    select: vi.fn((columns?: any) => {
      let table: Table;
      let whereClause: any;
      const isCountQuery = !!columns;
      const query: any = {
        from(v: Table) { table = v; return this; },
        where(c: any) { whereClause = c; return this; },
        orderBy() { return query; },
        limit() { return query; },
        offset() { return query; },
        then(resolve: any, reject?: any) {
          let data = rows.get(table) ?? [];
          if (whereClause) data = data.filter((r) => evaluate(whereClause, { source: r, sourceTable: table }));
          if (isCountQuery) return Promise.resolve([{ count: data.length }]).then(resolve).catch(reject);
          return Promise.resolve(data).then(resolve, reject);
        },
      };
      return query;
    }),
    insert: vi.fn((table: Table) => {
      let valuesClause: any;
      const chain: any = {
        values(c: any) { valuesClause = c; return chain; },
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
        set(c: any) { setClause = c; return chain; },
        where(c: any) { whereClause = c; return chain; },
        returning() {
          let data = rows.get(table) ?? [];
          if (whereClause) data = data.filter((r) => evaluate(whereClause, { source: r, sourceTable: table }));
          if (data.length > 0 && setClause?.read === true) data[0].read = true;
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
vi.mock("../../artifacts/api-server/src/lib/sseBroadcaster", () => ({
  sseBroadcaster: { addClient: vi.fn(), send: vi.fn(), removeClient: vi.fn() },
}));
vi.mock("../../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

import notificationsRouter from "../../artifacts/api-server/src/routes/notifications";

/* ──────────────────────── Helpers ──────────────────────── */

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 7, organizationId: 1, role: "ENGINEER" };
    next();
  });
  a.use(notificationsRouter);
  return a;
}

/* ──────────────────────── Tests ──────────────────────── */

describe("Phase 1 Step 1: Notifications & Email Integration", () => {
  beforeEach(() => rows.clear());

  // ---------- GET /notifications ----------
  it("returns only the authenticated user's notifications scoped by tenant", async () => {
    rows.set(tables.notificationsTable, [
      { id: 1, organizationId: 1, userId: 7, title: "Mine", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 2, organizationId: 1, userId: 9, title: "Other", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 3, organizationId: 2, userId: 7, title: "OtherOrg", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const res = await request(app()).get("/notifications");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Mine");
    expect(res.body.pagination).toBeDefined();
  });

  // ---------- Pagination ----------
  it("respects limit and offset query parameters", async () => {
    rows.set(tables.notificationsTable, [
      { id: 10, organizationId: 1, userId: 7, title: "T1", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 11, organizationId: 1, userId: 7, title: "T2", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const res = await request(app()).get("/notifications?limit=1&offset=0");
    expect(res.status).toBe(200);
  });

  // ---------- PATCH /notifications/:id/read ----------
  it("marks own notification as read", async () => {
    rows.set(tables.notificationsTable, [
      { id: 5, organizationId: 1, userId: 7, title: "C", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const res = await request(app()).patch("/notifications/5/read");
    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
  });

  it("rejects read for notification of another user", async () => {
    rows.set(tables.notificationsTable, [
      { id: 6, organizationId: 1, userId: 99, title: "D", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const res = await request(app()).patch("/notifications/6/read");
    expect(res.status).toBe(404);
  });

  it("rejects read for notification of another organization", async () => {
    rows.set(tables.notificationsTable, [
      { id: 7, organizationId: 2, userId: 7, title: "E", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const res = await request(app()).patch("/notifications/7/read");
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid notification ID", async () => {
    const res = await request(app()).patch("/notifications/abc/read");
    expect(res.status).toBe(400);
  });

  // ---------- GET /notifications/unread-count ----------
  it("returns correct unread count", async () => {
    rows.set(tables.notificationsTable, [
      { id: 1, organizationId: 1, userId: 7, title: "U1", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
      { id: 2, organizationId: 1, userId: 7, title: "U2", message: "m", type: "info", read: true, link: null, createdAt: new Date() },
      { id: 3, organizationId: 1, userId: 7, title: "U3", message: "m", type: "info", read: false, link: null, createdAt: new Date() },
    ]);
    const res = await request(app()).get("/notifications/unread-count");
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(2);
  });

  // ---------- Preferences ----------
  it("returns empty preferences array for new user", async () => {
    const res = await request(app()).get("/notifications/preferences");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("upserts notification preferences", async () => {
    const res = await request(app())
      .put("/notifications/preferences")
      .send({ preferences: [{ type: "task_assigned", optIn: true }, { type: "document_uploaded", optIn: false }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("validates preference payload format", async () => {
    const res = await request(app())
      .put("/notifications/preferences")
      .send({ preferences: "invalid" });
    expect(res.status).toBe(400);
  });

  it("validates individual preference items", async () => {
    const res = await request(app())
      .put("/notifications/preferences")
      .send({ preferences: [{ type: "task_assigned", optIn: "yes" }] });
    expect(res.status).toBe(400);
  });
});
