import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;
type Table = Record<string, any> & { __name: string };

const mocks = vi.hoisted(() => {
  const makeTable = (name: string, fields: string[]): Table => {
    const t: Table = { __name: name };
    for (const f of fields) t[f] = { __table: name, __field: f };
    return t;
  };

  const tables = {
    usersTable: makeTable("users", ["id", "email", "organizationId", "active"]),
    notificationsTable: makeTable("notifications", ["id", "organizationId", "userId", "title", "message", "type", "link", "read", "createdAt", "emailSentAt", "emailStatus"]),
    notificationPreferencesTable: makeTable("notificationPreferences", ["organizationId", "userId", "type", "optIn"]),
    projectsTable: makeTable("projects", ["id", "name", "organizationId", "status", "progress", "budget", "spent", "client", "location", "phase"]),
    projectMembersTable: makeTable("projectMembers", ["id", "projectId", "userId", "organizationId"]),
    dailyReportsTable: makeTable("dailyReports", ["id", "organizationId", "projectId", "date", "weather", "progress", "workersOnSite", "issues", "notes"]),
    documentsTable: makeTable("documents", ["id", "organizationId", "projectId", "name", "type", "createdAt"]),
  };

  const rows = new Map<Table, Row[]>();

  const colValue = (column: any, source: Row, sourceTable: Table): any => {
    if (!column || !column.__field) return column;
    if (column.__table === sourceTable.__name) return source[column.__field];
    return undefined;
  };

  const evaluate = (expr: any, source: Row, sourceTable: Table): boolean => {
    if (!expr) return true;
    if (Array.isArray(expr)) return expr.every((e: any) => evaluate(e, source, sourceTable));
    if (expr.kind === "eq") return colValue(expr.left, source, sourceTable) === expr.right;
    if (expr.kind === "isNull") return colValue(expr.column, source, sourceTable) == null;
    return true;
  };

  const db: any = {
    select(selection?: any) {
      let table: Table | undefined;
      let condition: any;
      let limit: number | undefined;
      const builder: any = {
        from(t: Table) {
          table = t;
          return builder;
        },
        where(c: any) {
          condition = c;
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        then(resolve: (v: Row[]) => unknown) {
          let data = (rows.get(table!) ?? []).filter((r) => evaluate(condition, r, table!));
          if (limit !== undefined) data = data.slice(0, limit);
          const result = data.map((r) => {
            if (!selection) return r;
            const out: Row = {};
            for (const [key, column] of Object.entries(selection)) out[key] = colValue(column, r, table!);
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
          const inserted = (Array.isArray(values) ? values : [values]).map((r) => ({ ...r }));
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
        where(c: any) {
          condition = c;
          return this;
        },
        returning() {
          const matched = (rows.get(table) ?? []).filter((r) => evaluate(condition, r, table));
          matched.forEach((r) => Object.assign(r, values));
          return Promise.resolve(matched.map((r) => ({ ...r })));
        },
      };
    },
  };

  const drizzle = {
    eq: (left: any, right: any) => ({ kind: "eq", left, right }),
    and: (...args: any[]) => args,
    or: (...args: any[]) => ({ kind: "or", items: args }),
    isNull: (column: any) => ({ kind: "isNull", column }),
    sql: () => ({ __sql: true }),
  };

  const reset = () => rows.clear();

  return { tables, rows, db, drizzle, reset };
});

vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => mocks.drizzle);
vi.mock("../../artifacts/api-server/src/lib/sseBroadcaster", () => ({
  sseBroadcaster: { send: vi.fn() },
}));
vi.mock("../../artifacts/api-server/src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../artifacts/api-server/src/lib/email/provider", () => ({
  sendMail: vi.fn(async () => "sent"),
}));

import { createNotification } from "../../artifacts/api-server/src/lib/notifications";
import { RagService } from "../../artifacts/api-server/src/lib/ai/rag";
import { sendMail } from "../../artifacts/api-server/src/lib/email/provider";

beforeEach(() => {
  mocks.reset();
  vi.mocked(sendMail).mockClear();
});

describe("notification recipient tenant scoping", () => {
  it("does not create a notification or email for a recipient of another tenant", async () => {
    mocks.rows.set(mocks.tables.usersTable, [
      { id: 11, email: "a@org1.test", organizationId: 1 },
      { id: 22, email: "b@org2.test", organizationId: 2 },
    ]);

    await createNotification({
      organizationId: 1,
      userId: 22, // belongs to org 2
      title: "sensitive",
      message: "org1 secret",
      type: "test",
    });

    // Fire-and-forget email uses setImmediate; flush a couple of ticks.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(mocks.rows.get(mocks.tables.notificationsTable)).toBeUndefined();
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
  });

  it("notifies and emails a recipient in the same tenant", async () => {
    mocks.rows.set(mocks.tables.usersTable, [{ id: 11, email: "a@org1.test", organizationId: 1 }]);

    await createNotification({
      organizationId: 1,
      userId: 11,
      title: "hello",
      message: "you have a task",
      type: "task_assigned",
    });

    await vi.waitFor(() => expect(vi.mocked(sendMail)).toHaveBeenCalled());
    const stored = mocks.rows.get(mocks.tables.notificationsTable);
    expect(stored).toHaveLength(1);
    expect(stored![0].userId).toBe(11);
    expect(vi.mocked(sendMail).mock.calls[0][0].to).toBe("a@org1.test");
  });

  it("notifies document upload only to project members of the same tenant", async () => {
    const { notifyDocumentUploaded } = await import("../../artifacts/api-server/src/lib/notifications");
    mocks.rows.set(mocks.tables.usersTable, [
      { id: 11, email: "member@org1.test", organizationId: 1 },
      { id: 33, email: "outsider@org1.test", organizationId: 1 },
    ]);
    mocks.rows.set(mocks.tables.projectMembersTable, [
      { id: 1, projectId: 7, userId: 11, organizationId: 1 },
    ]);
    mocks.rows.set(mocks.tables.projectsTable, [{ id: 7, name: "P", organizationId: 1 }]);

    const req: any = { vetraUser: { id: 99, organizationId: 1 } };
    await notifyDocumentUploaded(req, "secret.docx", 7, 100);

    const stored = mocks.rows.get(mocks.tables.notificationsTable) ?? [];
    const notified = stored.map((n) => n.userId);
    expect(notified).toContain(11);
    expect(notified).not.toContain(33); // not a project member
  });
});

describe("RAG retrieval tenant scoping", () => {
  const service = new RagService();

  it("never includes another tenant's documents or reports in context", async () => {
    mocks.rows.set(mocks.tables.dailyReportsTable, [
      { id: 1, organizationId: 1, projectId: 1, date: "2026-08-18", weather: "clear", progress: "10", workersOnSite: 2, issues: null, notes: "org1 report" },
      { id: 2, organizationId: 2, projectId: 2, date: "2026-08-18", weather: "clear", progress: "90", workersOnSite: 9, issues: null, notes: "ORG2 SECRET REPORT" },
    ]);
    mocks.rows.set(mocks.tables.documentsTable, [
      { id: 1, organizationId: 1, projectId: 1, name: "org1 drawing", type: "pdf" },
      { id: 2, organizationId: 2, projectId: 2, name: "ORG2 SECRET DRAWING", type: "pdf" },
    ]);

    const ctx = await service.buildContext(1, undefined, "status");
    const text = ctx.snippets.join("\n");
    expect(text).toContain("org1 report");
    expect(text).toContain("org1 drawing");
    expect(text).not.toContain("ORG2 SECRET");
  });

  it("does not leak a project from another tenant when a foreign projectId is supplied", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [
      { id: 1, name: "Org1 Project", organizationId: 1, status: "active", progress: "10", budget: "100", spent: "0", client: "c", location: "l", phase: null },
      { id: 99, name: "ORG2 SECRET PROJECT", organizationId: 2, status: "active", progress: "90", budget: "900", spent: "800", client: "x", location: "y", phase: null },
    ]);

    const ctx = await service.buildContext(1, 99, "status");
    const text = ctx.snippets.join("\n");
    expect(text).not.toContain("ORG2 SECRET PROJECT");
  });

  it("includes same-tenant project context for an authorized project", async () => {
    mocks.rows.set(mocks.tables.projectsTable, [
      { id: 1, name: "Org1 Project", organizationId: 1, status: "active", progress: "10", budget: "100", spent: "0", client: "c", location: "l", phase: null },
    ]);

    const ctx = await service.buildContext(1, 1, "status");
    expect(ctx.snippets.join("\n")).toContain("Org1 Project");
  });
});
