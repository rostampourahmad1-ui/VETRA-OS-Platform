import { Router } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  db,
  formSubmissionsTable,
  nonConformanceReportsTable,
  qualityEventsTable,
  workflowRunEventsTable,
  workflowRunsTable,
  workflowStepsTable,
  workflowsTable,
} from "@workspace/db";
import {
  PostWorkflowRunsIdDecisionBody,
  PostWorkflowRunsIdDecisionParams,
  PostWorkflowsBody,
  PostWorkflowsIdRunsBody,
  PostWorkflowsIdRunsParams,
} from "@workspace/api-zod";
import { audit } from "../lib/audit";
import { requireAuth } from "../middlewares/requireAuth";
import { notifyWorkflowDecision } from "../lib/notifications";
import { hasPermission, requirePermission } from "../middlewares/permissions";
import { isProjectMember, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

function serialize<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ])) as T;
}

router.get("/workflows", requirePermission("workflows.read"), async (req, res): Promise<void> => {
  const workflows = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.organizationId, tenantId(req)),
    isNull(workflowsTable.deletedAt),
  ));
  res.json(workflows.map(serialize));
});

router.get("/workflows/:id", requirePermission("workflows.read"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || id < 1) { res.status(400).json({ error: "Invalid workflow id" }); return; }
  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, id),
    eq(workflowsTable.organizationId, tenantId(req)),
    isNull(workflowsTable.deletedAt),
  ));
  if (!workflow) { res.status(404).json({ error: "Workflow not found" }); return; }
  const steps = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, id)).orderBy(asc(workflowStepsTable.stepOrder));
  res.json({ ...serialize(workflow), steps: steps.map(serialize) });
});

router.get("/workflow-runs/:id", requirePermission("workflows.read"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!id || id < 1) { res.status(400).json({ error: "Invalid workflow run id" }); return; }
  const [run] = await db.select().from(workflowRunsTable).where(and(
    eq(workflowRunsTable.id, id),
    eq(workflowRunsTable.organizationId, tenantId(req)),
  ));
  if (!run) { res.status(404).json({ error: "Workflow run not found" }); return; }
  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, run.workflowId),
    eq(workflowsTable.organizationId, tenantId(req)),
    isNull(workflowsTable.deletedAt),
  ));
  const steps = workflow
    ? await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, run.workflowId)).orderBy(asc(workflowStepsTable.stepOrder))
    : [];
  const events = await db.select().from(workflowRunEventsTable).where(and(
    eq(workflowRunEventsTable.workflowRunId, id),
    eq(workflowRunEventsTable.organizationId, tenantId(req)),
  )).orderBy(asc(workflowRunEventsTable.createdAt));
  res.json({
    ...serialize(run),
    workflow: workflow ? serialize(workflow) : null,
    steps: steps.map(serialize),
    events: events.map(serialize),
  });
});

router.get("/workflow-runs", requirePermission("workflows.read"), async (req, res): Promise<void> => {
  const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
  const entityId = typeof req.query.entityId === "string" ? Number(req.query.entityId) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions = [eq(workflowRunsTable.organizationId, tenantId(req))];
  if (entityType) conditions.push(eq(workflowRunsTable.entityType, entityType));
  if (entityId && entityId > 0) conditions.push(eq(workflowRunsTable.entityId, entityId));
  if (status) conditions.push(eq(workflowRunsTable.status, status));
  const runs = await db.select().from(workflowRunsTable).where(and(...conditions)).orderBy(asc(workflowRunsTable.createdAt));
  res.json(runs.map(serialize));
});

router.post("/workflows", requirePermission("workflows.manage"), async (req, res): Promise<void> => {
  const parsed = PostWorkflowsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  const duplicatePermissions = data.steps.some((step, index) =>
    data.steps.findIndex((candidate) => candidate.name === step.name) !== index,
  );
  if (duplicatePermissions) { res.status(400).json({ error: "Workflow step names must be unique" }); return; }

  const [workflow] = await db.insert(workflowsTable).values({
    name: data.name,
    entityType: data.entityType,
    organizationId: tenantId(req),
    createdBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
  }).returning();
  const steps = await db.insert(workflowStepsTable).values(data.steps.map((step, index) => ({
    workflowId: workflow.id,
    stepOrder: index + 1,
    name: step.name,
    requiredPermission: step.requiredPermission,
    approvalType: step.approvalType ?? "single",
    requiredApprovals: step.requiredApprovals ?? 1,
  }))).returning();
  audit(req, "workflow.created", "workflow", { resourceId: workflow.id, newValues: { name: workflow.name, entityType: workflow.entityType, steps: steps.length } });
  res.status(201).json({ ...serialize(workflow), steps: steps.map(serialize) });
});

