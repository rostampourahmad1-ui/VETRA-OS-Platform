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
    invoicesTable: makeTable("invoices", [
      "id", "organizationId", "invoiceNumber", "contractId", "projectId", "issueDate", "dueDate",
      "subtotal", "taxAmount", "totalAmount", "status", "notes", "createdBy", "approvedBy", "approvedAt", "createdAt", "updatedAt",
    ]),
    invoiceLinesTable: makeTable("invoice_lines", [
      "id", "organizationId", "invoiceId", "description", "quantity", "unitPrice", "totalPrice",
    ]),
    paymentSchedulesTable: makeTable("payment_schedules", [
      "id", "organizationId", "contractId", "description", "amount", "paidAmount", "dueDate", "status", "notes", "createdBy",
    ]),
  };

  const rows = new Map<Table, Row[]>();
  let idSeq = 2000;

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
      delete: vi.fn((table: Table) => {
        let whereClause: any;
        const chain: any = {
          where(c: any) {
            whereClause = c;
            let data = rows.get(table) ?? [];
            const remaining = data.filter((r) => !evaluate(whereClause, { source: r, sourceTable: table }));
            rows.set(table, remaining);
            return Promise.resolve([]);
          },
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
  desc: (col: any) => col,
  sql: (strings: TemplateStringsArray, ...values: any[]) => ({ sql: strings.join("?"), params: values }),
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
  NotificationType: { INVOICE_DUE: "invoice_due" },
}));

import invoicesRouter from "../../artifacts/api-server/src/routes/invoices";

/* ──────────────────────── Helpers ──────────────────────── */

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 7, organizationId: 1, role: "ENGINEER" };
    next();
  });
  a.use(invoicesRouter);
  return a;
}

/* ──────────────────────── Tests ──────────────────────── */

