import { requireAuth } from "../middlewares/requireAuth";
import { hasPermission, requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import {
  db,
  dailyReportsTable,
  dailyReportAttachmentsTable,
  projectsTable,
  workflowRunEventsTable,
  workflowRunsTable,
  workflowStepsTable,
  workflowsTable,
} from "@workspace/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { CreateDailyReportBody } from "@workspace/api-zod";
import { z } from "zod";
import { isProjectMember, ownedProject, tenantId } from "../middlewares/tenant";
import { audit } from "../lib/audit";
import { notifyWorkflowDecision } from "../lib/notifications";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import {
  MAX_UPLOAD_SIZE_BYTES,
  generateStorageFilename,
  isAllowedUploadExtension,
  isAllowedUploadMimeType,
  resolveSafeStoragePath,
} from "../lib/fileStorage";
import {
  validateWorkforceInsert,
  validateWorkforceUpdate,
  verifyDailyReportOwnership,
  verifyEmployeeOwnership,
  listWorkforce,
  createWorkforce,
  updateWorkforce,
  aggregateWorkforce,
} from "../lib/dailyReportWorkforce";
import {
  verifyMaterialOwnership,
  listMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  aggregateMaterials,
} from "../lib/dailyReportMaterials";

import {
  verifyEquipmentOwnership,
  verifyOperatorOwnership,
  listEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  aggregateEquipment,
} from "../lib/dailyReportEquipment";

const router = Router();
router.use(requireAuth);

// ─── Multer Configuration for Attachment Uploads ─────────────────────────

const uploadDir = path.resolve(process.cwd(), "uploads");
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  fileFilter(_req, file, callback) {
    if (!isAllowedUploadExtension(file.originalname) || !isAllowedUploadMimeType(file.mimetype)) {
      callback(new Error("Unsupported file type"));
      return;
    }
    callback(null, true);
  },
});

// ─── Daily Report Lifecycle State Machine ──────────────────────────────────

const dailyReportStatuses = ["draft", "submitted", "in_review", "approved", "rejected", "revision_requested"] as const;
type DailyReportStatus = (typeof dailyReportStatuses)[number];

const dailyReportTransitions: Record<DailyReportStatus, readonly DailyReportStatus[]> = {
  draft: ["submitted"],
  submitted: ["in_review"],
  in_review: ["approved", "rejected", "revision_requested"],
  approved: [],
  rejected: [],
  revision_requested: ["draft"],
};

const dailyReportTransitionInput = z.object({
  status: z.enum(dailyReportStatuses),
  reason: z.string().trim().min(1).max(2_000).optional(),
  workflowId: z.coerce.number().int().positive().optional(),
});

const submitInput = z.object({
  workflowId: z.coerce.number().int().positive(),
});

