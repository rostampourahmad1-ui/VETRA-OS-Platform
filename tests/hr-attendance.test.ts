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
    employeesTable: makeTable("employees", ["id", "code", "firstName", "lastName", "nationalId", "phone", "email", "position", "department", "projectId", "userId", "hireDate", "salary", "dailyWage", "status", "gender", "organizationId", "createdBy", "createdAt", "updatedAt", "deletedAt"]),
    attendanceTable: makeTable("attendance", ["id", "employeeId", "organizationId", "date", "checkIn", "checkOut", "status", "hoursWorked", "overtimeHours", "notes", "recordedBy", "createdAt", "updatedAt"]),
    payrollTable: makeTable("payroll", ["id", "employeeId", "organizationId", "periodStart", "periodEnd", "baseSalary", "overtime", "bonuses", "deductions", "insurance", "tax", "netPay", "status", "paidAt", "notes", "createdBy", "createdAt", "updatedAt", "deletedAt"]),
    projectsTable: makeTable("projects", ["id", "name", "organizationId", "status", "managerId"]),
  };

  const rows = new Map<Table, Row[]>();

  const valueOf = (column: any, pair: { source: Row; sourceTable: Table }) => {
    if (!column || !column.__field) return column;
    if (column.__table === pair.sourceTable.__name) return pair.source[column.__field];
    return undefined;
  };

  const evaluate = (expression: any, pair: { source: Row; sourceTable: Table }): boolean => {
    if (!expression) return true;
    if (expression.kind === "and") return expression.items.every((item: any) => evaluate(item, pair));
    if (expression.kind === "eq") return valueOf(expression.left, pair) === valueOf(expression.right, pair);
    if (expression.kind === "isNull") return valueOf(expression.column, pair) == null;
    return true;
  };

  const buildExpression = (args: any[]): any => {
    if (args.length === 0) return null;
    if (args.length === 1) return args[0];
    return { kind: "and", items: args };
  };

  let nextId = 1000;

  const db = {
    select: vi.fn(() => {
      let table: Table | undefined;
      let condition: any;
      const builder: any = {
        from(t: Table) { table = t; return builder; },
        where(...args: any[]) { condition = buildExpression(args); return builder; },
        orderBy() { return this; },
        then(resolve: any) {
          const data = rows.get(table!) ?? [];
          const results = data.filter((row) => evaluate(condition, { source: row, sourceTable: table! }));
          return Promise.resolve(results).then(resolve);
        },
      };
      return builder;
    }),
    insert: vi.fn(() => {
      let table: Table | undefined;
      let values: any;
      return {
        values(v: any) { values = v; return this; },
        returning() {
          const data = rows.get(table!) ?? [];
          const id = nextId++;
          const row = { id, ...values };
          data.push(row);
          rows.set(table!, data);
          return Promise.resolve([row]);
        },
      };
    }),
    update: vi.fn(() => {
      let table: Table | undefined;
      let setValues: any;
      let condition: any;
      return {
        set(v: any) { setValues = v; return this; },
        where(...args: any[]) { condition = buildExpression(args); return this; },
        returning() {
          const data = rows.get(table!) ?? [];
          const idx = data.findIndex((row) => evaluate(condition, { source: row, sourceTable: table! }));
          if (idx !== -1) {
            Object.assign(data[idx], setValues);
            rows.set(table!, data);
          }
          const updated = idx !== -1 ? [data[idx]] : [];
          return Promise.resolve(updated);
        },
      };
    }),
  };

  const reset = () => { rows.clear(); nextId = 1000; };

  const mockAuth = { reject: false, statusCode: 401 };
  const mockPermission = { reject: false, statusCode: 403, permission: "" };

  return { tables, rows, db, reset, mockAuth, mockPermission };
});

const { tables, rows } = mocks;
vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({
  eq: (left: any, right: any) => ({ kind: "eq", left, right }),
  and: (...args: any[]) => ({ kind: "and", items: args }),
  isNull: (column: any) => ({ kind: "isNull", column }),
  desc: (column: any) => ({ column, direction: "desc" }),
  sql: (strings: any) => ({ kind: "sql", strings }),
  sum: (column: any) => ({ kind: "sum", column }),
}));
vi.mock("../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (req: any, res: any, next: any) => {
    if (mocks.mockPermission.reject) {
      res.status(mocks.mockPermission.statusCode).json({ error: "Forbidden", permission: mocks.mockPermission.permission || "hr.read" });
      return;
    }
    next();
  },
  hasPermission: () => Promise.resolve(true),
}));
vi.mock("../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (mocks.mockAuth.reject) {
      res.status(mocks.mockAuth.statusCode).json({ error: "Unauthorized" });
      return;
    }
    next();
  },
}));
vi.mock("../artifacts/api-server/src/middlewares/tenant", () => ({ tenantId: () => 1, ownedProject: async () => true }));
vi.mock("../artifacts/api-server/src/lib/audit", () => ({ audit: vi.fn() }));

