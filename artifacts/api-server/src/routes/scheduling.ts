import { Router } from "express";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  projectsTable,
  planningActivitiesTable,
  projectCalendarsTable,
  calendarExceptionsTable,
  activityDependenciesTable,
  baselinesTable,
  baselineActivitiesTable,
  actualProgressTable,
  evmMetricsTable,
  resourceTypesTable,
  resourceAssignmentsTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/permissions";
import { tenantId, ownedProject } from "../middlewares/tenant";
import { audit } from "../lib/audit";

const router = Router();

const idInput = z.coerce.number().int().positive();

// ─── Calendars ────────────────────────────────────────────────────────────────

const calendarInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  isDefault: z.coerce.number().int().min(0).max(1).default(0),
  workDays: z.string().trim().default("1,2,3,4,5,6"),
  workStartHour: z.string().trim().default("08:00"),
  workEndHour: z.string().trim().default("17:00"),
});

router.get("/projects/:projectId/calendars", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await db.select().from(projectCalendarsTable).where(and(
    eq(projectCalendarsTable.projectId, projectId.data),
    eq(projectCalendarsTable.organizationId, tenantId(req)),
    isNull(projectCalendarsTable.deletedAt),
  )).orderBy(asc(projectCalendarsTable.name));
  res.json(rows);
});

router.post("/projects/:projectId/calendars", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = calendarInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid calendar input" }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(projectCalendarsTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.calendar.created", "calendar", { resourceId: row.id, newValues: { name: row.name, projectId: row.projectId } });
});

router.patch("/calendars/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  const parsed = calendarInput.partial().safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [old] = await db.select().from(projectCalendarsTable).where(and(eq(projectCalendarsTable.id, id.data), eq(projectCalendarsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Calendar not found" }); return; }
  const [row] = await db.update(projectCalendarsTable).set(parsed.data).where(and(eq(projectCalendarsTable.id, id.data), eq(projectCalendarsTable.organizationId, tenantId(req)))).returning();
  res.json(row);
  audit(req, "scheduling.calendar.updated", "calendar", { resourceId: id.data, oldValues: { name: old.name }, newValues: { name: row.name } });
});

router.delete("/calendars/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [old] = await db.select().from(projectCalendarsTable).where(and(eq(projectCalendarsTable.id, id.data), eq(projectCalendarsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Calendar not found" }); return; }
  await db.update(projectCalendarsTable).set({ deletedAt: new Date() }).where(eq(projectCalendarsTable.id, id.data));
  res.status(204).send();
  audit(req, "scheduling.calendar.deleted", "calendar", { resourceId: id.data });
});

// ─── Calendar Exceptions ──────────────────────────────────────────────────────

const exceptionInput = z.object({
  calendarId: idInput,
  exceptionDate: z.string().date(),
  isWorkingDay: z.coerce.number().int().min(0).max(1).default(0),
  description: z.string().trim().max(500).optional().nullable(),
});

router.get("/calendars/:calendarId/exceptions", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const calendarId = idInput.safeParse(req.params.calendarId);
  if (!calendarId.success) { res.status(400).json({ error: "Invalid calendar id" }); return; }
  const rows = await db.select().from(calendarExceptionsTable).where(and(
    eq(calendarExceptionsTable.calendarId, calendarId.data),
    eq(calendarExceptionsTable.organizationId, tenantId(req)),
  )).orderBy(asc(calendarExceptionsTable.exceptionDate));
  res.json(rows);
});