function allowedTransition(previous: DailyReportStatus, next: DailyReportStatus): boolean {
  return (dailyReportTransitions[previous] as readonly string[]).includes(next);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const idFrom = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// ─── CRUD Routes ───────────────────────────────────────────────────────────

router.get("/daily-reports", requirePermission("daily-reports.read"), async (req, res): Promise<void> => {
  const { projectId } = req.query as { projectId?: string };
  const organizationId = tenantId(req);

  const filters = [eq(dailyReportsTable.organizationId, organizationId)];
  if (projectId) filters.push(eq(dailyReportsTable.projectId, parseInt(projectId, 10)));
  const rows = await db.select().from(dailyReportsTable).where(and(...filters)).orderBy(sql`${dailyReportsTable.date} desc`);

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId));
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(r => ({
    id: r.id,
    date: r.date,
    weather: r.weather,
    temperature: r.temperature ? parseFloat(r.temperature as string) : null,
    progress: parseFloat(r.progress as string),
    workersOnSite: r.workersOnSite,
    issues: r.issues ?? null,
    notes: r.notes ?? null,
    status: r.status,
    workflowRunId: r.workflowRunId,
    submittedBy: r.submittedBy,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    projectId: r.projectId,
    projectName: projMap.get(r.projectId) ?? "Unknown",
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/daily-reports", requirePermission("daily-reports.create"), async (req, res): Promise<void> => {
  const parsed = CreateDailyReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const organizationId = tenantId(req);
  const project = await ownedProject(req, d.projectId);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await isProjectMember(req, d.projectId))) { res.status(403).json({ error: "Forbidden: not a member of this project" }); return; }

  const [row] = await db.insert(dailyReportsTable).values({
    date: d.date,
    weather: d.weather,
    temperature: d.temperature?.toString(),
    progress: d.progress.toString(),
    workersOnSite: d.workersOnSite ?? 0,
    issues: d.issues,
    notes: d.notes,
    projectId: d.projectId,
    organizationId,
    status: "draft",
    createdBy: String(req.vetraUser!.id),
  }).returning();

  res.status(201).json({
    ...row,
    temperature: row.temperature ? parseFloat(row.temperature as string) : null,
    progress: parseFloat(row.progress as string),
    status: row.status,
    projectName: project.name,
    createdAt: row.createdAt.toISOString(),
  });
  audit(req, "dailyreport.created", "daily_report", { resourceId: row.id, newValues: { projectId: row.projectId, progress: row.progress, status: row.status } });
});

