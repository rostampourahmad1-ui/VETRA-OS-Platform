import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock setup ───────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => {
  const tables = Object.fromEntries(
    [
      "projectsTable",
      "tasksTable",
      "usersTable",
      "equipmentTable",
      "auditLogsTable",
      "expensesTable",
    ].map((name) => [name, { name }]),
  ) as Record<string, any>;

  const rows = new Map<any, any[]>();

  const db = {
    select: vi.fn(() => {
      let table: any;
      return {
        from(value: any) {
          table = value;
          return this;
        },
        where() {
          return this;
        },
        orderBy() {
          return this;
        },
        limit(n: number) {
          return Promise.resolve(rows.get(table)?.slice(0, n) ?? []);
        },
        offset(_n: number) {
          return this;
        },
        then(resolve: any, reject?: any) {
          return Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
        },
      };
    }),
  };

  return { tables, rows, db };
});

const { tables, rows, db } = mocks;
vi.mock("@workspace/db", () => ({ ...mocks.tables, db: mocks.db }));
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: (...args: any[]) => args,
  desc: () => ({}),
  sql: () => ({}),
}));
vi.mock("../artifacts/api-server/src/middlewares/permissions", () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../artifacts/api-server/src/middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../artifacts/api-server/src/middlewares/tenant", () => ({
  tenantId: () => 1,
}));

