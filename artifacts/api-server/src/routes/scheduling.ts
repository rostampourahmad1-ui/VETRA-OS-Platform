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
import { computeEVM, computeEVMFromCents, formatCents, toCents } from "../lib/scheduling/evm";
import { computeCPM, detectCycle } from "../lib/scheduling/cpm";
import { offsetToCalendarDate } from "../lib/scheduling/calendar";
import type { ActivityNode, DependencyEdge } from "../lib/scheduling/types";

const router = Router();

const idInput = z.coerce.number().int().positive();

// ─── Persian validation / domain messages (VETRA is Persian-first) ─────────────
const M = {
  projectNotFound: "پروژه یافت نشد",
  invalidId: "شناسه نامعتبر است",
  invalidCalendarId: "شناسه تقویم نامعتبر است",
  invalidCalendarInput: "ورودی تقویم نامعتبر است",
  calendarNotFound: "تقویم یافت نشد",
  invalidDependencyInput: "ورودی وابستگی نامعتبر است",
  invalidActivities: "هر دو فعالیت باید در همین پروژه تعریف شده باشند",
  selfDependency: "فعالیت نمیتواند به خودش وابسته باشد",
  duplicateDependency: "این وابستگی قبلاً ثبت شده است",
  cycleDependency: "ایجاد این وابستگی باعث ایجاد حلقه در شبکهٔ وابستگیها میشود",
  dependencyNotFound: "وابستگی یافت نشد",
  invalidBaselineInput: "ورودی خط پایه (بیسلاین) نامعتبر است",
  invalidBaselineId: "شناسه خط پایه نامعتبر است",
  baselineNotFound: "خط پایه (بیسلاین) یافت نشد",
  noActivitiesToBaseline: "برای ثبت خط پایه ابتدا فعالیت تعریف کنید",
  invalidInput: "ورودی نامعتبر است",
  invalidProgressInput: "ورودی پیشرفت نامعتبر است",
  activityNotInProject: "فعالیت موردنظر در این پروژه یافت نشد",
  invalidEvmInput: "ورودی EVM نامعتبر است؛ مقادیر مالی باید عددی و غیرمنفی باشند",
  noEvmData: "برای این پروژه دادهٔ EVM معتبری ثبت نشده است؛ ابتدا شاخصها را ثبت کنید",
  invalidResourceTypeInput: "ورودی نوع منبع نامعتبر است",
  resourceTypeNotFound: "نوع منبع یافت نشد",
  invalidResourceAssignmentInput: "ورودی تخصیص منبع نامعتبر است",
  resourceAssignmentNotFound: "تخصیص منبع یافت نشد",
  cycleCpm: "گراف وابستگیها دارای حلقه است؛ وابستگیهای حلقوی را اصلاح کنید",
};

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
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
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
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: M.invalidCalendarInput }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const [row] = await db.insert(projectCalendarsTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.calendar.created", "calendar", { resourceId: row.id, newValues: { name: row.name, projectId: row.projectId } });
});

router.patch("/calendars/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  const parsed = calendarInput.partial().safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: M.invalidInput }); return; }
  const [old] = await db.select().from(projectCalendarsTable).where(and(eq(projectCalendarsTable.id, id.data), eq(projectCalendarsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.calendarNotFound }); return; }
  const [row] = await db.update(projectCalendarsTable).set(parsed.data).where(and(eq(projectCalendarsTable.id, id.data), eq(projectCalendarsTable.organizationId, tenantId(req)))).returning();
  res.json(row);
  audit(req, "scheduling.calendar.updated", "calendar", { resourceId: id.data, oldValues: { name: old.name }, newValues: { name: row.name } });
});

router.delete("/calendars/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: M.invalidId }); return; }
  const [old] = await db.select().from(projectCalendarsTable).where(and(eq(projectCalendarsTable.id, id.data), eq(projectCalendarsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.calendarNotFound }); return; }
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
  if (!calendarId.success) { res.status(400).json({ error: M.invalidCalendarId }); return; }
  const rows = await db.select().from(calendarExceptionsTable).where(and(
    eq(calendarExceptionsTable.calendarId, calendarId.data),
    eq(calendarExceptionsTable.organizationId, tenantId(req)),
  )).orderBy(asc(calendarExceptionsTable.exceptionDate));
  res.json(rows);
});