router.post("/calendars/:calendarId/exceptions", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const calendarId = idInput.safeParse(req.params.calendarId);
  const parsed = exceptionInput.omit({ calendarId: true }).safeParse(req.body);
  if (!calendarId.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const orgId = tenantId(req);
  const [cal] = await db.select().from(projectCalendarsTable).where(and(eq(projectCalendarsTable.id, calendarId.data), eq(projectCalendarsTable.organizationId, orgId)));
  if (!cal) { res.status(404).json({ error: "Calendar not found" }); return; }
  const [row] = await db.insert(calendarExceptionsTable).values({
    ...parsed.data, calendarId: calendarId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
});

// ─── Activity Dependencies (CPM) ──────────────────────────────────────────────

const dependencyInput = z.object({
  predecessorId: idInput,
  successorId: idInput,
  dependencyType: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lagDays: z.coerce.number().int().default(0),
});

router.get("/projects/:projectId/dependencies", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await db.select().from(activityDependenciesTable).where(and(
    eq(activityDependenciesTable.projectId, projectId.data),
    eq(activityDependenciesTable.organizationId, tenantId(req)),
    isNull(activityDependenciesTable.deletedAt),
  )).orderBy(asc(activityDependenciesTable.id));
  res.json(rows);
});

router.post("/projects/:projectId/dependencies", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = dependencyInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid dependency input" }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const [predecessor, successor] = await Promise.all([
    db.select().from(planningActivitiesTable).where(and(eq(planningActivitiesTable.id, parsed.data.predecessorId), eq(planningActivitiesTable.projectId, projectId.data), eq(planningActivitiesTable.organizationId, orgId), isNull(planningActivitiesTable.deletedAt))),
    db.select().from(planningActivitiesTable).where(and(eq(planningActivitiesTable.id, parsed.data.successorId), eq(planningActivitiesTable.projectId, projectId.data), eq(planningActivitiesTable.organizationId, orgId), isNull(planningActivitiesTable.deletedAt))),
  ]);
  if (!predecessor.length || !successor.length) { res.status(400).json({ error: "Both activities must exist in the same project" }); return; }
  if (parsed.data.predecessorId === parsed.data.successorId) { res.status(400).json({ error: "Cannot depend on itself" }); return; }
  const [dup] = await db.select().from(activityDependenciesTable).where(and(
    eq(activityDependenciesTable.predecessorId, parsed.data.predecessorId),
    eq(activityDependenciesTable.successorId, parsed.data.successorId),
    eq(activityDependenciesTable.projectId, projectId.data),
    isNull(activityDependenciesTable.deletedAt),
  ));
  if (dup) { res.status(409).json({ error: "Dependency already exists" }); return; }
  const [row] = await db.insert(activityDependenciesTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.dependency.created", "dependency", { resourceId: row.id, newValues: { predecessorId: row.predecessorId, successorId: row.successorId, type: row.dependencyType } });
});

router.delete("/dependencies/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [old] = await db.select().from(activityDependenciesTable).where(and(eq(activityDependenciesTable.id, id.data), eq(activityDependenciesTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Dependency not found" }); return; }
  await db.update(activityDependenciesTable).set({ deletedAt: new Date() }).where(eq(activityDependenciesTable.id, id.data));
  res.status(204).send();
  audit(req, "scheduling.dependency.deleted", "dependency", { resourceId: id.data });
});

// ─── CPM Calculation ──────────────────────────────────────────────────────────

router.get("/projects/:projectId/cpm", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const orgId = tenantId(req);

  const [activities, dependencies] = await Promise.all([
    db.select().from(planningActivitiesTable).where(and(
      eq(planningActivitiesTable.projectId, projectId.data),
      eq(planningActivitiesTable.organizationId, orgId),
      isNull(planningActivitiesTable.deletedAt),
    )),
    db.select().from(activityDependenciesTable).where(and(
      eq(activityDependenciesTable.projectId, projectId.data),
      eq(activityDependenciesTable.organizationId, orgId),
      isNull(activityDependenciesTable.deletedAt),
    )),
  ]);

  const activityMap = new Map(activities.map((a) => [a.id, { ...a, earlyStart: 0, earlyFinish: 0, lateStart: 0, lateFinish: 0, totalFloat: 0 }]));
  const successors = new Map<number, number[]>();
  const predecessors = new Map<number, number[]>();
  for (const dep of dependencies) {
    if (!successors.has(dep.predecessorId)) successors.set(dep.predecessorId, []);
    successors.get(dep.predecessorId)!.push(dep.successorId);
    if (!predecessors.has(dep.successorId)) predecessors.set(dep.successorId, []);
    predecessors.get(dep.successorId)!.push(dep.predecessorId);
  }

  const inDegree = new Map<number, number>();
  for (const a of activities) inDegree.set(a.id, (predecessors.get(a.id) || []).length);
  const queue: number[] = [];
  for (const [id, deg] of inDegree) { if (deg === 0) queue.push(id); }
  const topoOrder: number[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    topoOrder.push(node);
    for (const succ of (successors.get(node) || [])) {
      const newDeg = (inDegree.get(succ) || 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  for (const nodeId of topoOrder) {
    const node = activityMap.get(nodeId)!;
    const preds = predecessors.get(nodeId) || [];
    node.earlyStart = preds.length > 0
      ? Math.max(...preds.map((p) => activityMap.get(p)!.earlyFinish))
      : 0;
    node.earlyFinish = node.earlyStart + node.durationDays;
  }

  const projectFinish = Math.max(...activities.map((a) => activityMap.get(a.id)!.earlyFinish));
  for (const nodeId of [...topoOrder].reverse()) {
    const node = activityMap.get(nodeId)!;
    const succs = successors.get(nodeId) || [];
    node.lateFinish = succs.length > 0
      ? Math.min(...succs.map((s) => activityMap.get(s)!.lateStart))
      : projectFinish;
    node.lateStart = node.lateFinish - node.durationDays;
    node.totalFloat = node.lateStart - node.earlyStart;
  }

  const criticalPath = activities.filter((a) => activityMap.get(a.id)!.totalFloat === 0).map((a) => a.id);

  res.json({
    activities: activities.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      earlyStart: activityMap.get(a.id)!.earlyStart,
      earlyFinish: activityMap.get(a.id)!.earlyFinish,
      lateStart: activityMap.get(a.id)!.lateStart,
      lateFinish: activityMap.get(a.id)!.lateFinish,
      totalFloat: activityMap.get(a.id)!.totalFloat,
      durationDays: a.durationDays,
    })),
    criticalPath,
    projectFinishDays: projectFinish,
  });
});