describe("Phase 1 Step 3: Financial (Invoices & Payment Schedules)", () => {
  beforeEach(() => rows.clear());

  // ---------- POST /invoices ----------
  it("creates an invoice with auto-calculated 9% VAT totals", async () => {
    const res = await request(app()).post("/invoices").send({
      invoiceNumber: "INV-001",
      issueDate: "2026-09-01",
      lines: [{ description: "Concrete works", quantity: 10, unitPrice: 100 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(1000);
    expect(res.body.taxAmount).toBe(90);
    expect(res.body.totalAmount).toBe(1090);
    expect(res.body.status).toBe("draft");
  });

  it("rejects invoice creation missing required fields", async () => {
    const res = await request(app()).post("/invoices").send({ invoiceNumber: "INV-002" });
    expect(res.status).toBe(400);
  });

  it("rejects invoice creation with empty lines array", async () => {
    const res = await request(app()).post("/invoices").send({
      invoiceNumber: "INV-003", issueDate: "2026-09-01", lines: [],
    });
    expect(res.status).toBe(400);
  });

  // ---------- GET /invoices ----------
  it("lists invoices scoped to tenant with numeric totals", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545", createdAt: new Date() },
      { id: 2, organizationId: 2, invoiceNumber: "B", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545", createdAt: new Date() },
    ]);
    const res = await request(app()).get("/invoices");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].totalAmount).toBe(545);
  });

  it("filters invoices by status", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "draft", subtotal: "100", taxAmount: "9", totalAmount: "109", createdAt: new Date() },
      { id: 2, organizationId: 1, invoiceNumber: "B", status: "approved", subtotal: "200", taxAmount: "18", totalAmount: "218", createdAt: new Date() },
    ]);
    const res = await request(app()).get("/invoices?status=approved");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].invoiceNumber).toBe("B");
  });

  // ---------- GET /invoices/:id ----------
  it("returns invoice with lines by id", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    rows.set(tables.invoiceLinesTable, [
      { id: 1, organizationId: 1, invoiceId: 1, description: "Item", quantity: "5", unitPrice: "100", totalPrice: "500" },
    ]);
    const res = await request(app()).get("/invoices/1");
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].totalPrice).toBe(500);
  });

  it("returns 404 for invoice from another tenant", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 2, invoiceNumber: "A", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    const res = await request(app()).get("/invoices/1");
    expect(res.status).toBe(404);
  });

  // ---------- PATCH /invoices/:id/approve ----------
  it("approves a draft invoice", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545", createdBy: 7, dueDate: null },
    ]);
    const res = await request(app()).patch("/invoices/1/approve");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.approvedBy).toBe(7);
  });

  it("rejects re-approving an already-approved invoice (edit-lock)", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "approved", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    const res = await request(app()).patch("/invoices/1/approve");
    expect(res.status).toBe(409);
  });

  // ---------- PATCH /invoices/:id (edit-lock) ----------
  it("allows editing a draft invoice", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545", notes: null },
    ]);
    const res = await request(app()).patch("/invoices/1").send({ notes: "Updated notes" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("Updated notes");
  });

  it("blocks editing an approved invoice (edit-lock)", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "approved", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    const res = await request(app()).patch("/invoices/1").send({ notes: "hack" });
    expect(res.status).toBe(409);
  });

  it("blocks editing a sent invoice (edit-lock)", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "sent", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    const res = await request(app()).patch("/invoices/1").send({ notes: "hack" });
    expect(res.status).toBe(409);
  });

  // ---------- DELETE /invoices/:id ----------
  it("deletes a draft invoice and its lines", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "draft", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    rows.set(tables.invoiceLinesTable, [
      { id: 1, organizationId: 1, invoiceId: 1, description: "Item", quantity: "5", unitPrice: "100", totalPrice: "500" },
    ]);
    const res = await request(app()).delete("/invoices/1");
    expect(res.status).toBe(204);
  });

  it("blocks deleting an approved invoice", async () => {
    rows.set(tables.invoicesTable, [
      { id: 1, organizationId: 1, invoiceNumber: "A", status: "approved", subtotal: "500", taxAmount: "45", totalAmount: "545" },
    ]);
    const res = await request(app()).delete("/invoices/1");
    expect(res.status).toBe(409);
  });

  // ---------- Payment Schedules ----------
  it("creates a payment schedule", async () => {
    const res = await request(app()).post("/payment-schedules").send({
      contractId: 1, description: "Milestone 1", amount: 5000, dueDate: "2026-10-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(5000);
    expect(res.body.status).toBe("pending");
  });

  it("rejects payment schedule creation with missing fields", async () => {
    const res = await request(app()).post("/payment-schedules").send({ contractId: 1 });
    expect(res.status).toBe(400);
  });

  it("lists payment schedules and computes overdue flag", async () => {
    rows.set(tables.paymentSchedulesTable, [
      { id: 1, organizationId: 1, contractId: 1, description: "Overdue", amount: "1000", paidAmount: "0", dueDate: new Date("2020-01-01"), status: "pending" },
      { id: 2, organizationId: 1, contractId: 1, description: "Future", amount: "2000", paidAmount: "0", dueDate: new Date("2099-01-01"), status: "pending" },
    ]);
    const res = await request(app()).get("/payment-schedules");
    expect(res.status).toBe(200);
    const overdue = res.body.find((r: any) => r.description === "Overdue");
    const future = res.body.find((r: any) => r.description === "Future");
    expect(overdue.isOverdue).toBe(true);
    expect(future.isOverdue).toBe(false);
  });

  it("filters payment schedules by status", async () => {
    rows.set(tables.paymentSchedulesTable, [
      { id: 1, organizationId: 1, contractId: 1, description: "Paid", amount: "1000", paidAmount: "1000", dueDate: new Date(), status: "paid" },
      { id: 2, organizationId: 1, contractId: 1, description: "Pending", amount: "2000", paidAmount: "0", dueDate: new Date(), status: "pending" },
    ]);
    const res = await request(app()).get("/payment-schedules?status=paid");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe("Paid");
  });
});