router.post("/workflows/:id/runs", requirePermission("workflows.execute"), async (req, res): Promise<void> => {
  const params = PostWorkflowsIdRunsParams.safeParse(req.params);
  const parsed = PostWorkflowsIdRunsBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid workflow run request" }); return; }
  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, params.data.id),
    eq(workflowsTable.organizationId, tenantId(req)),
    eq(workflowsTable.active, 1),
    isNull(workflowsTable.deletedAt),
  ));
  if (!workflow) { res.status(404).json({ error: "Workflow not found" }); return; }
  // No generic entity adapter is allowed: an unvalidated entity ID could bypass
  // the owning domain's resource check. Forms is the only P1 adapter.
  if (workflow.entityType !== "form_submission") {
    res.status(409).json({ error: "Workflow entity type is not supported by the secure run adapter" });
    return;
  }
  if (!(await hasPermission(req.vetraUser!.id, tenantId(req), "forms.submit"))) {
    res.status(403).json({ error: "Forbidden", permission: "forms.submit" });
    return;
  }
  const [submission] = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.id, parsed.data.entityId),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
    isNull(formSubmissionsTable.deletedAt),
  ));
  if (!submission) { res.status(404).json({ error: "Form submission not found" }); return; }
  if (submission.submittedBy !== req.vetraUser!.id) { res.status(403).json({ error: "Only the submitter may start this workflow" }); return; }
  if (submission.status !== "submitted" || submission.workflowRunId) { res.status(409).json({ error: "Form submission is not eligible for a workflow run" }); return; }
  const [firstStep] = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, workflow.id)).orderBy(asc(workflowStepsTable.stepOrder));
  if (!firstStep) { res.status(409).json({ error: "Workflow has no steps" }); return; }

  const [run] = await db.insert(workflowRunsTable).values({
    workflowId: workflow.id,
    organizationId: tenantId(req),
    entityType: "form_submission",
    entityId: submission.id,
    submittedBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
    payload: parsed.data.payload ?? {},
  }).returning();
  await db.insert(workflowRunEventsTable).values({
    organizationId: tenantId(req),
    workflowRunId: run.id,
    workflowStepId: firstStep.id,
    action: "submitted",
    actorId: req.vetraUser!.id,
  });
  await db.update(formSubmissionsTable).set({ workflowRunId: run.id, updatedAt: new Date() }).where(and(
    eq(formSubmissionsTable.id, submission.id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
  ));
  audit(req, "workflow_run.submitted", "workflow_run", { resourceId: run.id, newValues: { workflowId: run.workflowId, entityType: run.entityType, entityId: run.entityId } });
  res.status(201).json(serialize(run));
});