router.get("/daily-reports/:id", requirePermission("daily-reports.read"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const organizationId = tenantId(req);
  const [row] = await db.select().from(dailyReportsTable).where(and(eq(dailyReportsTable.id, id), eq(dailyReportsTable.organizationId, organizationId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [proj] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, organizationId)));

  res.json({
    ...row,
    temperature: row.temperature ? parseFloat(row.temperature as string) : null,
    progress: parseFloat(row.progress as string),
    status: row.status,
    workflowRunId: row.workflowRunId,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/daily-reports/:id", requirePermission("daily-reports.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const organizationId = tenantId(req);

  const [existing] = await db.select().from(dailyReportsTable).where(and(eq(dailyReportsTable.id, id), eq(dailyReportsTable.organizationId, organizationId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (existing.status === "approved") {
    res.status(409).json({ error: "Approved daily reports are immutable. Use the workflow to make changes." });
    return;
  }
  if (existing.status !== "draft" && existing.status !== "revision_requested") {
    res.status(409).json({ error: `Daily reports with status '${existing.status}' cannot be edited directly. Use the appropriate transition endpoint.` });
    return;
  }

  const d = req.body ?? {};
  const updates: Record<string, unknown> = {};
  for (const key of ["date", "weather", "issues", "notes"]) if (d[key] !== undefined) updates[key] = d[key];
  if (d.temperature !== undefined) updates.temperature = String(d.temperature);
  if (d.progress !== undefined) updates.progress = String(d.progress);
  if (d.workersOnSite !== undefined) updates.workersOnSite = Number(d.workersOnSite);
  if (d.status !== undefined) {
    res.status(409).json({ error: "Use the transition endpoint to change lifecycle status" });
    return;
  }

  const [row] = await db.update(dailyReportsTable).set(updates).where(and(eq(dailyReportsTable.id, id), eq(dailyReportsTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  audit(req, "dailyreport.updated", "daily_report", { resourceId: id, newValues: { progress: row.progress, status: row.status } });
  res.json(row);
});

router.delete("/daily-reports/:id", requirePermission("daily-reports.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const organizationId = tenantId(req);

  const [existing] = await db.select().from(dailyReportsTable).where(and(eq(dailyReportsTable.id, id), eq(dailyReportsTable.organizationId, organizationId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.status === "approved") {
    res.status(409).json({ error: "Approved daily reports cannot be deleted" });
    return;
  }

  const [row] = await db.delete(dailyReportsTable).where(and(eq(dailyReportsTable.id, id), eq(dailyReportsTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  audit(req, "dailyreport.deleted", "daily_report", { resourceId: id, oldValues: { progress: row.progress, status: row.status } });
  res.status(200).json({ message: "Daily report deleted" });
});

// ─── Lifecycle Transition Endpoints ────────────────────────────────────────

router.post("/daily-reports/:id/submit", requirePermission("daily-reports.submit"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const parsed = submitInput.safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "Invalid submit request" }); return; }

  const organizationId = tenantId(req);

  const [report] = await db.select().from(dailyReportsTable).where(and(
    eq(dailyReportsTable.id, id),
    eq(dailyReportsTable.organizationId, organizationId),
  ));
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }
  if (report.status !== "draft") {
    res.status(409).json({ error: `Cannot submit a report with status '${report.status}'. Only draft reports can be submitted.` });
    return;
  }

  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, parsed.data.workflowId),
    eq(workflowsTable.organizationId, organizationId),
    eq(workflowsTable.entityType, "daily_report"),
    eq(workflowsTable.active, 1),
    isNull(workflowsTable.deletedAt),
  ));
  if (!workflow) { res.status(404).json({ error: "Daily report workflow not found" }); return; }

  const [firstStep] = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, workflow.id)).orderBy(asc(workflowStepsTable.stepOrder));
  if (!firstStep) { res.status(409).json({ error: "Workflow has no steps" }); return; }

  const [run] = await db.insert(workflowRunsTable).values({
    workflowId: workflow.id,
    organizationId,
    entityType: "daily_report",
    entityId: id,
    submittedBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
    currentStep: 1,
    status: "pending",
  }).returning();

  await db.insert(workflowRunEventsTable).values({
    organizationId,
    workflowRunId: run.id,
    workflowStepId: firstStep.id,
    action: "submitted",
    actorId: req.vetraUser!.id,
  });

  const [updated] = await db.update(dailyReportsTable).set({
    status: "submitted",
    workflowRunId: run.id,
    submittedBy: req.vetraUser!.id,
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(dailyReportsTable.id, id),
    eq(dailyReportsTable.organizationId, organizationId),
  )).returning();

  audit(req, "dailyreport.submitted", "daily_report", {
    resourceId: id,
    oldValues: { status: "draft" },
    newValues: { status: "submitted", workflowRunId: run.id },
  });

  await db.update(dailyReportsTable).set({
    status: "in_review",
    updatedAt: new Date(),
  }).where(and(
    eq(dailyReportsTable.id, id),
    eq(dailyReportsTable.organizationId, organizationId),
  ));

  res.status(200).json({
    ...updated,
    status: "in_review",
    workflowRunId: run.id,
    submittedBy: req.vetraUser!.id,
    submittedAt: updated.submittedAt?.toISOString() ?? null,
  });
});

router.post("/daily-reports/:id/transition", requirePermission("daily-reports.submit"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const parsed = dailyReportTransitionInput.safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "Invalid transition request" }); return; }

  const organizationId = tenantId(req);

  const [report] = await db.select().from(dailyReportsTable).where(and(
    eq(dailyReportsTable.id, id),
    eq(dailyReportsTable.organizationId, organizationId),
  ));
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const nextStatus = parsed.data.status as DailyReportStatus;
  const previousStatus = report.status as DailyReportStatus;

  if (!allowedTransition(previousStatus, nextStatus)) {
    res.status(409).json({ error: `Transition from '${previousStatus}' to '${nextStatus}' is not allowed` });
    return;
  }

  if (previousStatus !== "revision_requested" || nextStatus !== "draft") {
    res.status(409).json({ error: "This transition must be handled by the workflow engine" });
    return;
  }

  const [updated] = await db.update(dailyReportsTable).set({
    status: "draft",
    updatedAt: new Date(),
  }).where(and(
    eq(dailyReportsTable.id, id),
    eq(dailyReportsTable.organizationId, organizationId),
    eq(dailyReportsTable.status, "revision_requested"),
  )).returning();

  if (!updated) { res.status(409).json({ error: "Daily report changed concurrently; retry" }); return; }

  audit(req, "dailyreport.resubmitted", "daily_report", {
    resourceId: id,
    oldValues: { status: "revision_requested" },
    newValues: { status: "draft" },
    metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
  });

  res.json(updated);
});

router.get("/daily-reports/:id/workflow-events", requirePermission("daily-reports.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const [report] = await db.select({ workflowRunId: dailyReportsTable.workflowRunId }).from(dailyReportsTable).where(and(
    eq(dailyReportsTable.id, id),
    eq(dailyReportsTable.organizationId, organizationId),
  ));
  if (!report?.workflowRunId) { res.json([]); return; }

  const events = await db.select().from(workflowRunEventsTable).where(and(
    eq(workflowRunEventsTable.workflowRunId, report.workflowRunId),
    eq(workflowRunEventsTable.organizationId, organizationId),
  )).orderBy(asc(workflowRunEventsTable.createdAt));

  res.json(events);
});