router.post("/calendars/:calendarId/exceptions", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const calendarId = idInput.safeParse(req.params.calendarId);
  const parsed = exceptionInput.omit({ calendarId: true }).safeParse(req.body);
  if (!calendarId.success || !parsed.success) { res.status(400).json({ error: M.invalidInput }); return; }
  const orgId = tenantId(req);
  const [cal] = await db.select().from(projectCalendarsTable).where(and(eq(projectCalendarsTable.id, calendarId.data), eq(projectCalendarsTable.organizationId, orgId)));
  if (!cal) { res.status(404).json({ error: M.calendarNotFound }); return; }
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
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
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
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: M.invalidDependencyInput }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const [predecessor, successor] = await Promise.all([
    db.select().from(planningActivitiesTable).where(and(eq(planningActivitiesTable.id, parsed.data.predecessorId), eq(planningActivitiesTable.projectId, projectId.data), eq(planningActivitiesTable.organizationId, orgId), isNull(planningActivitiesTable.deletedAt))),
    db.select().from(planningActivitiesTable).where(and(eq(planningActivitiesTable.id, parsed.data.successorId), eq(planningActivitiesTable.projectId, projectId.data), eq(planningActivitiesTable.organizationId, orgId), isNull(planningActivitiesTable.deletedAt))),
  ]);
  if (!predecessor.length || !successor.length) { res.status(400).json({ error: M.invalidActivities }); return; }
  if (parsed.data.predecessorId === parsed.data.successorId) { res.status(400).json({ error: M.selfDependency }); return; }
  const [dup] = await db.select().from(activityDependenciesTable).where(and(
    eq(activityDependenciesTable.predecessorId, parsed.data.predecessorId),
    eq(activityDependenciesTable.successorId, parsed.data.successorId),
    eq(activityDependenciesTable.projectId, projectId.data),
    isNull(activityDependenciesTable.deletedAt),
  ));
  if (dup) { res.status(409).json({ error: M.duplicateDependency }); return; }

  // Reject a new edge that would create a cycle (A→B→A etc.).
  const [nodes, existingDeps] = await Promise.all([
    db.select({ id: planningActivitiesTable.id }).from(planningActivitiesTable).where(and(
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
  const activityNodes = nodes.map((n) => ({
    id: n.id, code: "", name: "", durationDays: 1, plannedStart: "", plannedFinish: "",
  }));
  const graph = existingDeps.map((d) => ({
    id: d.id, predecessorId: d.predecessorId, successorId: d.successorId,
    dependencyType: d.dependencyType as "FS" | "SS" | "FF" | "SF", lagDays: d.lagDays,
  }));
  graph.push({
    id: -1, predecessorId: parsed.data.predecessorId, successorId: parsed.data.successorId,
    dependencyType: parsed.data.dependencyType, lagDays: parsed.data.lagDays,
  });
  if (detectCycle(activityNodes, graph)) {
    res.status(409).json({ error: M.cycleDependency });
    return;
  }

  const [row] = await db.insert(activityDependenciesTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.dependency.created", "dependency", { resourceId: row.id, newValues: { predecessorId: row.predecessorId, successorId: row.successorId, type: row.dependencyType } });
});

router.delete("/dependencies/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: M.invalidId }); return; }
  const [old] = await db.select().from(activityDependenciesTable).where(and(eq(activityDependenciesTable.id, id.data), eq(activityDependenciesTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.dependencyNotFound }); return; }
  await db.update(activityDependenciesTable).set({ deletedAt: new Date() }).where(eq(activityDependenciesTable.id, id.data));
  res.status(204).send();
  audit(req, "scheduling.dependency.deleted", "dependency", { resourceId: id.data });
});

// ─── CPM Calculation ──────────────────────────────────────────────────────────

router.get("/projects/:projectId/cpm", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const orgId = tenantId(req);

  // Optional calendar integration: pass ?calendarId= to get calendar-adjusted dates
  const calendarId = req.query.calendarId ? idInput.safeParse(req.query.calendarId) : null;
  if (calendarId && !calendarId.success) { res.status(400).json({ error: M.invalidCalendarId }); return; }

  let calendar: (typeof projectCalendarsTable.$inferSelect) | null = null;
  let calendarExceptions: { exceptionDate: string; isWorkingDay: number; description?: string | null }[] = [];
  if (calendarId) {
    const [cal] = await db.select().from(projectCalendarsTable).where(and(
      eq(projectCalendarsTable.id, calendarId.data),
      eq(projectCalendarsTable.organizationId, orgId),
      isNull(projectCalendarsTable.deletedAt),
    )).limit(1);
    if (cal) {
      calendar = cal;
      calendarExceptions = await db.select({
        exceptionDate: calendarExceptionsTable.exceptionDate,
        isWorkingDay: calendarExceptionsTable.isWorkingDay,
        description: calendarExceptionsTable.description,
      }).from(calendarExceptionsTable).where(and(
        eq(calendarExceptionsTable.calendarId, calendar.id),
        eq(calendarExceptionsTable.organizationId, orgId),
      ));
    }
  }

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

  // Reject cycle graphs instead of returning misleading zero-float output.
  const dependencyEdges: DependencyEdge[] = dependencies.map((d) => ({
    id: d.id,
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    dependencyType: d.dependencyType as DependencyEdge["dependencyType"],
    lagDays: d.lagDays,
  }));
  if (detectCycle(activities, dependencyEdges)) {
    res.status(409).json({ error: M.cycleCpm });
    return;
  }

  // VETRA-PC-02: run the real domain CPM service (honours FS/SS/FF/SF + lag).
  const result = computeCPM(activities, dependencyEdges);

  const byActivityId = new Map(result.activities.map((a) => [a.activityId, a]));
  const projectStartDate = activities.length > 0 ? activities[0].plannedStart : "";

  const withDates = result.activities.map((r) => {
    const out: Record<string, unknown> = {
      id: r.activityId,
      code: r.code,
      name: r.name,
      durationDays: r.durationDays,
      earlyStart: r.earlyStart,
      earlyFinish: r.earlyFinish,
      lateStart: r.lateStart,
      lateFinish: r.lateFinish,
      totalFloat: r.totalFloat,
      isCritical: r.isCritical,
      earlyStartDate: null,
      earlyFinishDate: null,
      lateStartDate: null,
      lateFinishDate: null,
    };
    if (calendar && activities.length > 0) {
      out.earlyStartDate = offsetToCalendarDate(calendar, calendarExceptions, projectStartDate, r.earlyStart);
      out.earlyFinishDate = offsetToCalendarDate(calendar, calendarExceptions, projectStartDate, r.earlyFinish);
      out.lateStartDate = offsetToCalendarDate(calendar, calendarExceptions, projectStartDate, r.lateStart);
      out.lateFinishDate = offsetToCalendarDate(calendar, calendarExceptions, projectStartDate, r.lateFinish);
    }
    return out;
  });

  res.json({
    activities: withDates,
    criticalPath: result.criticalPathIds,
    projectFinishDays: result.totalDurationDays,
    calendarAdjusted: calendar !== null,
    calendarId: calendar?.id ?? null,
    calendarName: calendar?.name ?? null,
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
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
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
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: M.invalidBaselineInput }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }

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
  if (!baselineId.success) { res.status(400).json({ error: M.invalidBaselineId }); return; }
  const orgId = tenantId(req);
  const [baseline] = await db.select().from(baselinesTable).where(and(eq(baselinesTable.id, baselineId.data), eq(baselinesTable.organizationId, orgId)));
  if (!baseline) { res.status(404).json({ error: M.baselineNotFound }); return; }

  const activities = await db.select().from(planningActivitiesTable).where(and(
    eq(planningActivitiesTable.projectId, baseline.projectId),
    eq(planningActivitiesTable.organizationId, orgId),
    isNull(planningActivitiesTable.deletedAt),
  ));

  if (activities.length === 0) { res.status(400).json({ error: M.noActivitiesToBaseline }); return; }

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
  if (!baselineId.success) { res.status(400).json({ error: M.invalidBaselineId }); return; }
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
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const rows = await db.select().from(actualProgressTable).where(and(
    eq(actualProgressTable.projectId, projectId.data),
    eq(actualProgressTable.organizationId, tenantId(req)),
  )).orderBy(desc(actualProgressTable.reportDate));
  res.json(rows);
});

router.post("/projects/:projectId/progress", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = progressInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: M.invalidProgressInput }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const [activity] = await db.select().from(planningActivitiesTable).where(and(
    eq(planningActivitiesTable.id, parsed.data.activityId),
    eq(planningActivitiesTable.projectId, projectId.data),
    eq(planningActivitiesTable.organizationId, orgId),
  ));
  if (!activity) { res.status(400).json({ error: M.activityNotInProject }); return; }
  const [row] = await db.insert(actualProgressTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId, recordedBy: req.vetraUser!.id,
  }).returning();

  const newStatus = parsed.data.progressPercent >= 100 ? "completed" : parsed.data.progressPercent > 0 ? "in_progress" : "not_started";
  await db.update(planningActivitiesTable).set({ status: newStatus }).where(eq(planningActivitiesTable.id, parsed.data.activityId));

  res.status(201).json(row);
  audit(req, "scheduling.progress.reported", "progress", { resourceId: row.id, newValues: { activityId: row.activityId, progressPercent: row.progressPercent, reportDate: row.reportDate } });
});
// --- Weighted Progress Summary -------------------------------------------------------

