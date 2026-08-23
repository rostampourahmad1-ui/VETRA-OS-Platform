import { Router } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  inspectionsTable,
  nonConformanceReportsTable,
  projectsTable,
  qualityEventsTable,
  workflowRunEventsTable,
  workflowRunsTable,
  workflowStepsTable,
  workflowsTable,
} from "@workspace/db";
import { audit } from "../lib/audit";
import { hasPermission, requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";

const router = Router();

export const inspectionStatuses = ["planned", "in_progress", "completed", "cancelled"] as const;
export const ncrStatuses = ["open", "in_progress", "resolved", "awaiting_approval", "closed"] as const;
const ncrSeverities = ["low", "medium", "high", "critical"] as const;

type InspectionStatus = (typeof inspectionStatuses)[number];
type NcrStatus = (typeof ncrStatuses)[number];
type QualityEntityType = "inspection" | "non_conformance_report";

const inspectionTransitions: Record<InspectionStatus, readonly InspectionStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const ncrTransitions: Record<NcrStatus, readonly NcrStatus[]> = {
  open: ["in_progress"],
  in_progress: ["resolved"],
  resolved: ["in_progress", "awaiting_approval"],
  awaiting_approval: ["in_progress", "closed"],
  closed: [],
};

export const inspectionInput = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  type: z.enum(["routine", "material", "site", "final"]),
  status: z.literal("planned").default("planned"),
  inspector: z.string().trim().min(1).max(200),
  date: z.string().date(),
  findings: z.string().trim().max(10_000).optional().nullable(),
});

export const ncrInput = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(300),
  severity: z.enum(ncrSeverities),
  status: z.literal("open").default("open"),
  description: z.string().trim().min(1).max(10_000),
  correctiveAction: z.string().trim().max(10_000).optional().nullable(),
  assignedTo: z.string().trim().max(200).optional().nullable(),
  dueDate: z.string().date().optional().nullable(),
});

const inspectionUpdateInput = inspectionInput.omit({ status: true }).partial();
const ncrUpdateInput = ncrInput.omit({ status: true }).partial();
export const inspectionTransitionInput = z.object({
  status: z.enum(inspectionStatuses),
  reason: z.string().trim().min(1).max(2_000).optional(),
});
export const ncrTransitionInput = z.object({
  status: z.enum(ncrStatuses),
  reason: z.string().trim().min(1).max(2_000).optional(),
});
const ncrWorkflowInput = z.object({
  workflowId: z.coerce.number().int().positive(),
  payload: z.record(z.unknown()).optional(),
});

const idFrom = (value: unknown) => {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const snapshot = (row: Record<string, unknown>): Record<string, unknown> =>
  JSON.parse(JSON.stringify(row)) as Record<string, unknown>;

async function projectBelongsToTenant(projectId: number, organizationId: number) {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, organizationId)));
  return Boolean(project);
}

async function recordQualityEvent(input: {
  organizationId: number;
  projectId: number;
  entityType: QualityEntityType;
  entityId: number;
  eventType: string;
  actorId: number;
  previousStatus?: string | null;
  nextStatus?: string | null;
  reason?: string | null;
  eventSnapshot?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(qualityEventsTable).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType,
    previousStatus: input.previousStatus ?? null,
    nextStatus: input.nextStatus ?? null,
    reason: input.reason ?? null,
    snapshot: input.eventSnapshot ?? null,
    actorId: input.actorId,
  });
}

function allowedTransition<T extends string>(
  map: Record<T, readonly T[]>,
  previous: T,
  next: T,
): boolean {
  return map[previous].includes(next);
}

function requiresTransitionReason(previous: string, next: string): boolean {
  return next === "cancelled" || (previous === "resolved" && next === "in_progress") || (previous === "awaiting_approval" && next === "in_progress");
}

router.get("/inspections", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const organizationId = tenantId(req);
  const filters = [eq(inspectionsTable.organizationId, organizationId), isNull(inspectionsTable.deletedAt)];
  if (typeof req.query.status === "string" && (inspectionStatuses as readonly string[]).includes(req.query.status)) {
    filters.push(eq(inspectionsTable.status, req.query.status));
  }
  if (typeof req.query.projectId === "string" && idFrom(req.query.projectId)) {
    filters.push(eq(inspectionsTable.projectId, Number(req.query.projectId)));
  }
  const rows = await db.select().from(inspectionsTable).where(and(...filters)).orderBy(desc(inspectionsTable.updatedAt));
  res.json(rows);
});