// ─── Daily Report Workforce ─────────────────────────────────────────────────
// VETRA-DR-03: Workforce entries linked to a daily report.
// Each entry connects an employee (or group) to a daily report with role,
// count, attendance status, and hours worked.
// All mutations verify the daily report ownership AND that the workforce
// entry belongs to the specified daily report (same-tenant cross-report guard).

router.get("/daily-reports/:id/workforce", requirePermission("daily-reports.workforce.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const [entries, agg] = await Promise.all([
    listWorkforce(id, organizationId),
    aggregateWorkforce(id, organizationId),
  ]);

  res.json({
    entries: entries.map((e) => ({
      ...e,
      hoursWorked: Number(e.hoursWorked),
    })),
    aggregation: agg,
  });
});

router.post("/daily-reports/:id/workforce", requirePermission("daily-reports.workforce.create"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  let parsed;
  try {
    parsed = validateWorkforceInsert({
      ...req.body,
      dailyReportId: id,
      projectId: report.projectId,
    });
  } catch (err: any) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid workforce data" });
    return;
  }

  // Verify employee ownership if employeeId is provided
  if (parsed.employeeId) {
    const employeeExists = await verifyEmployeeOwnership(parsed.employeeId, organizationId);
    if (!employeeExists) { res.status(404).json({ error: "Employee not found" }); return; }
  }

  const entry = await createWorkforce(parsed, organizationId, req.vetraUser!.id);

  audit(req, "dailyreport.workforce.created", "daily_report_workforce", {
    resourceId: entry.id,
    newValues: {
      dailyReportId: id,
      employeeId: parsed.employeeId,
      groupName: parsed.groupName,
      role: parsed.role,
      count: parsed.count,
      attendanceStatus: parsed.attendanceStatus,
      hoursWorked: parsed.hoursWorked,
    },
  });

  res.status(201).json({ ...entry, hoursWorked: Number(entry.hoursWorked) });
});