// ─── Baselines ────────────────────────────────────────────────────────────────

const baselineInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  isActive: z.coerce.number().int().min(0).max(1).default(1),
});

router.get("/projects/:projectId/baselines", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await db.select().from(baselinesTable).where(and(
    eq(baselinesTable.projectId, projectId.data),
    eq(baselinesTable.organizationId, tenantId(req)),
    isNull(baselinesTable.deletedAt),
  )).orderBy(desc(baselinesTable.version));
  res.json(rows);
});

router.post("/projects/:projectId/baselines", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = baselineInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid baseline input" }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }

  const [maxVer] = await db.select({ max: sql<number>`COALESCE(MAX(${baselinesTable.version}), 0)` }).from(baselinesTable).where(and(
    eq(baselinesTable.projectId, projectId.data),
    eq(baselinesTable.organizationId, orgId),
  ));
  const version = (maxVer?.max ?? 0) + 1;

  if (parsed.data.isActive) {
    await db.update(baselinesTable).set({ isActive: 0 }).where(and(
      eq(baselinesTable.projectId, projectId.data),
      eq(baselinesTable.organizationId, orgId),
    ));
  }

  const [row] = await db.insert(baselinesTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
    version, createdBy: req.vetraUser!.id,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.baseline.created", "baseline", { resourceId: row.id, newValues: { name: row.name, version: row.version, projectId: row.projectId } });
});

router.post("/baselines/:baselineId/activities", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const baselineId = idInput.safeParse(req.params.baselineId);
  if (!baselineId.success) { res.status(400).json({ error: "Invalid baseline id" }); return; }
  const orgId = tenantId(req);
  const [baseline] = await db.select().from(baselinesTable).where(and(eq(baselinesTable.id, baselineId.data), eq(baselinesTable.organizationId, orgId)));
  if (!baseline) { res.status(404).json({ error: "Baseline not found" }); return; }

  const activities = await db.select().from(planningActivitiesTable).where(and(
    eq(planningActivitiesTable.projectId, baseline.projectId),
    eq(planningActivitiesTable.organizationId, orgId),
    isNull(planningActivitiesTable.deletedAt),
  ));

  if (activities.length === 0) { res.status(400).json({ error: "No activities to baseline" }); return; }

  const values = activities.map((a) => ({
    baselineId: baselineId.data,
    activityId: a.id,
    organizationId: orgId,
    plannedStart: a.plannedStart,
    plannedFinish: a.plannedFinish,
    durationDays: a.durationDays,
    plannedCost: "0",
    plannedLaborHours: "0",
  }));
  const rows = await db.insert(baselineActivitiesTable).values(values).returning();
  res.status(201).json(rows);
  audit(req, "scheduling.baseline.snapshotted", "baseline", { resourceId: baselineId.data, newValues: { activityCount: rows.length } });
});

router.get("/baselines/:baselineId/activities", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const baselineId = idInput.safeParse(req.params.baselineId);
  if (!baselineId.success) { res.status(400).json({ error: "Invalid baseline id" }); return; }
  const rows = await db.select().from(baselineActivitiesTable).where(and(
    eq(baselineActivitiesTable.baselineId, baselineId.data),
    eq(baselineActivitiesTable.organizationId, tenantId(req)),
  )).orderBy(asc(baselineActivitiesTable.id));
  res.json(rows);
});

// ─── Actual Progress ──────────────────────────────────────────────────────────