router.post("/inspections", requirePermission("quality.create"), async (req, res): Promise<void> => {
  const parsed = inspectionInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const organizationId = tenantId(req);
  if (!(await projectBelongsToTenant(parsed.data.projectId, organizationId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(inspectionsTable).values({
    ...parsed.data,
    organizationId,
    createdBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
  }).returning();
  await recordQualityEvent({
    organizationId,
    projectId: row.projectId,
    entityType: "inspection",
    entityId: row.id,
    eventType: "created",
    actorId: req.vetraUser!.id,
    nextStatus: row.status,
    eventSnapshot: snapshot(row),
  });
  audit(req, "inspection.created", "inspection", { resourceId: row.id, newValues: { projectId: row.projectId, status: row.status, type: row.type } });
  res.status(201).json(row);
});

router.get("/inspections/:id/events", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  const events = await db.select().from(qualityEventsTable).where(and(
    eq(qualityEventsTable.organizationId, tenantId(req)),
    eq(qualityEventsTable.entityType, "inspection"),
    eq(qualityEventsTable.entityId, id),
  )).orderBy(asc(qualityEventsTable.createdAt), asc(qualityEventsTable.id));
  res.json(events);
});

router.get("/inspections/:id", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  const [row] = await db.select().from(inspectionsTable).where(and(
    eq(inspectionsTable.id, id),
    eq(inspectionsTable.organizationId, tenantId(req)),
    isNull(inspectionsTable.deletedAt),
  ));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/inspections/:id", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "status")) {
    res.status(409).json({ error: "Use the transition endpoint to change lifecycle status" });
    return;
  }
  const parsed = inspectionUpdateInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const organizationId = tenantId(req);
  const [previous] = await db.select().from(inspectionsTable).where(and(
    eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, organizationId), isNull(inspectionsTable.deletedAt),
  ));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }
  if (parsed.data.projectId && !(await projectBelongsToTenant(parsed.data.projectId, organizationId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.update(inspectionsTable).set({ ...parsed.data, updatedBy: req.vetraUser!.id, updatedAt: new Date() }).where(and(
    eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, organizationId), isNull(inspectionsTable.deletedAt),
  )).returning();
  await recordQualityEvent({
    organizationId,
    projectId: row.projectId,
    entityType: "inspection",
    entityId: row.id,
    eventType: "updated",
    actorId: req.vetraUser!.id,
    previousStatus: previous.status,
    nextStatus: row.status,
    eventSnapshot: { previous: snapshot(previous), next: snapshot(row) },
  });
  audit(req, "inspection.updated", "inspection", { resourceId: row.id, oldValues: snapshot(previous), newValues: snapshot(row) });
  res.json(row);
});

router.post("/inspections/:id/transition", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const parsed = inspectionTransitionInput.safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "Invalid inspection transition" }); return; }
  const organizationId = tenantId(req);
  const [previous] = await db.select().from(inspectionsTable).where(and(
    eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, organizationId), isNull(inspectionsTable.deletedAt),
  ));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }
  if (!allowedTransition(inspectionTransitions, previous.status as InspectionStatus, parsed.data.status)) {
    res.status(409).json({ error: "Inspection lifecycle transition is not allowed" }); return;
  }
  if (requiresTransitionReason(previous.status, parsed.data.status) && !parsed.data.reason) {
    res.status(400).json({ error: "This lifecycle transition requires a reason" }); return;
  }
  const [row] = await db.update(inspectionsTable).set({
    status: parsed.data.status,
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
  }).where(and(eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, organizationId), isNull(inspectionsTable.deletedAt))).returning();
  await recordQualityEvent({
    organizationId,
    projectId: row.projectId,
    entityType: "inspection",
    entityId: row.id,
    eventType: "transitioned",
    actorId: req.vetraUser!.id,
    previousStatus: previous.status,
    nextStatus: row.status,
    reason: parsed.data.reason,
    eventSnapshot: snapshot(row),
  });
  audit(req, "inspection.transitioned", "inspection", { resourceId: row.id, oldValues: { status: previous.status }, newValues: { status: row.status }, metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined });
  res.json(row);
});

router.delete("/inspections/:id", requirePermission("quality.delete"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  const organizationId = tenantId(req);
  const [previous] = await db.select().from(inspectionsTable).where(and(
    eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, organizationId), isNull(inspectionsTable.deletedAt),
  ));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(inspectionsTable).set({ deletedAt: new Date(), deletedBy: req.vetraUser!.id, updatedBy: req.vetraUser!.id, updatedAt: new Date() }).where(eq(inspectionsTable.id, id)).returning();
  await recordQualityEvent({ organizationId, projectId: row.projectId, entityType: "inspection", entityId: row.id, eventType: "deleted", actorId: req.vetraUser!.id, previousStatus: previous.status, eventSnapshot: snapshot(previous) });
  audit(req, "inspection.deleted", "inspection", { resourceId: id, oldValues: snapshot(previous) });
  res.status(204).send();
});

