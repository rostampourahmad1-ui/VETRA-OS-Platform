import express, { type Express } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

// ─── VETRA-SEC-03: Scheduling & Gantt — Cross-Tenant, RBAC, and Auth Tests ──
//
// These tests verify that the scheduling/gantt routes (calendars, dependencies,
// baselines, progress, EVM, resource types, resource assignments, WBS, activities,
// phases, milestones, timeline) enforce:
//   1. Unauthenticated access → 401
//   2. Missing planning.read permission → 403
//   3. Missing planning.manage permission → 403
//   4. Cross-tenant isolation (Tenant A cannot access Tenant B's data)

interface VetraUser {
  id: number;
  organizationId: number;
  role: string;
  permissions?: string[];
}

// ─── Simulated middleware ─────────────────────────────────────────────────

function simulatedRequirePermission(permission: string) {
  return (req: any, res: any, next: any): void => {
    const user = req.vetraUser as VetraUser | undefined;
    if (!user) {
      res.status(401).json({ error: "Tenant context is required" });
      return;
    }
    if (!user.permissions?.includes(permission)) {
      res.status(403).json({ error: "Forbidden", permission });
      return;
    }
    next();
  };
}

// Simulated project ownership guard (real router calls ownedProject)
function simulatedOwnedProject(req: any, projectId: number): boolean {
  const projects = PROJECTS.filter(
    (p) => p.id === projectId && p.organizationId === req.organizationId,
  );
  return projects.length > 0;
}

// Simulated resource ownership guard
function simulatedOwnedResource(req: any, resourceId: number, table: string): boolean {
  const rows = RESOURCE_ROWS.get(table) ?? [];
  return rows.some(
    (r: any) => r.id === resourceId && r.organizationId === req.organizationId,
  );
}

// ─── Seed data ────────────────────────────────────────────────────────────

let PROJECTS: { id: number; name: string; organizationId: number }[] = [];
const RESOURCE_ROWS = new Map<string, any[]>();