const progressInput = z.object({
  activityId: idInput,
  reportDate: z.string().date(),
  progressPercent: z.coerce.number().int().min(0).max(100).default(0),
  actualStart: z.string().date().optional().nullable(),
  actualFinish: z.string().date().optional().nullable(),
  actualCost: z.string().optional().default("0"),
  actualLaborHours: z.string().optional().default("0"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

router.get("/projects/:projectId/progress", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await db.select().from(actualProgressTable).where(and(
    eq(actualProgressTable.projectId, projectId.data),
    eq(actualProgressTable.organizationId, tenantId(req)),
  )).orderBy(desc(actualProgressTable.reportDate));
  res.json(rows);
});

router.post("/projects/:projectId/progress", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = progressInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid progress input" }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const [activity] = await db.select().from(planningActivitiesTable).where(and(
    eq(planningActivitiesTable.id, parsed.data.activityId),
    eq(planningActivitiesTable.projectId, projectId.data),
    eq(planningActivitiesTable.organizationId, orgId),
  ));
  if (!activity) { res.status(400).json({ error: "Activity not found in this project" }); return; }
  const [row] = await db.insert(actualProgressTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();

  const newStatus = parsed.data.progressPercent >= 100 ? "completed" : parsed.data.progressPercent > 0 ? "in_progress" : "not_started";
  await db.update(planningActivitiesTable).set({ status: newStatus }).where(eq(planningActivitiesTable.id, parsed.data.activityId));

  res.status(201).json(row);
  audit(req, "scheduling.progress.reported", "progress", { resourceId: row.id, newValues: { activityId: row.activityId, progressPercent: row.progressPercent, reportDate: row.reportDate } });
});

// ─── EVM Metrics ──────────────────────────────────────────────────────────────

router.get("/projects/:projectId/evm", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await db.select().from(evmMetricsTable).where(and(
    eq(evmMetricsTable.projectId, projectId.data),
    eq(evmMetricsTable.organizationId, tenantId(req)),
  )).orderBy(desc(evmMetricsTable.reportDate));
  res.json(rows);
});

router.post("/projects/:projectId/evm", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = z.object({
    baselineId: idInput,
    reportDate: z.string().date(),
    plannedValue: z.string().default("0"),
    earnedValue: z.string().default("0"),
    actualCost: z.string().default("0"),
  }).safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid EVM input" }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }

  const pv = parseFloat(parsed.data.plannedValue);
  const ev = parseFloat(parsed.data.earnedValue);
  const ac = parseFloat(parsed.data.actualCost);
  const cv = ev - ac;
  const sv = ev - pv;
  const cpi = ac > 0 ? ev / ac : 1;
  const spi = pv > 0 ? ev / pv : 1;
  const eac = cpi > 0 ? ac + (pv - ev) / cpi : pv;
  const etc = eac - ac;

  const [row] = await db.insert(evmMetricsTable).values({
    projectId: projectId.data,
    organizationId: orgId,
    baselineId: parsed.data.baselineId,
    reportDate: parsed.data.reportDate,
    plannedValue: parsed.data.plannedValue,
    earnedValue: parsed.data.earnedValue,
    actualCost: parsed.data.actualCost,
    costVariance: cv.toFixed(2),
    scheduleVariance: sv.toFixed(2),
    costPerformanceIndex: cpi.toFixed(2),
    schedulePerformanceIndex: spi.toFixed(2),
    estimateAtCompletion: eac.toFixed(2),
    estimateToComplete: etc.toFixed(2),
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.evm.calculated", "evm", { resourceId: row.id, newValues: { reportDate: row.reportDate, cpi: row.costPerformanceIndex, spi: row.schedulePerformanceIndex } });
});

// ─── Resource Types ───────────────────────────────────────────────────────────

const resourceTypeInput = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.enum(["labor", "equipment", "material"]),
  unit: z.string().trim().min(1).max(50),
  defaultCostPerUnit: z.string().default("0"),
  description: z.string().trim().max(2000).optional().nullable(),
});

router.get("/resource-types", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const rows = await db.select().from(resourceTypesTable).where(and(
    eq(resourceTypesTable.organizationId, tenantId(req)),
    isNull(resourceTypesTable.deletedAt),
  )).orderBy(asc(resourceTypesTable.name));
  res.json(rows);
});

router.post("/resource-types", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const parsed = resourceTypeInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid resource type input" }); return; }
  const [row] = await db.insert(resourceTypesTable).values({
    ...parsed.data, organizationId: tenantId(req),
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.resource_type.created", "resource_type", { resourceId: row.id, newValues: { name: row.name, category: row.category } });
});

router.patch("/resource-types/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  const parsed = resourceTypeInput.partial().safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [old] = await db.select().from(resourceTypesTable).where(and(eq(resourceTypesTable.id, id.data), eq(resourceTypesTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Resource type not found" }); return; }
  const [row] = await db.update(resourceTypesTable).set(parsed.data).where(and(eq(resourceTypesTable.id, id.data), eq(resourceTypesTable.organizationId, tenantId(req)))).returning();
  res.json(row);
});