router.get("/projects/:projectId/progress-summary", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const orgId = tenantId(req);

  // Optional date-range filter for as-of-date progress reporting
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom) : undefined;
  const dateTo = req.query.dateTo ? String(req.query.dateTo) : undefined;

  let progressConditions = and(
    eq(actualProgressTable.projectId, projectId.data),
    eq(actualProgressTable.organizationId, orgId),
  );
  if (dateFrom) {
    progressConditions = and(progressConditions, sql`${actualProgressTable.reportDate} >= ${dateFrom}`);
  }
  if (dateTo) {
    progressConditions = and(progressConditions, sql`${actualProgressTable.reportDate} <= ${dateTo}`);
  }

  const [activities, progressRecords, baselines] = await Promise.all([
    db.select().from(planningActivitiesTable).where(and(
      eq(planningActivitiesTable.projectId, projectId.data),
      eq(planningActivitiesTable.organizationId, orgId),
      isNull(planningActivitiesTable.deletedAt),
    )),
    db.select().from(actualProgressTable).where(progressConditions),
    db.select().from(baselinesTable).where(and(
      eq(baselinesTable.projectId, projectId.data),
      eq(baselinesTable.organizationId, orgId),
      eq(baselinesTable.isActive, 1),
    )).limit(1),
  ]);
  // Latest progress per activity
  const latestProgress = {} as Record<number, number>;
  progressRecords.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  for (const pr of progressRecords) {
    if (latestProgress[pr.activityId] === undefined) latestProgress[pr.activityId] = pr.progressPercent;
  }
  // Compute weighted progress using durationDays as weight
  const items = activities.map((a) => ({
    activityId: a.id,
    progressPercent: latestProgress[a.id] ?? 0,
    weight: Math.max(1, a.durationDays),
  }));
  const { computeWeightedProgress } = await import("../lib/scheduling/progress");
  const summary = computeWeightedProgress(items);
  const activityMap = new Map(activities.map((a) => [a.id, a]));
  const asOfDate = progressRecords.length > 0
    ? progressRecords.reduce((latest, pr) => pr.reportDate > latest ? pr.reportDate : latest, progressRecords[0].reportDate)
    : new Date().toISOString().slice(0, 10);
  const { calculatePlannedProgress, deriveActivityStatus } = await import("../lib/scheduling/progress");
  const activitiesWithPlanned = summary.activities.map((a) => {
    const act = activityMap.get(a.activityId);
    const plannedStart = act?.plannedStart ?? "";
    const plannedFinish = act?.plannedFinish ?? "";
    const durationDays = act?.durationDays ?? 0;
    const plannedProgress = plannedStart && plannedFinish && durationDays > 0
      ? calculatePlannedProgress(plannedStart, plannedFinish, durationDays, asOfDate)
      : 0;
    return {
      ...a,
      code: act?.code ?? "",
      name: act?.name ?? "",
      plannedStart,
      plannedFinish,
      durationDays,
      status: deriveActivityStatus(a.progressPercent),
      plannedProgress,
    };
  });
  const overallPlannedProgress = activities.length > 0
    ? Math.round(activitiesWithPlanned.reduce((sum, a) => sum + a.plannedProgress, 0) / activities.length * 100) / 100
    : 0;
  res.json({
    overallProgressPercent: summary.overallProgressPercent,
    plannedProgressPercent: overallPlannedProgress,
    totalWeight: summary.totalWeight,
    activities: activitiesWithPlanned,
    activityCount: activities.length,
    reportedActivityCount: items.filter((a) => a.progressPercent > 0).length,
    activeBaselineId: baselines[0]?.id ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    asOfDate,
  });
});