router.get("/non-conformance-reports", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const organizationId = tenantId(req);
  const filters = [eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt)];
  if (typeof req.query.status === "string" && (ncrStatuses as readonly string[]).includes(req.query.status)) {
    filters.push(eq(nonConformanceReportsTable.status, req.query.status));
  }
  if (typeof req.query.projectId === "string" && idFrom(req.query.projectId)) {
    filters.push(eq(nonConformanceReportsTable.projectId, Number(req.query.projectId)));
  }
  const rows = await db.select().from(nonConformanceReportsTable).where(and(...filters)).orderBy(desc(nonConformanceReportsTable.updatedAt));
  res.json(rows);
});

router.post("/non-conformance-reports", requirePermission("quality.create"), async (req, res): Promise<void> => {
  const parsed = ncrInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const organizationId = tenantId(req);
  if (!(await projectBelongsToTenant(parsed.data.projectId, organizationId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(nonConformanceReportsTable).values({
    ...parsed.data,
    organizationId,
    createdBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
  }).returning();
  await recordQualityEvent({ organizationId, projectId: row.projectId, entityType: "non_conformance_report", entityId: row.id, eventType: "created", actorId: req.vetraUser!.id, nextStatus: row.status, eventSnapshot: snapshot(row) });
  audit(req, "ncr.created", "non_conformance_report", { resourceId: row.id, newValues: snapshot(row) });
  res.status(201).json(row);
});

router.get("/non-conformance-reports/:id/events", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  const events = await db.select().from(qualityEventsTable).where(and(
    eq(qualityEventsTable.organizationId, tenantId(req)),
    eq(qualityEventsTable.entityType, "non_conformance_report"),
    eq(qualityEventsTable.entityId, id),
  )).orderBy(asc(qualityEventsTable.createdAt), asc(qualityEventsTable.id));
  res.json(events);
});

router.get("/non-conformance-reports/:id", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  const [row] = await db.select().from(nonConformanceReportsTable).where(and(
    eq(nonConformanceReportsTable.id, id),
    eq(nonConformanceReportsTable.organizationId, tenantId(req)),
    isNull(nonConformanceReportsTable.deletedAt),
  ));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/non-conformance-reports/:id", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "status")) {
    res.status(409).json({ error: "Use the transition endpoint to change lifecycle status" });
    return;
  }
  const parsed = ncrUpdateInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const organizationId = tenantId(req);
  const [previous] = await db.select().from(nonConformanceReportsTable).where(and(
    eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt),
  ));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }
  if (parsed.data.projectId && !(await projectBelongsToTenant(parsed.data.projectId, organizationId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.update(nonConformanceReportsTable).set({ ...parsed.data, updatedBy: req.vetraUser!.id, updatedAt: new Date() }).where(and(
    eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt),
  )).returning();
  await recordQualityEvent({ organizationId, projectId: row.projectId, entityType: "non_conformance_report", entityId: row.id, eventType: "updated", actorId: req.vetraUser!.id, previousStatus: previous.status, nextStatus: row.status, eventSnapshot: { previous: snapshot(previous), next: snapshot(row) } });
  audit(req, "ncr.updated", "non_conformance_report", { resourceId: row.id, oldValues: snapshot(previous), newValues: snapshot(row) });
  res.json(row);
});

router.post("/non-conformance-reports/:id/transition", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const parsed = ncrTransitionInput.safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "Invalid NCR transition" }); return; }
  const organizationId = tenantId(req);
  const [previous] = await db.select().from(nonConformanceReportsTable).where(and(
    eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt),
  ));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }
  if (parsed.data.status === "awaiting_approval" || parsed.data.status === "closed") {
    res.status(409).json({ error: "Workflow submission and approval control this NCR status" }); return;
  }
  if (!allowedTransition(ncrTransitions, previous.status as NcrStatus, parsed.data.status)) {
    res.status(409).json({ error: "NCR lifecycle transition is not allowed" }); return;
  }
  if (requiresTransitionReason(previous.status, parsed.data.status) && !parsed.data.reason) {
    res.status(400).json({ error: "This lifecycle transition requires a reason" }); return;
  }
  const [row] = await db.update(nonConformanceReportsTable).set({ status: parsed.data.status, updatedBy: req.vetraUser!.id, updatedAt: new Date() }).where(and(
    eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt),
  )).returning();
  await recordQualityEvent({ organizationId, projectId: row.projectId, entityType: "non_conformance_report", entityId: row.id, eventType: "transitioned", actorId: req.vetraUser!.id, previousStatus: previous.status, nextStatus: row.status, reason: parsed.data.reason, eventSnapshot: snapshot(row) });
  audit(req, "ncr.transitioned", "non_conformance_report", { resourceId: row.id, oldValues: { status: previous.status }, newValues: { status: row.status }, metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined });
  res.json(row);
});