router.delete("/resource-types/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [old] = await db.select().from(resourceTypesTable).where(and(eq(resourceTypesTable.id, id.data), eq(resourceTypesTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Resource type not found" }); return; }
  await db.update(resourceTypesTable).set({ deletedAt: new Date() }).where(eq(resourceTypesTable.id, id.data));
  res.status(204).send();
});

// ─── Resource Assignments ─────────────────────────────────────────────────────

const resourceAssignmentInput = z.object({
  activityId: idInput,
  resourceTypeId: idInput,
  quantity: z.string().default("1"),
  costPerUnit: z.string().default("0"),
  totalCost: z.string().default("0"),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

router.get("/projects/:projectId/resource-assignments", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await db.select().from(resourceAssignmentsTable).where(and(
    eq(resourceAssignmentsTable.projectId, projectId.data),
    eq(resourceAssignmentsTable.organizationId, tenantId(req)),
    isNull(resourceAssignmentsTable.deletedAt),
  )).orderBy(asc(resourceAssignmentsTable.id));
  res.json(rows);
});

router.post("/projects/:projectId/resource-assignments", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = resourceAssignmentInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid resource assignment input" }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const [activity] = await db.select().from(planningActivitiesTable).where(and(
    eq(planningActivitiesTable.id, parsed.data.activityId),
    eq(planningActivitiesTable.projectId, projectId.data),
    eq(planningActivitiesTable.organizationId, orgId),
  ));
  if (!activity) { res.status(400).json({ error: "Activity not found in this project" }); return; }
  const [rt] = await db.select().from(resourceTypesTable).where(and(eq(resourceTypesTable.id, parsed.data.resourceTypeId), eq(resourceTypesTable.organizationId, orgId)));
  if (!rt) { res.status(400).json({ error: "Resource type not found" }); return; }
  const [row] = await db.insert(resourceAssignmentsTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.resource_assigned", "resource_assignment", { resourceId: row.id, newValues: { activityId: row.activityId, resourceTypeId: row.resourceTypeId } });
});

router.patch("/resource-assignments/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  const parsed = resourceAssignmentInput.partial().safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [old] = await db.select().from(resourceAssignmentsTable).where(and(eq(resourceAssignmentsTable.id, id.data), eq(resourceAssignmentsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Resource assignment not found" }); return; }
  const [row] = await db.update(resourceAssignmentsTable).set(parsed.data).where(and(eq(resourceAssignmentsTable.id, id.data), eq(resourceAssignmentsTable.organizationId, tenantId(req)))).returning();
  res.json(row);
});

router.delete("/resource-assignments/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const [old] = await db.select().from(resourceAssignmentsTable).where(and(eq(resourceAssignmentsTable.id, id.data), eq(resourceAssignmentsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: "Resource assignment not found" }); return; }
  await db.update(resourceAssignmentsTable).set({ deletedAt: new Date() }).where(eq(resourceAssignmentsTable.id, id.data));
  res.status(204).send();
});

// ─── Resource Usage Summary ───────────────────────────────────────────────────

router.get("/projects/:projectId/resource-summary", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: "Project not found" }); return; }
  const orgId = tenantId(req);

  const [assignments, types] = await Promise.all([
    db.select().from(resourceAssignmentsTable).where(and(
      eq(resourceAssignmentsTable.projectId, projectId.data),
      eq(resourceAssignmentsTable.organizationId, orgId),
      isNull(resourceAssignmentsTable.deletedAt),
    )),
    db.select().from(resourceTypesTable).where(and(
      eq(resourceTypesTable.organizationId, orgId),
      isNull(resourceTypesTable.deletedAt),
    )),
  ]);

  const typeMap = new Map(types.map((t) => [t.id, t]));
  const summary: Record<string, { count: number; totalCost: number; types: string[] }> = {};
  for (const a of assignments) {
    const rt = typeMap.get(a.resourceTypeId);
    const cat = rt?.category ?? "other";
    if (!summary[cat]) summary[cat] = { count: 0, totalCost: 0, types: [] };
    summary[cat].count++;
    summary[cat].totalCost += parseFloat(a.totalCost);
    if (rt && !summary[cat].types.includes(rt.name)) summary[cat].types.push(rt.name);
  }
  res.json(summary);
});

export default router;