router.post("/workflow-runs/:id/decision", requirePermission("workflows.approve"), async (req, res): Promise<void> => {
  const params = PostWorkflowRunsIdDecisionParams.safeParse(req.params);
  const parsed = PostWorkflowRunsIdDecisionBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid workflow decision" }); return; }
  const decision = parsed.data.decision;
  const comment = parsed.data.comment?.trim();
  if (decision === "request_revision" && !comment) { res.status(400).json({ error: "A revision request requires a comment" }); return; }

  const [run] = await db.select().from(workflowRunsTable).where(and(
    eq(workflowRunsTable.id, params.data.id),
    eq(workflowRunsTable.organizationId, tenantId(req)),
  ));
  if (!run) { res.status(404).json({ error: "Workflow run not found" }); return; }
  if (run.status !== "pending") { res.status(409).json({ error: "Workflow run is not pending" }); return; }

  const [step] = await db.select().from(workflowStepsTable).where(and(
    eq(workflowStepsTable.workflowId, run.workflowId),
    eq(workflowStepsTable.stepOrder, run.currentStep),
  ));
  if (!step) { res.status(409).json({ error: "Workflow has no current step" }); return; }
  if (!(await hasPermission(req.vetraUser!.id, tenantId(req), step.requiredPermission))) {
    res.status(403).json({ error: "Forbidden", permission: step.requiredPermission });
    return;
  }

  const [linkedNcr] = run.entityType === "non_conformance_report"
    ? await db.select().from(nonConformanceReportsTable).where(and(
      eq(nonConformanceReportsTable.workflowRunId, run.id),
      eq(nonConformanceReportsTable.organizationId, tenantId(req)),
      isNull(nonConformanceReportsTable.deletedAt),
    ))
    : [undefined];
  if (run.entityType === "non_conformance_report" && !linkedNcr) {
    res.status(409).json({ error: "Workflow run is not linked to an active NCR" }); return;
  }

  // VETRA-SEC-11: Cross-project ownership – the approver must be a member of
  // the linked entity's project when the entity is project-scoped.
  const [linkedSubmission] = run.entityType === "form_submission"
    ? await db.select().from(formSubmissionsTable).where(and(
      eq(formSubmissionsTable.workflowRunId, run.id),
      eq(formSubmissionsTable.organizationId, tenantId(req)),
      isNull(formSubmissionsTable.deletedAt),
    ))
    : [undefined];
  if (run.entityType === "form_submission" && !linkedSubmission) {
    res.status(409).json({ error: "Workflow run is not linked to an active form submission" }); return;
  }
  const entityProjectId = linkedNcr?.projectId ?? linkedSubmission?.projectId ?? null;
  if (entityProjectId != null && !(await isProjectMember(req, entityProjectId))) {
    res.status(403).json({ error: "Forbidden: not a member of the entity's project", projectId: entityProjectId });
    return;
  }

  const [step] = await db.select().from(workflowStepsTable).where(and(
    eq(workflowStepsTable.workflowId, run.workflowId),
    eq(workflowStepsTable.stepOrder, run.currentStep),
  ));
  if (decision === "approve" && existingApproval) {
    res.status(409).json({ error: "You have already approved this step" });
    return;
  }

  // VETRA-SEC-11: Prevent duplicate approval by the same actor.
  // A single actor must not approve the same step more than once.
  const [existingApproval] = await db.select().from(workflowRunEventsTable).where(and(
    eq(workflowRunEventsTable.workflowRunId, run.id),
    eq(workflowRunEventsTable.workflowStepId, step.id),
    eq(workflowRunEventsTable.action, "approve"),
    eq(workflowRunEventsTable.actorId, req.vetraUser!.id),
  ));
  if (decision === "approve" && existingApproval) {
    res.status(409).json({ error: "You have already approved this step" });
    return;
  }

  // Approval gate: check if enough approvals have been collected
  let shouldAdvance = true;
  if (decision === "approve" && step.approvalType === "any" && step.requiredApprovals && step.requiredApprovals > 1) {
    const approveEvents = await db.select().from(workflowRunEventsTable).where(and(
      eq(workflowRunEventsTable.workflowRunId, run.id),
      eq(workflowRunEventsTable.workflowStepId, step.id),
      eq(workflowRunEventsTable.action, "approve"),
    ));
    // The current actor's approval has not yet been recorded; it counts as +1
    // toward the required total.
    shouldAdvance = approveEvents.length >= step.requiredApprovals - 1;
  }

  const steps = await db.select().from(workflowStepsTable).where(and(
    eq(workflowStepsTable.workflowId, run.workflowId),
  )).orderBy(asc(workflowStepsTable.stepOrder));
  const isFinalApproval = decision === "approve" && shouldAdvance && run.currentStep >= steps.length;

  let nextStepVal;
  let nextStatusVal;
  let completedAtVal;

  if (decision === "approve" && shouldAdvance) {
    nextStepVal = isFinalApproval ? run.currentStep : run.currentStep + 1;
    nextStatusVal = isFinalApproval ? "approved" : "pending";
    completedAtVal = isFinalApproval ? new Date() : null;
  } else if (decision === "reject") {
    nextStepVal = run.currentStep;
    nextStatusVal = "rejected";
    completedAtVal = new Date();
  } else if (decision === "request_revision") {
    nextStepVal = run.currentStep;
    nextStatusVal = "revision_requested";
    completedAtVal = new Date();
  } else {
    // Approval gate: not enough approvals yet, stay on same step
    nextStepVal = run.currentStep;
    nextStatusVal = "pending";
    completedAtVal = null;
  }

  const [updated] = await db.update(workflowRunsTable).set({
    currentStep: nextStepVal,
    status: nextStatusVal,
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
    completedAt: completedAtVal,
  }).where(and(
    eq(workflowRunsTable.id, run.id),
    eq(workflowRunsTable.organizationId, tenantId(req)),
    eq(workflowRunsTable.currentStep, run.currentStep),
    eq(workflowRunsTable.status, "pending"),
  )).returning();
  if (!updated) { res.status(409).json({ error: "Workflow run changed concurrently; retry the decision" }); return; }

  await db.insert(workflowRunEventsTable).values({
    organizationId: tenantId(req),
    workflowRunId: run.id,
    workflowStepId: step.id,
    action: decision,
    comment: comment ?? null,
    actorId: req.vetraUser!.id,
  });

  // Only update the linked entity when the workflow actually transitions
  if (updated.status !== "pending") {
  if (run.entityType === "form_submission") {
    const submissionStatus = decision === "approve"
      ? (isFinalApproval ? "approved" : "submitted")
      : decision === "reject" ? "rejected" : "revision_requested";
    await db.update(formSubmissionsTable).set({
      status: submissionStatus,
      updatedAt: new Date(),
    }).where(and(
      eq(formSubmissionsTable.workflowRunId, run.id),
      eq(formSubmissionsTable.organizationId, tenantId(req)),
    ));
  } else if (run.entityType === "non_conformance_report" && linkedNcr) {
    const ncrStatus = decision === "approve"
      ? (isFinalApproval ? "closed" : "awaiting_approval")
      : "in_progress";
    const qualityEventType = decision === "approve"
      ? "workflow_approved"
      : decision === "reject" ? "workflow_rejected" : "workflow_revision_requested";
    const [updatedNcr] = await db.update(nonConformanceReportsTable).set({
      status: ncrStatus,
      updatedBy: req.vetraUser!.id,
      updatedAt: new Date(),
    }).where(and(
      eq(nonConformanceReportsTable.id, linkedNcr.id),
      eq(nonConformanceReportsTable.organizationId, tenantId(req)),
      eq(nonConformanceReportsTable.workflowRunId, run.id),
      isNull(nonConformanceReportsTable.deletedAt),
    )).returning();
    if (!updatedNcr) { res.status(409).json({ error: "Linked NCR changed concurrently; retry the decision" }); return; }
    await db.insert(qualityEventsTable).values({
      organizationId: tenantId(req),
      projectId: updatedNcr.projectId,
      entityType: "non_conformance_report",
      entityId: updatedNcr.id,
      eventType: qualityEventType,
      previousStatus: linkedNcr.status,
      nextStatus: updatedNcr.status,
      reason: comment ?? null,
      snapshot: { workflowRunId: run.id, workflowStatus: updated.status, currentStep: updated.currentStep },
      actorId: req.vetraUser!.id,
    });
    audit(req, `ncr.${qualityEventType}`, "non_conformance_report", {
      resourceId: updatedNcr.id,
      oldValues: { status: linkedNcr.status, workflowRunId: run.id },
      newValues: { status: updatedNcr.status, workflowRunId: run.id },
      metadata: comment ? { comment } : undefined,
    });
  }

  } // end if (updated.status !== "pending")

  // Notify the workflow initiator about the decision
  if (updated.status !== "pending" && run.submittedBy != null && run.submittedBy !== req.vetraUser!.id) {
    const decisionLabel = updated.status === "approved"
      ? "approved"
      : updated.status === "rejected" ? "rejected" : "revision_requested";
    const entityTitle = run.entityType === "form_submission"
      ? `فرم #${run.entityId ?? ""}` : `NCR #${run.entityId ?? ""}`;
    notifyWorkflowDecision(run.organizationId, run.submittedBy, entityTitle, decisionLabel, run.id);
  }

  audit(req, `workflow_run.${decision}`, "workflow_run", {
    resourceId: run.id,
    oldValues: { status: run.status, currentStep: run.currentStep },
    newValues: { status: updated.status, currentStep: updated.currentStep },
    metadata: comment ? { comment } : undefined,
  });
  res.json(serialize(updated));
});

export default router;