import dashboardRouter from "../artifacts/api-server/src/routes/dashboard";

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Dashboard API", () => {
  beforeEach(() => {
    rows.clear();
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  describe("GET /dashboard/summary", () => {
    it("returns correct response shape with all required fields", async () => {
      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          status: "active",
          budget: "100000",
          spent: "30000",
          progress: "45",
          endDate: "2027-01-01",
          name: "Project A",
        },
      ]);
      rows.set(tables.tasksTable, [
        { id: 1, organizationId: 1, status: "todo", dueDate: "2026-12-01" },
        { id: 2, organizationId: 1, status: "review", dueDate: "2026-06-01" },
        { id: 3, organizationId: 1, status: "done", dueDate: "2026-05-01" },
      ]);
      rows.set(tables.usersTable, [
        { id: 1, organizationId: 1 },
        { id: 2, organizationId: 1 },
      ]);
      rows.set(tables.equipmentTable, [
        { id: 1, organizationId: 1, status: "in-use" },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/summary");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("activeProjects");
      expect(res.body).toHaveProperty("totalBudget");
      expect(res.body).toHaveProperty("spentBudget");
      expect(res.body).toHaveProperty("overallProgress");
      expect(res.body).toHaveProperty("delayedActivities");
      expect(res.body).toHaveProperty("totalWorkforce");
      expect(res.body).toHaveProperty("pendingApprovals");
      expect(res.body).toHaveProperty("equipmentActive");
      expect(res.body).toHaveProperty("equipmentTotal");
      expect(res.body).toHaveProperty("openTasks");
      expect(res.body).toHaveProperty("overdueTasksCount");
    });

    it("returns zero values for empty tenant", async () => {
      rows.set(tables.projectsTable, []);
      rows.set(tables.tasksTable, []);
      rows.set(tables.usersTable, []);
      rows.set(tables.equipmentTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/summary");

      expect(res.status).toBe(200);
      expect(res.body.activeProjects).toBe(0);
      expect(res.body.totalBudget).toBe(0);
      expect(res.body.spentBudget).toBe(0);
      expect(res.body.overallProgress).toBe(0);
      expect(res.body.totalWorkforce).toBe(0);
      expect(res.body.pendingApprovals).toBe(0);
      expect(res.body.equipmentActive).toBe(0);
      expect(res.body.openTasks).toBe(0);
    });

    it("computes overall progress correctly", async () => {
      rows.set(tables.projectsTable, [
        { id: 1, organizationId: 1, status: "active", budget: "100", spent: "0", progress: "50", endDate: "2027-01-01" },
        { id: 2, organizationId: 1, status: "active", budget: "100", spent: "0", progress: "30", endDate: "2027-01-01" },
      ]);
      rows.set(tables.tasksTable, []);
      rows.set(tables.usersTable, []);
      rows.set(tables.equipmentTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/summary");

      expect(res.body.overallProgress).toBe(40.0);
      expect(res.body.activeProjects).toBe(2);
    });

    it("counts only active projects for activeProjects", async () => {
      rows.set(tables.projectsTable, [
        { id: 1, organizationId: 1, status: "active", budget: "100", spent: "0", progress: "0", endDate: "2027-01-01" },
        { id: 2, organizationId: 1, status: "completed", budget: "100", spent: "0", progress: "100", endDate: "2026-01-01" },
        { id: 3, organizationId: 1, status: "on-hold", budget: "100", spent: "0", progress: "0", endDate: "2027-01-01" },
      ]);
      rows.set(tables.tasksTable, []);
      rows.set(tables.usersTable, []);
      rows.set(tables.equipmentTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/summary");

      expect(res.body.activeProjects).toBe(1);
    });

    it("counts delayed activities (active projects past endDate)", async () => {
      const pastDate = "2020-01-01";
      rows.set(tables.projectsTable, [
        { id: 1, organizationId: 1, status: "active", budget: "100", spent: "0", progress: "0", endDate: pastDate },
        { id: 2, organizationId: 1, status: "active", budget: "100", spent: "0", progress: "0", endDate: "2099-01-01" },
      ]);
      rows.set(tables.tasksTable, []);
      rows.set(tables.usersTable, []);
      rows.set(tables.equipmentTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/summary");

      expect(res.body.delayedActivities).toBe(1);
    });

    it("filters tasks correctly for pendingApprovals and openTasks", async () => {
      rows.set(tables.projectsTable, []);
      rows.set(tables.tasksTable, [
        { id: 1, organizationId: 1, status: "review", dueDate: "2027-01-01" },
        { id: 2, organizationId: 1, status: "todo", dueDate: "2027-01-01" },
        { id: 3, organizationId: 1, status: "in-progress", dueDate: "2027-01-01" },
        { id: 4, organizationId: 1, status: "done", dueDate: "2027-01-01" },
      ]);
      rows.set(tables.usersTable, []);
      rows.set(tables.equipmentTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/summary");

      expect(res.body.pendingApprovals).toBe(1);
      expect(res.body.openTasks).toBe(3);
    });
  });

  // ── Project Health ─────────────────────────────────────────────────────────
  describe("GET /dashboard/project-health", () => {
    it("returns correct response shape for each project", async () => {
      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          name: "Healthy Project",
          status: "active",
          budget: "100000",
          spent: "20000",
          progress: "60",
          endDate: "2099-12-31",
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty("projectId");
      expect(res.body[0]).toHaveProperty("projectName");
      expect(res.body[0]).toHaveProperty("progress");
      expect(res.body[0]).toHaveProperty("status");
      expect(res.body[0]).toHaveProperty("health");
      expect(res.body[0]).toHaveProperty("budgetUsed");
      expect(res.body[0]).toHaveProperty("budgetTotal");
      expect(res.body[0]).toHaveProperty("daysRemaining");
    });

    it("returns empty array for no projects", async () => {
      rows.set(tables.projectsTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("marks overdue project as critical", async () => {
      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          name: "Overdue",
          status: "active",
          budget: "100000",
          spent: "10000",
          progress: "10",
          endDate: "2020-01-01",
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.body[0].health).toBe("critical");
      expect(res.body[0].daysRemaining).toBeLessThan(0);
    });

    it("marks on-hold project as critical", async () => {
      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          name: "On Hold",
          status: "on-hold",
          budget: "100000",
          spent: "10000",
          progress: "10",
          endDate: "2099-01-01",
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.body[0].health).toBe("critical");
    });

    it("marks over-budget project as critical", async () => {
      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          name: "Over Budget",
          status: "active",
          budget: "100000",
          spent: "96000",
          progress: "50",
          endDate: "2099-01-01",
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.body[0].health).toBe("critical");
    });

    it("marks project with less than 30 days remaining as warning", async () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 15);
      const soonStr = soon.toISOString().split("T")[0];

      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          name: "Due Soon",
          status: "active",
          budget: "100000",
          spent: "10000",
          progress: "50",
          endDate: soonStr,
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.body[0].health).toBe("warning");
    });

    it("marks healthy project as good", async () => {
      rows.set(tables.projectsTable, [
        {
          id: 1,
          organizationId: 1,
          name: "Healthy",
          status: "active",
          budget: "100000",
          spent: "20000",
          progress: "60",
          endDate: "2099-12-31",
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/project-health");

      expect(res.body[0].health).toBe("good");
    });
  });

  // ── Recent Activity ────────────────────────────────────────────────────────
  describe("GET /dashboard/recent-activity", () => {
    it("returns activity items from auditLogsTable with correct shape", async () => {
      rows.set(tables.auditLogsTable, [
        {
          id: 1,
          organizationId: 1,
          action: "project.created",
          resource: "project",
          actorId: 7,
          actorClerkId: "clerk_abc",
          createdAt: new Date("2026-09-01"),
        },
        {
          id: 2,
          organizationId: 1,
          action: "task.created",
          resource: "task",
          actorId: null,
          actorClerkId: null,
          createdAt: new Date("2026-09-02"),
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/recent-activity");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      const item = res.body[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("description");
      expect(item).toHaveProperty("user");
      expect(item).toHaveProperty("projectName");
      expect(item).toHaveProperty("createdAt");

      expect(res.body[0].type).toBe("project.created");
      expect(res.body[0].description).toBe("project");
    });

    it("returns empty array when no audit logs exist", async () => {
      rows.set(tables.auditLogsTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/recent-activity");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("maps missing actor to fallback user string", async () => {
      rows.set(tables.auditLogsTable, [
        {
          id: 1,
          organizationId: 1,
          action: "task.created",
          resource: "task",
          actorId: null,
          actorClerkId: null,
          createdAt: new Date(),
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/recent-activity");

      expect(res.body[0].user).toBe("user:unknown");
    });

    it("maps actorId-only to fallback string", async () => {
      rows.set(tables.auditLogsTable, [
        {
          id: 1,
          organizationId: 1,
          action: "task.created",
          resource: "task",
          actorId: 5,
          actorClerkId: null,
          createdAt: new Date(),
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/recent-activity");

      expect(res.body[0].user).toBe("user:5");
    });

    it("uses actorClerkId when available", async () => {
      rows.set(tables.auditLogsTable, [
        {
          id: 1,
          organizationId: 1,
          action: "task.created",
          resource: "task",
          actorId: 5,
          actorClerkId: "clerk_xyz",
          createdAt: new Date(),
        },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/recent-activity");

      expect(res.body[0].user).toBe("clerk_xyz");
    });
  });

  // ── Cash Flow ──────────────────────────────────────────────────────────────
  describe("GET /dashboard/cash-flow", () => {
    it("returns 12 months of data with correct shape", async () => {
      rows.set(tables.expensesTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/cash-flow");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(12);

      for (const entry of res.body) {
        expect(entry).toHaveProperty("month");
        expect(entry).toHaveProperty("income");
        expect(entry).toHaveProperty("expense");
        expect(typeof entry.month).toBe("string");
        expect(typeof entry.income).toBe("number");
        expect(typeof entry.expense).toBe("number");
      }
    });

    it("reports zero income because no revenue tracking exists", async () => {
      rows.set(tables.expensesTable, [
        { organizationId: 1, amount: "500", expenseDate: "2026-09-01" },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/cash-flow");

      const allIncome = res.body.every((e: any) => e.income === 0);
      expect(allIncome).toBe(true);
    });

    it("reports zero expense for months with no data", async () => {
      rows.set(tables.expensesTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/cash-flow");

      for (const entry of res.body) {
        expect(entry.expense).toBe(0);
      }
    });

    it("aggregates expenses by month correctly", async () => {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      rows.set(tables.expensesTable, [
        { organizationId: 1, amount: "100", expenseDate: `${thisMonth}-05` },
        { organizationId: 1, amount: "200", expenseDate: `${thisMonth}-10` },
        { organizationId: 1, amount: "50", expenseDate: `${thisMonth}-15` },
      ]);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/cash-flow");

      const currentMonth = res.body[11];
      expect(currentMonth.expense).toBe(350);
    });

    it("produces correct chronological order (oldest to newest)", async () => {
      rows.set(tables.expensesTable, []);

      const res = await request(appWith(dashboardRouter)).get("/dashboard/cash-flow");

      const monthNames = res.body.map((e: any) => e.month);
      const validMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      const firstIdx = validMonths.indexOf(monthNames[0]);
      expect(firstIdx).toBeGreaterThanOrEqual(0);

      for (let i = 0; i < 12; i++) {
        const expectedIdx = (firstIdx + i) % 12;
        expect(monthNames[i]).toBe(validMonths[expectedIdx]);
      }
    });
  });
});