router.post("/non-conformance-reports/:id/workflow-runs", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const parsed = ncrWorkflowInput.safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "Invalid NCR workflow request" }); return; }
  const organizationId = tenantId(req);
  if (!(await hasPermission(req.vetraUser!.id, organizationId, "workflows.execute"))) {
    res.status(403).json({ error: "Forbidden", permission: "workflows.execute" }); return;
  }
  const [ncr] = await db.select().from(nonConformanceReportsTable).where(and(
    eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt),
  ));
  if (!ncr) { res.status(404).json({ error: "Not found" }); return; }
  if (ncr.status !== "resolved" || ncr.workflowRunId) { res.status(409).json({ error: "Only a resolved NCR without a workflow run is eligible" }); return; }
  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, parsed.data.workflowId),
    eq(workflowsTable.organizationId, organizationId),
    eq(workflowsTable.entityType, "non_conformance_report"),
    eq(workflowsTable.active, 1),
    isNull(workflowsTable.deletedAt),
  ));
  if (!workflow) { res.status(404).json({ error: "Quality workflow not found" }); return; }
  const [firstStep] = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, workflow.id)).orderBy(asc(workflowStepsTable.stepOrder));
  if (!firstStep) { res.status(409).json({ error: "Workflow has no steps" }); return; }
  const [run] = await db.insert(workflowRunsTable).values({
    workflowId: workflow.id,
    organizationId,
    entityType: "non_conformance_report",
    entityId: ncr.id,
    submittedBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
    payload: parsed.data.payload ?? {},
  }).returning();
  await db.insert(workflowRunEventsTable).values({ organizationId, workflowRunId: run.id, workflowStepId: firstStep.id, action: "submitted", actorId: req.vetraUser!.id });
  const [updated] = await db.update(nonConformanceReportsTable).set({ workflowRunId: run.id, status: "awaiting_approval", updatedBy: req.vetraUser!.id, updatedAt: new Date() }).where(and(
    eq(nonConformanceReportsTable.id, ncr.id), eq(nonConformanceReportsTable.organizationId, organizationId), eq(nonConformanceReportsTable.status, "resolved"), isNull(nonConformanceReportsTable.workflowRunId),
  )).returning();
  if (!updated) { res.status(409).json({ error: "NCR changed concurrently; retry the workflow submission" }); return; }
  await recordQualityEvent({ organizationId, projectId: updated.projectId, entityType: "non_conformance_report", entityId: updated.id, eventType: "workflow_submitted", actorId: req.vetraUser!.id, previousStatus: ncr.status, nextStatus: updated.status, eventSnapshot: { workflowRunId: run.id, workflowId: workflow.id } });
  audit(req, "ncr.workflow_submitted", "non_conformance_report", { resourceId: updated.id, oldValues: { status: ncr.status }, newValues: { status: updated.status, workflowRunId: run.id } });
  res.status(201).json(run);
});

router.delete("/non-conformance-reports/:id", requirePermission("quality.delete"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  const organizationId = tenantId(req);
  const [previous] = await db.select().from(nonConformanceReportsTable).where(and(
    eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, organizationId), isNull(nonConformanceReportsTable.deletedAt),
  ));
  if (!previous) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(nonConformanceReportsTable).set({ deletedAt: new Date(), deletedBy: req.vetraUser!.id, updatedBy: req.vetraUser!.id, updatedAt: new Date() }).where(eq(nonConformanceReportsTable.id, id)).returning();
  await recordQualityEvent({ organizationId, projectId: row.projectId, entityType: "non_conformance_report", entityId: row.id, eventType: "deleted", actorId: req.vetraUser!.id, previousStatus: previous.status, eventSnapshot: snapshot(previous) });
  audit(req, "ncr.deleted", "non_conformance_report", { resourceId: id, oldValues: snapshot(previous) });
  res.status(204).send();
});

export { inspectionTransitions, ncrTransitions };
export default router;