// --- Calendar-Aware Scheduling ---------------------------------------------------------------------

router.get("/projects/:projectId/calendar-schedule", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const orgId = tenantId(req);
  const calendarId = req.query.calendarId ? idInput.safeParse(req.query.calendarId) : null;
  if (calendarId && !calendarId.success) { res.status(400).json({ error: M.invalidCalendarId }); return; }
  const [calendars, activities, dependencies] = await Promise.all([
    db.select().from(projectCalendarsTable).where(and(
      eq(projectCalendarsTable.projectId, projectId.data),
      eq(projectCalendarsTable.organizationId, orgId),
      isNull(projectCalendarsTable.deletedAt),
      calendarId ? eq(projectCalendarsTable.id, calendarId.data) : sql`1=1`,
    )).limit(1),
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
  if (calendars.length === 0) { res.json({ warning: "No calendar defined for this project", calendarAdjusted: false, activities: activities.map(a => ({ ...a, calendarStart: a.plannedStart, calendarFinish: a.plannedFinish })) }); return; }
  const calendar = calendars[0];
  const exceptions = await db.select({ exceptionDate: calendarExceptionsTable.exceptionDate, isWorkingDay: calendarExceptionsTable.isWorkingDay, description: calendarExceptionsTable.description }).from(calendarExceptionsTable).where(and(
    eq(calendarExceptionsTable.calendarId, calendar.id),
    eq(calendarExceptionsTable.organizationId, orgId),
  ));
  const projectStartDate = activities.length > 0 ? activities[0].plannedStart : "";
  const { offsetToCalendarDate } = await import("../lib/scheduling/calendar");
  const adjusted = activities.map((a) => {
    const dayOffset = (new Date(a.plannedStart).getTime() - new Date(projectStartDate).getTime()) / (1000 * 60 * 60 * 24);
    const calendarStart = dayOffset > 0 ? offsetToCalendarDate(calendar, exceptions, projectStartDate, Math.round(dayOffset)) : projectStartDate;
    const calStartDate = new Date(calendarStart + "T00:00:00Z");
    const finishOffset = (new Date(a.plannedFinish).getTime() - new Date(a.plannedStart).getTime()) / (1000 * 60 * 60 * 24);
    const calendarFinish = offsetToCalendarDate(calendar, exceptions, calendarStart, Math.round(Math.max(1, finishOffset)));
    return { ...a, calendarStart, calendarFinish };
  });
  res.json({
    calendarId: calendar.id,
    calendarName: calendar.name,
    workDays: calendar.workDays,
    exceptionsCount: exceptions.length,
    calendarAdjusted: true,
    activities: adjusted,
    projectStartDate,
  });
});

// ─── EVM Metrics ──────────────────────────────────────────────────────────────

router.get("/projects/:projectId/evm", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const rows = await db.select().from(evmMetricsTable).where(and(
    eq(evmMetricsTable.projectId, projectId.data),
    eq(evmMetricsTable.organizationId, tenantId(req)),
  )).orderBy(desc(evmMetricsTable.reportDate));
  res.json(rows);
});