router.patch("/daily-reports/:id/workforce/:entryId", requirePermission("daily-reports.workforce.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const entryId = idFrom(req.params.entryId);
  if (!id || !entryId) { res.status(400).json({ error: "Invalid id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  let parsed;
  try {
    parsed = validateWorkforceUpdate(req.body);
  } catch (err: any) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid workforce data" });
    return;
  }

  // Verify employee ownership if employeeId is being updated
  if (parsed.employeeId) {
    const employeeExists = await verifyEmployeeOwnership(parsed.employeeId, organizationId);
    if (!employeeExists) { res.status(404).json({ error: "Employee not found" }); return; }
  }

  // Pass dailyReportId (id) to enforce cross-report ownership check
  const updated = await updateWorkforce(entryId, parsed, organizationId, id);
  if (!updated) { res.status(404).json({ error: "Workforce entry not found" }); return; }

  audit(req, "dailyreport.workforce.updated", "daily_report_workforce", {
    resourceId: entryId,
    newValues: parsed,
  });

  res.json({ ...updated, hoursWorked: Number(updated.hoursWorked) });
});

router.get("/daily-reports/:id/workforce/aggregation", requirePermission("daily-reports.workforce.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const agg = await aggregateWorkforce(id, organizationId);
  res.json(agg);
});

// ─── Daily Report Materials ──────────────────────────────────────────────────
// VETRA-DR-04: Material entries linked to a daily report.
// Each entry records opening, received, consumed, returned, and closing quantity
// (computed server-side) for a material on a given day.
// All mutations verify the daily report ownership AND that the material
// entry belongs to the specified daily report (same-tenant cross-report guard).

router.get("/daily-reports/:id/materials", requirePermission("daily-reports.materials.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const [entries, agg] = await Promise.all([
    listMaterials(id, organizationId),
    aggregateMaterials(id, organizationId),
  ]);

  res.json({
    entries: entries.map((e) => ({
      ...e,
      openingQuantity: Number(e.openingQuantity),
      received: Number(e.received),
      consumed: Number(e.consumed),
      returned: Number(e.returned),
      closingQuantity: Number(e.closingQuantity),
    })),
    aggregation: agg,
  });
});

router.post("/daily-reports/:id/materials", requirePermission("daily-reports.materials.create"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  // Validate material ownership if materialId is provided
  if (req.body.materialId) {
    const material = await verifyMaterialOwnership(req.body.materialId, organizationId);
    if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  }

  let entry;
  try {
    entry = await createMaterial(
      {
        dailyReportId: id,
        projectId: report.projectId,
        materialId: req.body.materialId ?? null,
        openingQuantity: req.body.openingQuantity ?? 0,
        received: req.body.received ?? 0,
        consumed: req.body.consumed ?? 0,
        returned: req.body.returned ?? 0,
        unit: req.body.unit,
        notes: req.body.notes ?? null,
      },
      organizationId,
      req.vetraUser!.id,
    );
  } catch (err: any) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid material data" });
    return;
  }

  audit(req, "dailyreport.material.created", "daily_report_materials", {
    resourceId: entry.id,
    newValues: {
      dailyReportId: id,
      materialId: req.body.materialId ?? null,
      openingQuantity: req.body.openingQuantity ?? 0,
      received: req.body.received ?? 0,
      consumed: req.body.consumed ?? 0,
      returned: req.body.returned ?? 0,
      closingQuantity: Number(entry.closingQuantity),
      unit: req.body.unit,
    },
  });

  res.status(201).json({
    ...entry,
    openingQuantity: Number(entry.openingQuantity),
    received: Number(entry.received),
    consumed: Number(entry.consumed),
    returned: Number(entry.returned),
    closingQuantity: Number(entry.closingQuantity),
  });
});