import hrRouter from "../artifacts/api-server/src/routes/hr";

function appWith(router: any) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.organizationId = 1;
    req.vetraUser = { id: 7, organizationId: 1, role: "ADMIN" };
    next();
  });
  app.use(router);
  return app;
}

function appWithNoAuth(router: any) {
  const app = express();
  app.use(express.json());
  // No vetraUser or organizationId set - simulates unauthenticated request
  app.use(router);
  return app;
}

describe("Attendance API — tenant isolation & jalali date support", () => {
  beforeEach(() => { mocks.reset(); mocks.mockAuth.reject = false; mocks.mockPermission.reject = false; });

  it("creates an attendance record within the tenant scope", async () => {
    rows.set(tables.employeesTable, [
      { id: 1, organizationId: 1, code: "E001", firstName: "علی", lastName: "مرادی", phone: "09120000001", position: "engineer", hireDate: "2025-01-01", salary: "10000000", dailyWage: "500000", status: "active", createdBy: 7, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await request(appWith(hrRouter))
      .post("/attendance")
      .send({ employeeId: 1, date: "2026-08-23", checkIn: "08:00", checkOut: "17:00", status: "present", hoursWorked: 9, overtimeHours: 1, notes: "حضور کامل" });
    expect(response.status).toBe(201);
    expect(response.body.employeeId).toBe(1);
    expect(response.body.organizationId).toBe(1);
    expect(response.body.date).toBe("2026-08-23");
    expect(response.body.status).toBe("present");
    expect(response.body.hoursWorked).toBe(9);
    expect(response.body.overtimeHours).toBe(1);
  });

  it("rejects attendance creation for employee not in tenant", async () => {
    rows.set(tables.employeesTable, [
      { id: 99, organizationId: 2, code: "E099", firstName: "Other", lastName: "Org", phone: "09120000099", position: "engineer", hireDate: "2025-01-01", salary: "10000000", dailyWage: "500000", status: "active", createdBy: 99, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await request(appWith(hrRouter))
      .post("/attendance")
      .send({ employeeId: 99, date: "2026-08-23", checkIn: "08:00", checkOut: "17:00" });
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("Employee not found");
  });

  it("lists only attendance records belonging to the tenant", async () => {
    rows.set(tables.employeesTable, [
      { id: 1, organizationId: 1, code: "E001", firstName: "علی", lastName: "مرادی", phone: "09120000001", position: "engineer", hireDate: "2025-01-01", salary: "10000000", dailyWage: "500000", status: "active", createdBy: 7, createdAt: new Date(), updatedAt: new Date() },
    ]);
    rows.set(tables.attendanceTable, [
      { id: 1, employeeId: 1, organizationId: 1, date: "2026-08-23", checkIn: "08:00", checkOut: "17:00", status: "present", hoursWorked: "9", overtimeHours: "1", notes: null, recordedBy: 7, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, employeeId: 99, organizationId: 2, date: "2026-08-23", checkIn: "09:00", checkOut: "18:00", status: "present", hoursWorked: "9", overtimeHours: null, notes: null, recordedBy: 99, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await request(appWith(hrRouter)).get("/attendance");
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].organizationId).toBe(1);
    expect(response.body[0].hoursWorked).toBe(9);
  });

  it("blocks cross-tenant attendance detail access", async () => {
    rows.set(tables.attendanceTable, [
      { id: 10, employeeId: 99, organizationId: 2, date: "2026-08-23", status: "present", recordedBy: 99, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await request(appWith(hrRouter)).get("/attendance/10");
    expect(response.status).toBe(404);
  });

  it("blocks cross-tenant attendance update", async () => {
    rows.set(tables.attendanceTable, [
      { id: 10, employeeId: 99, organizationId: 2, date: "2026-08-23", status: "present", recordedBy: 99, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await request(appWith(hrRouter))
      .patch("/attendance/10")
      .send({ status: "absent" });
    expect(response.status).toBe(404);
  });

  it("requires employeeId and date when creating attendance", async () => {
    const response = await request(appWith(hrRouter))
      .post("/attendance")
      .send({ checkIn: "08:00" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("employeeId");
  });

  it("returns dates in ISO format compatible with Jalali conversion", async () => {
    rows.set(tables.employeesTable, [
      { id: 1, organizationId: 1, code: "E001", firstName: "علی", lastName: "مرادی", phone: "09120000001", position: "engineer", hireDate: "2025-01-01", salary: "10000000", dailyWage: "500000", status: "active", createdBy: 7, createdAt: new Date(), updatedAt: new Date() },
    ]);
    rows.set(tables.attendanceTable, [
      { id: 1, employeeId: 1, organizationId: 1, date: "2026-08-23", checkIn: "08:00", checkOut: "17:00", status: "present", hoursWorked: "9", overtimeHours: "1", notes: null, recordedBy: 7, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const response = await request(appWith(hrRouter)).get("/attendance");
    expect(response.status).toBe(200);
    expect(response.body[0].date).toBe("2026-08-23");
    expect(response.body[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe("Security - authentication & authorization", () => {
    beforeEach(() => {
      mocks.mockAuth.reject = false;
      mocks.mockPermission.reject = false;
    });

    it("rejects unauthenticated attendance list with 401", async () => {
      mocks.mockAuth.reject = true;
      mocks.mockAuth.statusCode = 401;
      const response = await request(appWithNoAuth(hrRouter)).get("/attendance");
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Unauthorized");
    });

    it("rejects unauthenticated attendance create with 401", async () => {
      mocks.mockAuth.reject = true;
      mocks.mockAuth.statusCode = 401;
      const response = await request(appWithNoAuth(hrRouter))
        .post("/attendance")
        .send({ employeeId: 1, date: "2026-08-23" });
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Unauthorized");
    });

    it("rejects unauthenticated attendance detail with 401", async () => {
      mocks.mockAuth.reject = true;
      mocks.mockAuth.statusCode = 401;
      const response = await request(appWithNoAuth(hrRouter)).get("/attendance/1");
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Unauthorized");
    });

    it("rejects attendance list without required permission with 403", async () => {
      mocks.mockPermission.reject = true;
      mocks.mockPermission.statusCode = 403;
      mocks.mockPermission.permission = "hr.read";
      const response = await request(appWith(hrRouter)).get("/attendance");
      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Forbidden");
    });

    it("rejects attendance create without required permission with 403", async () => {
      mocks.mockPermission.reject = true;
      mocks.mockPermission.statusCode = 403;
      mocks.mockPermission.permission = "hr.create";
      const response = await request(appWith(hrRouter))
        .post("/attendance")
        .send({ employeeId: 1, date: "2026-08-23" });
      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Forbidden");
    });
  });

  describe("Security - cross-tenant isolation", () => {
    it("prevents tenant A from reading tenant B attendance via forced organizationId", async () => {
      rows.set(tables.attendanceTable, [
        { id: 1, employeeId: 1, organizationId: 1, date: "2026-08-23", checkIn: "08:00", checkOut: "17:00", status: "present", hoursWorked: "9", overtimeHours: "1", notes: null, recordedBy: 7, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, employeeId: 2, organizationId: 2, date: "2026-08-23", checkIn: "09:00", checkOut: "18:00", status: "present", hoursWorked: "9", overtimeHours: null, notes: null, recordedBy: 8, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const response = await request(appWith(hrRouter)).get("/attendance");
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].organizationId).toBe(1);
    });

    it("prevents tenant A from creating attendance for tenant B employee", async () => {
      rows.set(tables.employeesTable, [
        { id: 99, organizationId: 2, code: "E099", firstName: "Other", lastName: "Org", phone: "09120000099", position: "engineer", hireDate: "2025-01-01", salary: "10000000", dailyWage: "500000", status: "active", createdBy: 99, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const response = await request(appWith(hrRouter))
        .post("/attendance")
        .send({ employeeId: 99, date: "2026-08-23", checkIn: "08:00", checkOut: "17:00" });
      expect(response.status).toBe(404);
      expect(response.body.error).toContain("Employee not found");
    });

    it("prevents tenant A from updating tenant B attendance", async () => {
      rows.set(tables.attendanceTable, [
        { id: 20, employeeId: 99, organizationId: 2, date: "2026-08-23", status: "present", recordedBy: 99, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const response = await request(appWith(hrRouter))
        .patch("/attendance/20")
        .send({ status: "absent" });
      expect(response.status).toBe(404);
    });

    it("prevents tenant A from deleting tenant B attendance", async () => {
      rows.set(tables.attendanceTable, [
        { id: 30, employeeId: 99, organizationId: 2, date: "2026-08-23", status: "present", recordedBy: 99, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const response = await request(appWith(hrRouter)).delete("/attendance/30");
      expect(response.status).toBe(404);
    });
  });

});