router.post("/projects/:projectId/evm", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const decimal = z.string().refine((v) => { const c = toCents(v); return c >= 0n; });
  const parsed = z.object({
    baselineId: idInput,
    reportDate: z.string().date(),
    plannedValue: decimal.default("0"),
    earnedValue: decimal.default("0"),
    actualCost: decimal.default("0"),
    bottomUpEstimateToComplete: decimal.optional(),
  }).safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: M.invalidEvmInput }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }

  // Exact integer-cent arithmetic (no float) end to end.
  const pv = toCents(parsed.data.plannedValue);
  const ev = toCents(parsed.data.earnedValue);
  const ac = toCents(parsed.data.actualCost);
  const bottomUpETC = parsed.data.bottomUpEstimateToComplete !== undefined
    ? toCents(parsed.data.bottomUpEstimateToComplete)
    : undefined;
  const baselineActivities = await db.select({ plannedCost: baselineActivitiesTable.plannedCost })
    .from(baselineActivitiesTable)
    .where(and(
      eq(baselineActivitiesTable.baselineId, parsed.data.baselineId),
      eq(baselineActivitiesTable.organizationId, orgId),
    ));
  const bac = baselineActivities.reduce((sum, a) => sum + toCents(String(a.plannedCost)), 0n);
  const metrics = computeEVMFromCents({
    plannedValueCents: pv, earnedValueCents: ev, actualCostCents: ac,
    budgetAtCompletionCents: bac, bottomUpEstimateToCompleteCents: bottomUpETC,
  });

  const [row] = await db.insert(evmMetricsTable).values({
    projectId: projectId.data,
    organizationId: orgId,
    baselineId: parsed.data.baselineId,
    reportDate: parsed.data.reportDate,
    plannedValue: formatCents(metrics.plannedValueCents),
    earnedValue: formatCents(metrics.earnedValueCents),
    actualCost: formatCents(metrics.actualCostCents),
    costVariance: formatCents(metrics.costVarianceCents),
    scheduleVariance: formatCents(metrics.scheduleVarianceCents),
    costPerformanceIndex: formatCents(metrics.costPerformanceIndexH),
    schedulePerformanceIndex: formatCents(metrics.schedulePerformanceIndexH),
    estimateAtCompletion: formatCents(metrics.estimateAtCompletionCents),
    estimateToComplete: formatCents(metrics.estimateToCompleteCents),
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.evm.calculated", "evm", { resourceId: row.id, newValues: { reportDate: row.reportDate, cpi: row.costPerformanceIndex, spi: row.schedulePerformanceIndex } });
});

