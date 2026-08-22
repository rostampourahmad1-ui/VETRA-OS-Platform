import { Router } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  milestonesTable,
  phasesTable,
  planningActivitiesTable,
  projectsTable,
  workBreakdownStructuresTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";

const router = Router();

const idInput = z.coerce.number().int().positive();
export const wbsInput = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4_000).optional().nullable(),
  parentId: idInput.optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export const planningActivityInput = z.object({
  wbsId: idInput,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(300),
  activityType: z.enum(["task", "milestone"]).default("task"),
  plannedStart: z.string().date(),
  plannedFinish: z.string().date(),
  durationDays: z.coerce.number().int().min(0).max(36_500),
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
}).superRefine((value, ctx) => {
  if (value.plannedFinish < value.plannedStart) ctx.addIssue({ code: "custom", path: ["plannedFinish"], message: "plannedFinish must be on or after plannedStart" });
  if (value.activityType === "milestone" && value.durationDays !== 0) ctx.addIssue({ code: "custom", path: ["durationDays"], message: "Milestones must have zero duration" });
});

async function projectOwned(projectId: number, organizationId: number) {
  const [row] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(
    eq(projectsTable.id, projectId), eq(projectsTable.organizationId, organizationId),
  ));
  return row;
}

router.get("/projects/:projectId/timeline", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await projectOwned(projectId.data, tenantId(req)))) { res.status(404).json({ error: "Project not found" }); return; }
  const [phases, milestones] = await Promise.all([
    db.select().from(phasesTable).where(and(eq(phasesTable.projectId, projectId.data), eq(phasesTable.organizationId, tenantId(req)))),
    db.select().from(milestonesTable).where(and(eq(milestonesTable.projectId, projectId.data), eq(milestonesTable.organizationId, tenantId(req)))),
  ]);
  res.json({ phases, milestones });
});

router.get("/projects/:projectId/wbs", requirePermission("planning.read"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await projectOwned(projectId.data, tenantId(req)))) { res.status(404).json({ error: "Project not found" }); return; }
  const [wbs, activities] = await Promise.all([
    db.select().from(workBreakdownStructuresTable).where(and(eq(workBreakdownStructuresTable.projectId, projectId.data), eq(workBreakdownStructuresTable.organizationId, tenantId(req)), isNull(workBreakdownStructuresTable.deletedAt))).orderBy(asc(workBreakdownStructuresTable.sortOrder), asc(workBreakdownStructuresTable.code)),
    db.select().from(planningActivitiesTable).where(and(eq(planningActivitiesTable.projectId, projectId.data), eq(planningActivitiesTable.organizationId, tenantId(req)), isNull(planningActivitiesTable.deletedAt))).orderBy(asc(planningActivitiesTable.plannedStart), asc(planningActivitiesTable.code)),
  ]);
  res.json({ wbs, activities });
});

router.post("/projects/:projectId/wbs", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = wbsInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid WBS input" }); return; }
  const organizationId = tenantId(req);
  if (!(await projectOwned(projectId.data, organizationId))) { res.status(404).json({ error: "Project not found" }); return; }
  if (parsed.data.parentId) {
    const [parent] = await db.select({ id: workBreakdownStructuresTable.id }).from(workBreakdownStructuresTable).where(and(
      eq(workBreakdownStructuresTable.id, parsed.data.parentId), eq(workBreakdownStructuresTable.projectId, projectId.data), eq(workBreakdownStructuresTable.organizationId, organizationId), isNull(workBreakdownStructuresTable.deletedAt),
    ));
    if (!parent) { res.status(400).json({ error: "Parent WBS is not in this project" }); return; }
  }
  const [row] = await db.insert(workBreakdownStructuresTable).values({ ...parsed.data, projectId: projectId.data, organizationId, createdBy: req.vetraUser!.id, updatedBy: req.vetraUser!.id }).returning();
  res.status(201).json(row);
});

router.post("/projects/:projectId/activities", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = planningActivityInput.safeParse(req.body);
  if (!projectId.success || !parsed.success) { res.status(400).json({ error: "Invalid activity input" }); return; }
  const organizationId = tenantId(req);
  if (!(await projectOwned(projectId.data, organizationId))) { res.status(404).json({ error: "Project not found" }); return; }
  const [wbs] = await db.select({ id: workBreakdownStructuresTable.id }).from(workBreakdownStructuresTable).where(and(
    eq(workBreakdownStructuresTable.id, parsed.data.wbsId), eq(workBreakdownStructuresTable.projectId, projectId.data), eq(workBreakdownStructuresTable.organizationId, organizationId), isNull(workBreakdownStructuresTable.deletedAt),
  ));
  if (!wbs) { res.status(400).json({ error: "WBS is not in this project" }); return; }
  const [row] = await db.insert(planningActivitiesTable).values({ ...parsed.data, projectId: projectId.data, organizationId, createdBy: req.vetraUser!.id, updatedBy: req.vetraUser!.id }).returning();
  res.status(201).json(row);
});

router.post("/projects/:projectId/phases", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  if (!projectId.success || !(await projectOwned(projectId.data, tenantId(req)))) { res.status(404).json({ error: "Project not found" }); return; }
  const parsed = z.object({ name: z.string().trim().min(1).max(300), description: z.string().trim().max(4_000).optional(), startDate: z.string().date(), endDate: z.string().date(), progress: z.coerce.number().int().min(0).max(100).default(0), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb") }).safeParse(req.body);
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate) { res.status(400).json({ error: "Invalid phase input" }); return; }
  const [row] = await db.insert(phasesTable).values({ ...parsed.data, projectId: projectId.data, organizationId: tenantId(req) }).returning();
  res.status(201).json(row);
});

router.post("/projects/:projectId/milestones", requirePermission("planning.manage"), async (req, res): Promise<void> => {
  const projectId = idInput.safeParse(req.params.projectId);
  const parsed = z.object({ name: z.string().trim().min(1).max(300), dueDate: z.string().date(), phaseId: idInput.optional(), status: z.enum(["pending", "completed", "cancelled"]).default("pending") }).safeParse(req.body);
  if (!projectId.success || !parsed.success || !(await projectOwned(projectId.data, tenantId(req)))) { res.status(400).json({ error: "Invalid milestone input or project" }); return; }
  const [row] = await db.insert(milestonesTable).values({ ...parsed.data, projectId: projectId.data, organizationId: tenantId(req) }).returning();
  res.status(201).json(row);
});

export default router;