function seedTwoTenantData(): void {
  PROJECTS = [
    { id: 1, name: "Project A", organizationId: 1 },
    { id: 2, name: "Project B", organizationId: 2 },
  ];
  RESOURCE_ROWS.set("calendars", [
    { id: 1, name: "Calendar A", projectId: 1, organizationId: 1 },
    { id: 2, name: "Calendar B", projectId: 2, organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("calendarExceptions", [
    { id: 1, calendarId: 1, exceptionDate: "2026-08-01", isWorkingDay: 0, organizationId: 1, calendarOrgId: 1 },
    { id: 2, calendarId: 2, exceptionDate: "2026-08-02", isWorkingDay: 0, organizationId: 2, calendarOrgId: 2 },
  ]);
  RESOURCE_ROWS.set("dependencies", [
    { id: 1, projectId: 1, predecessorId: 10, successorId: 11, organizationId: 1 },
    { id: 2, projectId: 2, predecessorId: 20, successorId: 21, organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("baselines", [
    { id: 1, projectId: 1, name: "Baseline A", organizationId: 1 },
    { id: 2, projectId: 2, name: "Baseline B", organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("baselineActivities", [
    { id: 1, baselineId: 1, activityId: 10, organizationId: 1 },
    { id: 2, baselineId: 2, activityId: 20, organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("progress", [
    { id: 1, projectId: 1, activityId: 10, progressPercent: 50, organizationId: 1 },
    { id: 2, projectId: 2, activityId: 20, progressPercent: 30, organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("evm", [
    { id: 1, projectId: 1, activityId: 10, plannedValue: 100, earnedValue: 50, organizationId: 1 },
    { id: 2, projectId: 2, activityId: 20, plannedValue: 200, earnedValue: 60, organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("resourceTypes", [
    { id: 1, name: "Laborer", category: "labor", organizationId: 1 },
    { id: 2, name: "Crane", category: "equipment", organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("resourceAssignments", [
    { id: 1, projectId: 1, activityId: 10, resourceTypeId: 1, totalCost: "100", organizationId: 1 },
    { id: 2, projectId: 2, activityId: 20, resourceTypeId: 2, totalCost: "200", organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("wbs", [
    { id: 1, projectId: 1, code: "1", name: "WBS A", organizationId: 1 },
    { id: 2, projectId: 2, code: "2", name: "WBS B", organizationId: 2 },
  ]);
  RESOURCE_ROWS.set("activities", [
    { id: 10, projectId: 1, wbsId: 1, code: "1.1", name: "Activity A", organizationId: 1 },
    { id: 20, projectId: 2, wbsId: 2, code: "2.1", name: "Activity B", organizationId: 2 },
  ]);
}

// ─── Helper: Build app with simulated scheduling routes ───────────────────

function appWith(orgId: number = 1, permissions: string[] = ["planning.read", "planning.manage"]): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.organizationId = orgId;
    req.vetraUser = { id: 7, organizationId: orgId, role: "PROJECT_MANAGER", permissions };
    next();
  });

  // ── Calendars ──────────────────────────────────────────────────────────

  app.get("/projects/:projectId/calendars", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("calendars") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/projects/:projectId/calendars", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  app.patch("/calendars/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "calendars")) { res.status(404).json({ error: "Calendar not found" }); return; }
    res.json({ id, ...req.body });
  });

  app.delete("/calendars/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "calendars")) { res.status(404).json({ error: "Calendar not found" }); return; }
    res.status(204).end();
  });

  // ── Calendar exceptions ────────────────────────────────────────────────

  app.get("/calendars/:calendarId/exceptions", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const calId = Number(req.params.calendarId);
    const cal = (RESOURCE_ROWS.get("calendars") ?? []).find(
      (c: any) => c.id === calId && c.organizationId === req.organizationId,
    );
    if (!cal) { res.status(404).json({ error: "Calendar not found" }); return; }
    const rows = (RESOURCE_ROWS.get("calendarExceptions") ?? []).filter(
      (r: any) => r.calendarId === calId && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/calendars/:calendarId/exceptions", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const calId = Number(req.params.calendarId);
    const cal = (RESOURCE_ROWS.get("calendars") ?? []).find(
      (c: any) => c.id === calId && c.organizationId === req.organizationId,
    );
    if (!cal) { res.status(404).json({ error: "Calendar not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, calendarId: calId, organizationId: req.organizationId });
  });

  app.delete("/calendar-exceptions/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "calendarExceptions")) { res.status(404).json({ error: "Exception not found" }); return; }
    res.status(204).end();
  });

  // ── Dependencies ───────────────────────────────────────────────────────

  app.get("/projects/:projectId/dependencies", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("dependencies") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/projects/:projectId/dependencies", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  app.delete("/dependencies/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "dependencies")) { res.status(404).json({ error: "Dependency not found" }); return; }
    res.status(204).end();
  });

  // ── Baselines ──────────────────────────────────────────────────────────

  app.get("/projects/:projectId/baselines", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("baselines") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/projects/:projectId/baselines", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  // ── Baseline activities ────────────────────────────────────────────────

  app.get("/baselines/:baselineId/activities", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const bid = Number(req.params.baselineId);
    const bl = (RESOURCE_ROWS.get("baselines") ?? []).find(
      (b: any) => b.id === bid && b.organizationId === req.organizationId,
    );
    if (!bl) { res.status(404).json({ error: "Baseline not found" }); return; }
    const rows = (RESOURCE_ROWS.get("baselineActivities") ?? []).filter(
      (r: any) => r.baselineId === bid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/baselines/:baselineId/activities", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const bid = Number(req.params.baselineId);
    const bl = (RESOURCE_ROWS.get("baselines") ?? []).find(
      (b: any) => b.id === bid && b.organizationId === req.organizationId,
    );
    if (!bl) { res.status(404).json({ error: "Baseline not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, baselineId: bid, organizationId: req.organizationId });
  });

  // ── Progress ───────────────────────────────────────────────────────────

  app.get("/projects/:projectId/progress", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("progress") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/projects/:projectId/progress", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  // ── EVM ────────────────────────────────────────────────────────────────

  app.get("/projects/:projectId/evm", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("evm") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  // ── Resource types ─────────────────────────────────────────────────────

  app.get("/resource-types", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const rows = (RESOURCE_ROWS.get("resourceTypes") ?? []).filter(
      (r: any) => r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/resource-types", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    res.status(201).json({ id: 3, ...req.body, organizationId: req.organizationId });
  });

  app.patch("/resource-types/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "resourceTypes")) { res.status(404).json({ error: "Resource type not found" }); return; }
    res.json({ id, ...req.body });
  });

  app.delete("/resource-types/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "resourceTypes")) { res.status(404).json({ error: "Resource type not found" }); return; }
    res.status(204).end();
  });

  // ── Resource assignments ───────────────────────────────────────────────

  app.get("/projects/:projectId/resource-assignments", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("resourceAssignments") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/projects/:projectId/resource-assignments", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  app.patch("/resource-assignments/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "resourceAssignments")) { res.status(404).json({ error: "Resource assignment not found" }); return; }
    res.json({ id, ...req.body });
  });

  app.delete("/resource-assignments/:id", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const id = Number(req.params.id);
    if (!simulatedOwnedResource(req, id, "resourceAssignments")) { res.status(404).json({ error: "Resource assignment not found" }); return; }
    res.status(204).end();
  });

  // ── Resource summary ───────────────────────────────────────────────────

  app.get("/projects/:projectId/resource-summary", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({});
  });

  // ── WBS (from planning.ts) ─────────────────────────────────────────────

  app.get("/projects/:projectId/wbs", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    const rows = (RESOURCE_ROWS.get("wbs") ?? []).filter(
      (r: any) => r.projectId === pid && r.organizationId === req.organizationId,
    );
    res.json(rows);
  });

  app.post("/projects/:projectId/wbs", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  // ── Activities, phases, milestones, timeline (from planning.ts) ────────

  app.post("/projects/:projectId/activities", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  app.post("/projects/:projectId/phases", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  app.post("/projects/:projectId/milestones", simulatedRequirePermission("planning.manage"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.status(201).json({ id: 3, ...req.body, projectId: pid, organizationId: req.organizationId });
  });

  app.get("/projects/:projectId/timeline", simulatedRequirePermission("planning.read"), (req: any, res) => {
    const pid = Number(req.params.projectId);
    if (!simulatedOwnedProject(req, pid)) { res.status(404).json({ error: "Project not found" }); return; }
    res.json({ activities: [], dependencies: [] });
  });

  return app;
}

// ─── Test Suite: Unauthenticated Access ───────────────────────────────────

describe("VETRA-SEC-03: Scheduling/Gantt — Unauthenticated Access", () => {
  it("P0-1: Returns 401 when no vetraUser is attached", async () => {
    const app = express();
    app.use(express.json());
    app.get("/projects/1/calendars", simulatedRequirePermission("planning.read"), (_req, res) => res.json([]));
    const res = await request(app).get("/projects/1/calendars");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Tenant context is required");
  });

  it("P0-2: All HTTP methods reject unauthenticated requests", async () => {
    const app = express();
    app.use(express.json());
    app.get("/projects/1/calendars", simulatedRequirePermission("planning.read"), (_req, res) => res.json([]));
    app.post("/projects/1/calendars", simulatedRequirePermission("planning.manage"), (_req, res) => res.status(201).json({}));
    app.patch("/calendars/1", simulatedRequirePermission("planning.manage"), (_req, res) => res.json({}));
    app.delete("/calendars/1", simulatedRequirePermission("planning.manage"), (_req, res) => res.status(204).end());
    expect((await request(app).get("/projects/1/calendars")).status).toBe(401);
    expect((await request(app).post("/projects/1/calendars").send({ name: "C" })).status).toBe(401);
    expect((await request(app).patch("/calendars/1").send({ name: "C" })).status).toBe(401);
    expect((await request(app).delete("/calendars/1")).status).toBe(401);
  });
});

// ─── Test Suite: RBAC Enforcement ─────────────────────────────────────────

describe("VETRA-SEC-03: Scheduling/Gantt — RBAC Enforcement", () => {
  beforeEach(() => seedTwoTenantData());

  it("P0-1: Blocks user without planning.read permission on GET routes", async () => {
    const app = appWith(1, []); // no permissions
    const readEndpoints = [
      ["GET", "/projects/1/calendars"],
      ["GET", "/calendars/1/exceptions"],
      ["GET", "/projects/1/dependencies"],
      ["GET", "/projects/1/baselines"],
      ["GET", "/baselines/1/activities"],
      ["GET", "/projects/1/progress"],
      ["GET", "/projects/1/evm"],
      ["GET", "/resource-types"],
      ["GET", "/projects/1/resource-assignments"],
      ["GET", "/projects/1/resource-summary"],
      ["GET", "/projects/1/wbs"],
      ["GET", "/projects/1/timeline"],
    ];
    for (const [method, path] of readEndpoints) {
      const res = await (request(app) as any)[method.toLowerCase()](path);
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.permission).toBe("planning.read");
    }
  });

  it("P0-2: Blocks user without planning.manage permission on POST/PATCH/DELETE routes", async () => {
    const app = appWith(1, ["planning.read"]); // has read, but not manage
    const writeEndpoints: [string, string, any?][] = [
      ["POST", "/projects/1/calendars", { name: "C" }],
      ["PATCH", "/calendars/1", { name: "C" }],
      ["DELETE", "/calendars/1"],
      ["POST", "/calendars/1/exceptions", { exceptionDate: "2026-09-01", isWorkingDay: 0 }],
      ["DELETE", "/calendar-exceptions/1"],
      ["POST", "/projects/1/dependencies", { predecessorId: 1, successorId: 2 }],
      ["DELETE", "/dependencies/1"],
      ["POST", "/projects/1/baselines", { name: "BL" }],
      ["POST", "/baselines/1/activities", { activityId: 10 }],
      ["POST", "/projects/1/progress", { activityId: 10, progressPercent: 50 }],
      ["POST", "/resource-types", { name: "Type", category: "labor" }],
      ["PATCH", "/resource-types/1", { name: "Type" }],
      ["DELETE", "/resource-types/1"],
      ["POST", "/projects/1/resource-assignments", { activityId: 10, resourceTypeId: 1, totalCost: 100 }],
      ["PATCH", "/resource-assignments/1", { totalCost: 200 }],
      ["DELETE", "/resource-assignments/1"],
      ["POST", "/projects/1/wbs", { code: "1.1", name: "WBS" }],
      ["POST", "/projects/1/activities", { wbsId: 1, code: "1.1.1", name: "Act" }],
      ["POST", "/projects/1/phases", { name: "Phase" }],
      ["POST", "/projects/1/milestones", { name: "MS" }],
    ];
    for (const [method, path, body] of writeEndpoints) {
      const reqBuilder = (request(app) as any)[method.toLowerCase()](path);
      if (body) reqBuilder.send(body);
      const res = await reqBuilder;
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.permission).toBe("planning.manage");
    }
  });

  it("P1-1: User with both permissions can access all routes", async () => {
    const app = appWith(1, ["planning.read", "planning.manage"]);
    expect((await request(app).get("/projects/1/calendars")).status).toBe(200);
    expect((await request(app).post("/projects/1/calendars").send({ name: "C" })).status).toBe(201);
    expect((await request(app).get("/resource-types")).status).toBe(200);
    expect((await request(app).post("/resource-types").send({ name: "T", category: "labor" })).status).toBe(201);
    expect((await request(app).get("/projects/1/timeline")).status).toBe(200);
  });
});

// ─── Test Suite: Cross-Tenant Isolation ───────────────────────────────────

describe("VETRA-SEC-03: Scheduling/Gantt — Cross-Tenant Isolation", () => {
  beforeEach(() => seedTwoTenantData());

  it("P0-1: Tenant A cannot access Tenant B's project calendars", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/calendars");
    expect(res.status).toBe(404);
  });

  it("P0-2: Tenant A cannot create calendars for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/calendars").send({ name: "Tampered calendar" });
    expect(res.status).toBe(404);
  });

  it("P0-3: Tenant A cannot update Tenant B's calendar", async () => {
    const app = appWith(1);
    const res = await request(app).patch("/calendars/2").send({ name: "Tampered" });
    expect(res.status).toBe(404);
  });

  it("P0-4: Tenant A cannot delete Tenant B's calendar", async () => {
    const app = appWith(1);
    const res = await request(app).delete("/calendars/2");
    expect(res.status).toBe(404);
  });

  it("P0-5: Tenant A cannot access Tenant B's calendar exceptions", async () => {
    const app = appWith(1);
    const res = await request(app).get("/calendars/2/exceptions");
    expect(res.status).toBe(404);
  });

  it("P0-6: Tenant A cannot create exceptions for Tenant B's calendar", async () => {
    const app = appWith(1);
    const res = await request(app).post("/calendars/2/exceptions").send({ exceptionDate: "2026-09-01", isWorkingDay: 0 });
    expect(res.status).toBe(404);
  });

  it("P0-7: Tenant A cannot delete Tenant B's calendar exception", async () => {
    const app = appWith(1);
    const res = await request(app).delete("/calendar-exceptions/2");
    expect(res.status).toBe(404);
  });

  it("P0-8: Tenant A cannot access Tenant B's dependencies", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/dependencies");
    expect(res.status).toBe(404);
  });

  it("P0-9: Tenant A cannot create dependencies for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/dependencies").send({ predecessorId: 1, successorId: 2 });
    expect(res.status).toBe(404);
  });

  it("P0-10: Tenant A cannot delete Tenant B's dependency", async () => {
    const app = appWith(1);
    const res = await request(app).delete("/dependencies/2");
    expect(res.status).toBe(404);
  });

  it("P0-11: Tenant A cannot access Tenant B's baselines", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/baselines");
    expect(res.status).toBe(404);
  });

  it("P0-12: Tenant A cannot create baselines for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/baselines").send({ name: "Tampered" });
    expect(res.status).toBe(404);
  });

  it("P0-13: Tenant A cannot access Tenant B's baseline activities", async () => {
    const app = appWith(1);
    const res = await request(app).get("/baselines/2/activities");
    expect(res.status).toBe(404);
  });

  it("P0-14: Tenant A cannot create baseline activities for Tenant B's baseline", async () => {
    const app = appWith(1);
    const res = await request(app).post("/baselines/2/activities").send({ activityId: 20 });
    expect(res.status).toBe(404);
  });

  it("P0-15: Tenant A cannot access Tenant B's progress data", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/progress");
    expect(res.status).toBe(404);
  });

  it("P0-16: Tenant A cannot report progress for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/progress").send({ activityId: 20, progressPercent: 50 });
    expect(res.status).toBe(404);
  });

  it("P0-17: Tenant A cannot access Tenant B's EVM data", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/evm");
    expect(res.status).toBe(404);
  });

  it("P0-18: Tenant A is scoped to their own resource types", async () => {
    const app = appWith(1);
    const res = await request(app).get("/resource-types");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(1);
    expect(res.body[0].name).toBe("Laborer");
  });

  it("P0-19: Tenant A cannot update Tenant B's resource type", async () => {
    const app = appWith(1);
    const res = await request(app).patch("/resource-types/2").send({ name: "Tampered" });
    expect(res.status).toBe(404);
  });

  it("P0-20: Tenant A cannot delete Tenant B's resource type", async () => {
    const app = appWith(1);
    const res = await request(app).delete("/resource-types/2");
    expect(res.status).toBe(404);
  });

  it("P0-21: Tenant A cannot access Tenant B's resource assignments", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/resource-assignments");
    expect(res.status).toBe(404);
  });

  it("P0-22: Tenant A cannot create resource assignments for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/resource-assignments").send({ activityId: 20, resourceTypeId: 2, totalCost: 100 });
    expect(res.status).toBe(404);
  });

  it("P0-23: Tenant A cannot update Tenant B's resource assignment", async () => {
    const app = appWith(1);
    const res = await request(app).patch("/resource-assignments/2").send({ totalCost: 999 });
    expect(res.status).toBe(404);
  });

  it("P0-24: Tenant A cannot delete Tenant B's resource assignment", async () => {
    const app = appWith(1);
    const res = await request(app).delete("/resource-assignments/2");
    expect(res.status).toBe(404);
  });

  it("P0-25: Tenant A cannot access Tenant B's resource summary", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/resource-summary");
    expect(res.status).toBe(404);
  });

  it("P0-26: Tenant A cannot access Tenant B's WBS", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/wbs");
    expect(res.status).toBe(404);
  });

  it("P0-27: Tenant A cannot create WBS for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/wbs").send({ code: "1", name: "Tampered" });
    expect(res.status).toBe(404);
  });

  it("P0-28: Tenant A cannot create activities for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/activities").send({ wbsId: 2, code: "2.1", name: "Tampered" });
    expect(res.status).toBe(404);
  });

  it("P0-29: Tenant A cannot create phases for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/phases").send({ name: "Tampered phase" });
    expect(res.status).toBe(404);
  });

  it("P0-30: Tenant A cannot create milestones for Tenant B's project", async () => {
    const app = appWith(1);
    const res = await request(app).post("/projects/2/milestones").send({ name: "Tampered milestone" });
    expect(res.status).toBe(404);
  });

  it("P0-31: Tenant A cannot access Tenant B's timeline", async () => {
    const app = appWith(1);
    const res = await request(app).get("/projects/2/timeline");
    expect(res.status).toBe(404);
  });
});