// --- EVM Forecast (All 3 EAC variants) ---

router.get("/projects/:projectId/evm-forecast", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const orgId = tenantId(req);

  // Fetch the latest EVM record for this project
  const [latest] = await db.select().from(evmMetricsTable).where(and(
    eq(evmMetricsTable.projectId, projectId.data),
    eq(evmMetricsTable.organizationId, orgId),
  )).orderBy(desc(evmMetricsTable.reportDate)).limit(1);

  if (!latest) {
    res.status(404).json({ error: M.noEvmData });
    return;
  }

  const pv = toCents(String(latest.plannedValue));
  const ev = toCents(String(latest.earnedValue));
  const ac = toCents(String(latest.actualCost));
  // Derive BAC from baseline activities plannedCost sum (exact integer cents)
  const baselineActivities = await db.select({ plannedCost: baselineActivitiesTable.plannedCost })
    .from(baselineActivitiesTable)
    .where(and(
      eq(baselineActivitiesTable.baselineId, latest.baselineId),
      eq(baselineActivitiesTable.organizationId, orgId),
    ));
  const bac = baselineActivities.reduce((sum, a) => sum + toCents(String(a.plannedCost)), 0n);

  const metrics = computeEVMFromCents({
    plannedValueCents: pv, earnedValueCents: ev, actualCostCents: ac, budgetAtCompletionCents: bac,
  });
  const toNumber = (cents: bigint): number => Number(formatCents(cents));
  const toRatio = (h: bigint): number => Number(formatCents(h));

  res.json({
    projectId: projectId.data,
    reportDate: latest.reportDate,
    baselineId: latest.baselineId,
    plannedValue: toNumber(metrics.plannedValueCents),
    earnedValue: toNumber(metrics.earnedValueCents),
    actualCost: toNumber(metrics.actualCostCents),
    cpi: toRatio(metrics.costPerformanceIndexH),
    spi: toRatio(metrics.schedulePerformanceIndexH),
    eacCpi: toNumber(metrics.estimateAtCompletionCents),
    eacCpiSpi: toNumber(metrics.eacCpiSpiCents),
    eacBottomUp: toNumber(metrics.eacBottomUpCents),
    costVariance: toNumber(metrics.costVarianceCents),
    scheduleVariance: toNumber(metrics.scheduleVarianceCents),
    estimateToComplete: toNumber(metrics.estimateToCompleteCents),
    varianceAtCompletion: toNumber(metrics.varianceAtCompletionCents),
    toCompletePerformanceIndex: toRatio(metrics.toCompletePerformanceIndexH),
  });
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
  if (!parsed.success) { res.status(400).json({ error: M.invalidResourceTypeInput }); return; }
  const [row] = await db.insert(resourceTypesTable).values({
    ...parsed.data, organizationId: tenantId(req),
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.resource_type.created", "resource_type", { resourceId: row.id, newValues: { name: row.name, category: row.category } });
});

router.patch("/resource-types/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  const parsed = resourceTypeInput.partial().safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: M.invalidInput }); return; }
  const [old] = await db.select().from(resourceTypesTable).where(and(eq(resourceTypesTable.id, id.data), eq(resourceTypesTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.resourceTypeNotFound }); return; }
  const [row] = await db.update(resourceTypesTable).set(parsed.data).where(and(eq(resourceTypesTable.id, id.data), eq(resourceTypesTable.organizationId, tenantId(req)))).returning();
  res.json(row);
});