router.patch("/daily-reports/:id/materials/:entryId", requirePermission("daily-reports.materials.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const entryId = idFrom(req.params.entryId);
  if (!id || !entryId) { res.status(400).json({ error: "Invalid id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  // Verify material ownership if materialId is being updated
  if (req.body.materialId) {
    const material = await verifyMaterialOwnership(req.body.materialId, organizationId);
    if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  }

  let updated;
  try {
    updated = await updateMaterial(entryId, req.body, organizationId, id);
  } catch (err: any) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid material data" });
    return;
  }

  if (!updated) { res.status(404).json({ error: "Material entry not found" }); return; }

  audit(req, "dailyreport.material.updated", "daily_report_materials", {
    resourceId: entryId,
    newValues: req.body,
  });

  res.json({
    ...updated,
    openingQuantity: Number(updated.openingQuantity),
    received: Number(updated.received),
    consumed: Number(updated.consumed),
    returned: Number(updated.returned),
    closingQuantity: Number(updated.closingQuantity),
  });
});

router.get("/daily-reports/:id/materials/aggregation", requirePermission("daily-reports.materials.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const agg = await aggregateMaterials(id, organizationId);
  res.json(agg);
});

// ─── Daily Report Equipment Routes ──────────────────────────────────────────

router.get("/daily-reports/:id/equipment", requirePermission("daily-reports.equipment.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const entries = await listEquipment(id, organizationId);

  res.json(entries.map((e) => ({
    ...e,
    operatingHours: Number(e.operatingHours),
    idleHours: Number(e.idleHours),
  })));
});

router.post("/daily-reports/:id/equipment", requirePermission("daily-reports.equipment.create"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  // Verify equipment ownership (must belong to same organization, and if assigned to a project, must match)
  if (req.body.equipmentId) {
    const equipment = await verifyEquipmentOwnership(req.body.equipmentId, organizationId, report.projectId);
    if (!equipment) { res.status(404).json({ error: "Equipment not found or not assigned to this project" }); return; }
  }

  // Verify operator ownership if provided
  if (req.body.operatorId) {
    const operator = await verifyOperatorOwnership(req.body.operatorId, organizationId, report.projectId);
    if (!operator) { res.status(404).json({ error: "Operator not found or does not belong to this organization" }); return; }
  }

  let entry;
  try {
    entry = await createEquipment(
      {
        dailyReportId: id,
        projectId: report.projectId,
        equipmentId: req.body.equipmentId,
        operatorId: req.body.operatorId ?? null,
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        operatingHours: req.body.operatingHours ?? 0,
        idleHours: req.body.idleHours ?? 0,
        status: req.body.status ?? "operating",
        notes: req.body.notes ?? null,
      },
      organizationId,
      req.vetraUser!.id,
    );
  } catch (err: any) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid equipment data" });
    return;
  }

  audit(req, "dailyreport.equipment.created", "daily_report_equipment", {
    resourceId: entry.id,
    newValues: {
      dailyReportId: id,
      equipmentId: req.body.equipmentId,
      operatorId: req.body.operatorId ?? null,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      operatingHours: req.body.operatingHours ?? 0,
      idleHours: req.body.idleHours ?? 0,
      status: req.body.status ?? "operating",
    },
  });

  res.status(201).json({
    ...entry,
    operatingHours: Number(entry.operatingHours),
    idleHours: Number(entry.idleHours),
  });
});

router.patch("/daily-reports/:id/equipment/:entryId", requirePermission("daily-reports.equipment.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const entryId = idFrom(req.params.entryId);
  if (!id || !entryId) { res.status(400).json({ error: "Invalid id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  // Verify equipment ownership if equipmentId is being updated
  if (req.body.equipmentId) {
    const equipment = await verifyEquipmentOwnership(req.body.equipmentId, organizationId, report.projectId);
    if (!equipment) { res.status(404).json({ error: "Equipment not found or not assigned to this project" }); return; }
  }

  // Verify operator ownership if operatorId is being updated
  if (req.body.operatorId) {
    const operator = await verifyOperatorOwnership(req.body.operatorId, organizationId, report.projectId);
    if (!operator) { res.status(404).json({ error: "Operator not found or does not belong to this organization" }); return; }
  }

  let updated;
  try {
    updated = await updateEquipment(entryId, req.body, organizationId, id);
  } catch (err: any) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid equipment data" });
    return;
  }

  if (!updated) { res.status(404).json({ error: "Equipment entry not found" }); return; }

  audit(req, "dailyreport.equipment.updated", "daily_report_equipment", {
    resourceId: entryId,
    newValues: req.body,
  });

  res.json({
    ...updated,
    operatingHours: Number(updated.operatingHours),
    idleHours: Number(updated.idleHours),
  });
});

router.get("/daily-reports/:id/equipment/aggregation", requirePermission("daily-reports.equipment.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid daily report id" }); return; }
  const organizationId = tenantId(req);

  const report = await verifyDailyReportOwnership(id, organizationId);
  if (!report) { res.status(404).json({ error: "Daily report not found" }); return; }

  const agg = await aggregateEquipment(id, organizationId);
  res.json(agg);
});

export default router;