router.delete("/resource-types/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: M.invalidId }); return; }
  const [old] = await db.select().from(resourceTypesTable).where(and(eq(resourceTypesTable.id, id.data), eq(resourceTypesTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.resourceTypeNotFound }); return; }
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
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
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
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: M.invalidResourceAssignmentInput }); return; }
  const orgId = tenantId(req);
  if (!(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
  const [activity] = await db.select().from(planningActivitiesTable).where(and(
    eq(planningActivitiesTable.id, parsed.data.activityId),
    eq(planningActivitiesTable.projectId, projectId.data),
    eq(planningActivitiesTable.organizationId, orgId),
  ));
  if (!activity) { res.status(400).json({ error: M.activityNotInProject }); return; }
  const [rt] = await db.select().from(resourceTypesTable).where(and(eq(resourceTypesTable.id, parsed.data.resourceTypeId), eq(resourceTypesTable.organizationId, orgId)));
  if (!rt) { res.status(400).json({ error: M.resourceTypeNotFound }); return; }
  const [row] = await db.insert(resourceAssignmentsTable).values({
    ...parsed.data, projectId: projectId.data, organizationId: orgId,
  }).returning();
  res.status(201).json(row);
  audit(req, "scheduling.resource_assigned", "resource_assignment", { resourceId: row.id, newValues: { activityId: row.activityId, resourceTypeId: row.resourceTypeId } });
});

router.patch("/resource-assignments/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  const parsed = resourceAssignmentInput.partial().safeParse(req.body);
  if (!id.success || !parsed.success) { res.status(400).json({ error: M.invalidInput }); return; }
  const [old] = await db.select().from(resourceAssignmentsTable).where(and(eq(resourceAssignmentsTable.id, id.data), eq(resourceAssignmentsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.resourceAssignmentNotFound }); return; }
  const [row] = await db.update(resourceAssignmentsTable).set(parsed.data).where(and(eq(resourceAssignmentsTable.id, id.data), eq(resourceAssignmentsTable.organizationId, tenantId(req)))).returning();
  res.json(row);
});

router.delete("/resource-assignments/:id", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const id = idInput.safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: M.invalidId }); return; }
  const [old] = await db.select().from(resourceAssignmentsTable).where(and(eq(resourceAssignmentsTable.id, id.data), eq(resourceAssignmentsTable.organizationId, tenantId(req))));
  if (!old) { res.status(404).json({ error: M.resourceAssignmentNotFound }); return; }
  await db.update(resourceAssignmentsTable).set({ deletedAt: new Date() }).where(eq(resourceAssignmentsTable.id, id.data));
  res.status(204).send();
});

// ─── Resource Usage Summary ───────────────────────────────────────────────────

router.get("/projects/:projectId/resource-summary", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await ownedProject(req, projectId.data))) { res.status(404).json({ error: M.projectNotFound }); return; }
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
  const summary: Record<string, { count: number; totalCostCents: bigint; types: string[] }> = {};
  for (const a of assignments) {
    const rt = typeMap.get(a.resourceTypeId);
    const cat = rt?.category ?? "other";
    if (!summary[cat]) summary[cat] = { count: 0, totalCostCents: 0n, types: [] };
    summary[cat].count++;
    // Exact integer-cent accumulation (totalCost is a numeric(15,2) string).
    summary[cat].totalCostCents += toCents(String(a.totalCost));
    if (rt && !summary[cat].types.includes(rt.name)) summary[cat].types.push(rt.name);
  }
  const payload: Record<string, { count: number; totalCost: number; types: string[] }> = {};
  for (const [cat, s] of Object.entries(summary)) {
    payload[cat] = { count: s.count, totalCost: Number(formatCents(s.totalCostCents)), types: s.types };
  }
  res.json(payload);
});

export default router;
