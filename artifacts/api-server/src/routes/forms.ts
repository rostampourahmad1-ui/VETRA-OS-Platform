import { Router } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  formSubmissionsTable,
  formTemplateVersionsTable,
  formTemplatesTable,
  workflowRunEventsTable,
  workflowRunsTable,
  workflowStepsTable,
  workflowsTable,
} from "@workspace/db";
import {
  GetFormSubmissionsIdParams,
  GetFormsTemplatesIdParams,
  PatchFormSubmissionsIdBody,
  PatchFormsTemplatesIdBody,
  PostFormSubmissionsBody,
  PostFormsTemplatesBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

type FormField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox";
  required: boolean;
  placeholder?: string;
  options?: string[];
};

type FormDefinition = { fields: FormField[] };
type Answers = Record<string, unknown>;

function parseId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function serialize<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString() : value,
  ])) as T;
}

function validateAnswers(definition: FormDefinition, answers: Answers): string | null {
  const fields = new Map(definition.fields.map((field) => [field.id, field]));
  for (const key of Object.keys(answers)) {
    if (!fields.has(key)) return `Unknown form field: ${key}`;
  }

  for (const field of definition.fields) {
    const value = answers[field.id];
    const missing = value === undefined || value === null || value === "";
    // Type-check before required check so invalid types get the right error
    if (!missing) {
      if (field.type === "text" && typeof value !== "string") return `Invalid text value for: ${field.label}`;
      if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return `Invalid number value for: ${field.label}`;
      if (field.type === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return `Invalid date value for: ${field.label}`;
      if (field.type === "checkbox" && typeof value !== "boolean") return `Invalid checkbox value for: ${field.label}`;
      if (field.type === "select" && (typeof value !== "string" || !field.options?.includes(value))) return `Invalid selection for: ${field.label}`;
    }
    if (field.required && (missing || (field.type === "checkbox" && value !== true))) {
      return `Required field is missing: ${field.label}`;
    }
    if (missing) continue;
  }
  return null;
}

async function findTemplate(req: Parameters<typeof tenantId>[0], id: number) {
  const [template] = await db.select().from(formTemplatesTable).where(and(
    eq(formTemplatesTable.id, id),
    eq(formTemplatesTable.organizationId, tenantId(req)),
    isNull(formTemplatesTable.deletedAt),
  ));
  return template ?? null;
}

async function ensureProjectOwnership(req: Parameters<typeof tenantId>[0], projectId?: number | null): Promise<boolean> {
  return !projectId || Boolean(await ownedProject(req, projectId));
}

async function ensureWorkflowOwnership(req: Parameters<typeof tenantId>[0], workflowId?: number | null): Promise<boolean> {
  if (!workflowId) return true;
  const [workflow] = await db.select().from(workflowsTable).where(and(
    eq(workflowsTable.id, workflowId),
    eq(workflowsTable.organizationId, tenantId(req)),
    eq(workflowsTable.active, 1),
  ));
  return Boolean(workflow);
}

router.get("/forms/templates", requirePermission("forms.read"), async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };
  const rows = await db.select().from(formTemplatesTable).where(and(
    eq(formTemplatesTable.organizationId, tenantId(req)),
    isNull(formTemplatesTable.deletedAt),
  ));
  const filtered = rows.filter((row) =>
    (!projectId || row.projectId === Number(projectId)) &&
    (!status || row.status === status),
  );
  res.json(filtered.map(serialize));
});

router.post("/forms/templates", requirePermission("forms.manage"), async (req, res): Promise<void> => {
  const parsed = PostFormsTemplatesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;
  if (!(await ensureProjectOwnership(req, data.projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await ensureWorkflowOwnership(req, data.workflowId))) { res.status(404).json({ error: "Workflow not found" }); return; }

  const [row] = await db.insert(formTemplatesTable).values({
    organizationId: tenantId(req),
    projectId: data.projectId ?? null,
    workflowId: data.workflowId ?? null,
    name: data.name,
    description: data.description ?? null,
    definition: data.definition,
    createdBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
  }).returning();
  audit(req, "form_template.created", "form_template", { resourceId: row.id, newValues: { name: row.name, status: row.status } });
  res.status(201).json(serialize(row));
});

router.get("/forms/analytics", requirePermission("forms.read"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const submissions = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.organizationId, org),
    isNull(formSubmissionsTable.deletedAt),
  ));
  const templates = await db.select().from(formTemplatesTable).where(and(
    eq(formTemplatesTable.organizationId, org),
    isNull(formTemplatesTable.deletedAt),
  ));

  const decided = submissions.filter((s) => s.status === "approved" || s.status === "rejected");
  const approvalRate = decided.length
    ? (decided.filter((s) => s.status === "approved").length / decided.length) * 100
    : 0;

  const cycleTimes = submissions
    .filter((s) => s.submittedAt && (s.status === "approved" || s.status === "rejected"))
    .map((s) => (new Date(s.updatedAt).getTime() - new Date(s.submittedAt!).getTime()) / 3_600_000)
    .filter((hours) => Number.isFinite(hours) && hours >= 0);
  const avgCycleTimeHours = cycleTimes.length
    ? cycleTimes.reduce((sum, hours) => sum + hours, 0) / cycleTimes.length
    : 0;

  const templateNames = new Map(templates.map((t) => [t.id, t.name]));
  const counts = new Map<number, number>();
  for (const submission of submissions) {
    counts.set(submission.templateId, (counts.get(submission.templateId) ?? 0) + 1);
  }
  const submissionsByTemplate = [...counts.entries()]
    .map(([templateId, count]) => ({
      templateId,
      templateName: templateNames.get(templateId) ?? `Template #${templateId}`,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const pendingRuns = await db.select().from(workflowRunsTable).where(and(
    eq(workflowRunsTable.organizationId, org),
    eq(workflowRunsTable.entityType, "form_submission"),
    eq(workflowRunsTable.status, "pending"),
  ));
  const steps = pendingRuns.length
    ? await db.select().from(workflowStepsTable)
    : [];
  const stepWaits = new Map<string, { total: number; count: number }>();
  for (const run of pendingRuns) {
    const step = steps.find((s) => s.workflowId === run.workflowId && s.stepOrder === run.currentStep);
    if (!step) continue;
    const waitHours = (Date.now() - new Date(run.updatedAt).getTime()) / 3_600_000;
    if (!Number.isFinite(waitHours) || waitHours < 0) continue;
    const entry = stepWaits.get(step.name) ?? { total: 0, count: 0 };
    entry.total += waitHours;
    entry.count += 1;
    stepWaits.set(step.name, entry);
  }
  const bottlenecks = [...stepWaits.entries()]
    .map(([stepName, { total, count }]) => ({ stepName, avgWaitHours: total / count, count }))
    .sort((a, b) => b.avgWaitHours - a.avgWaitHours);

  res.json({
    totalSubmissions: submissions.length,
    approvalRate,
    avgCycleTimeHours,
    submissionsByTemplate,
    bottlenecks,
  });
});

router.get("/forms/templates/:id", requirePermission("forms.read"), async (req, res): Promise<void> => {
  const parsed = GetFormsTemplatesIdParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid template id" }); return; }
  const template = await findTemplate(req, parsed.data.id);
  if (!template) { res.status(404).json({ error: "Form template not found" }); return; }
  const versions = await db.select().from(formTemplateVersionsTable).where(and(
    eq(formTemplateVersionsTable.templateId, template.id),
    eq(formTemplateVersionsTable.organizationId, tenantId(req)),
  )).orderBy(desc(formTemplateVersionsTable.version));
  res.json({ ...serialize(template), versions: versions.map(serialize) });
});

router.patch("/forms/templates/:id", requirePermission("forms.manage"), async (req, res): Promise<void> => {
  const params = GetFormsTemplatesIdParams.safeParse(req.params);
  const parsed = PatchFormsTemplatesIdBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid form template update" }); return; }
  const template = await findTemplate(req, params.data.id);
  if (!template) { res.status(404).json({ error: "Form template not found" }); return; }
  if (template.status !== "draft") { res.status(409).json({ error: "Only draft templates can be edited" }); return; }

  const data = parsed.data;
  if (!(await ensureProjectOwnership(req, data.projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  if (!(await ensureWorkflowOwnership(req, data.workflowId))) { res.status(404).json({ error: "Workflow not found" }); return; }
  const updates: Record<string, unknown> = { updatedBy: req.vetraUser!.id, updatedAt: new Date() };
  for (const key of ["name", "description", "projectId", "workflowId", "definition"] as const) {
    if (data[key] !== undefined) updates[key] = data[key];
  }
  const [row] = await db.update(formTemplatesTable).set(updates).where(and(
    eq(formTemplatesTable.id, template.id),
    eq(formTemplatesTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_template.updated", "form_template", { resourceId: row.id, oldValues: { name: template.name }, newValues: { name: row.name } });
  res.json(serialize(row));
});

router.post("/forms/templates/:id/publish", requirePermission("forms.manage"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid template id" }); return; }
  const template = await findTemplate(req, id);
  if (!template) { res.status(404).json({ error: "Form template not found" }); return; }
  if (template.status !== "draft") { res.status(409).json({ error: "Only draft templates can be published" }); return; }

  const existingVersions = await db.select().from(formTemplateVersionsTable).where(and(
    eq(formTemplateVersionsTable.templateId, template.id),
    eq(formTemplateVersionsTable.organizationId, tenantId(req)),
  )).orderBy(desc(formTemplateVersionsTable.version));
  const nextVersion = (existingVersions[0]?.version ?? 0) + 1;
  const [version] = await db.insert(formTemplateVersionsTable).values({
    organizationId: tenantId(req),
    templateId: template.id,
    version: nextVersion,
    definition: template.definition,
    publishedBy: req.vetraUser!.id,
  }).returning();
  const [updated] = await db.update(formTemplatesTable).set({
    status: "published",
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
  }).where(and(
    eq(formTemplatesTable.id, template.id),
    eq(formTemplatesTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_template.published", "form_template", { resourceId: updated.id, newValues: { version: version.version } });
  res.json({ template: serialize(updated), version: serialize(version) });
});

router.delete("/forms/templates/:id", requirePermission("forms.manage"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid template id" }); return; }
  const template = await findTemplate(req, id);
  if (!template) { res.status(404).json({ error: "Form template not found" }); return; }
  if (template.status !== "draft") { res.status(409).json({ error: "Only draft templates can be deleted" }); return; }
  const [row] = await db.update(formTemplatesTable).set({
    deletedAt: new Date(),
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
  }).where(and(
    eq(formTemplatesTable.id, template.id),
    eq(formTemplatesTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_template.deleted", "form_template", { resourceId: row.id, oldValues: { name: template.name, status: template.status } });
  res.status(204).end();
});

router.post("/forms/templates/:id/duplicate", requirePermission("forms.manage"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid template id" }); return; }
  const template = await findTemplate(req, id);
  if (!template) { res.status(404).json({ error: "Form template not found" }); return; }
  const [row] = await db.insert(formTemplatesTable).values({
    organizationId: tenantId(req),
    projectId: template.projectId,
    workflowId: template.workflowId,
    name: `${template.name} (Copy)`,
    description: template.description,
    definition: template.definition,
    createdBy: req.vetraUser!.id,
    updatedBy: req.vetraUser!.id,
  }).returning();
  audit(req, "form_template.duplicated", "form_template", { resourceId: row.id, newValues: { name: row.name, sourceId: template.id } });
  res.status(201).json(serialize(row));
});

router.post("/forms/templates/:id/archive", requirePermission("forms.manage"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid template id" }); return; }
  const template = await findTemplate(req, id);
  if (!template) { res.status(404).json({ error: "Form template not found" }); return; }
  if (template.status !== "published") { res.status(409).json({ error: "Only published templates can be archived" }); return; }
  const [row] = await db.update(formTemplatesTable).set({
    status: "archived",
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
  }).where(and(
    eq(formTemplatesTable.id, template.id),
    eq(formTemplatesTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_template.archived", "form_template", { resourceId: row.id, oldValues: { status: template.status }, newValues: { status: row.status } });
  res.json(serialize(row));
});

router.get("/form-submissions", requirePermission("forms.read"), async (req, res): Promise<void> => {
  const { projectId, templateId, status } = req.query as { projectId?: string; templateId?: string; status?: string };
  const rows = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.organizationId, tenantId(req)),
    isNull(formSubmissionsTable.deletedAt),
  ));
  const filtered = rows.filter((row) =>
    (!projectId || row.projectId === Number(projectId)) &&
    (!templateId || row.templateId === Number(templateId)) &&
    (!status || row.status === status),
  );
  res.json(filtered.map(serialize));
});

router.post("/form-submissions", requirePermission("forms.submit"), async (req, res): Promise<void> => {
  const parsed = PostFormSubmissionsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const template = await findTemplate(req, parsed.data.templateId);
  if (!template || template.status !== "published") { res.status(404).json({ error: "Published form template not found" }); return; }
  if (!(await ensureProjectOwnership(req, template.projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  const [version] = await db.select().from(formTemplateVersionsTable).where(and(
    eq(formTemplateVersionsTable.templateId, template.id),
    eq(formTemplateVersionsTable.organizationId, tenantId(req)),
  )).orderBy(desc(formTemplateVersionsTable.version));
  if (!version) { res.status(409).json({ error: "Published template version not found" }); return; }
  const answerError = validateAnswers(version.definition as FormDefinition, parsed.data.answers as Answers);
  if (answerError) { res.status(400).json({ error: answerError }); return; }

  const [row] = await db.insert(formSubmissionsTable).values({
    organizationId: tenantId(req),
    projectId: template.projectId,
    templateId: template.id,
    templateVersionId: version.id,
    answers: parsed.data.answers,
    submittedBy: req.vetraUser!.id,
  }).returning();
  audit(req, "form_submission.created", "form_submission", { resourceId: row.id, newValues: { templateId: row.templateId, status: row.status } });
  res.status(201).json(serialize(row));
});

router.get("/form-submissions/:id", requirePermission("forms.read"), async (req, res): Promise<void> => {
  const parsed = GetFormSubmissionsIdParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid submission id" }); return; }
  const [row] = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.id, parsed.data.id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
    isNull(formSubmissionsTable.deletedAt),
  ));
  if (!row) { res.status(404).json({ error: "Form submission not found" }); return; }
  res.json(serialize(row));
});

router.patch("/form-submissions/:id", requirePermission("forms.submit"), async (req, res): Promise<void> => {
  const params = GetFormSubmissionsIdParams.safeParse(req.params);
  const parsed = PatchFormSubmissionsIdBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid form submission update" }); return; }
  const [submission] = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.id, params.data.id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
    isNull(formSubmissionsTable.deletedAt),
  ));
  if (!submission) { res.status(404).json({ error: "Form submission not found" }); return; }
  if (submission.submittedBy !== req.vetraUser!.id) { res.status(403).json({ error: "Only the submitter may edit this response" }); return; }
  if (!["draft", "revision_requested"].includes(submission.status)) { res.status(409).json({ error: "Submission cannot be edited in its current state" }); return; }
  const [version] = await db.select().from(formTemplateVersionsTable).where(and(
    eq(formTemplateVersionsTable.id, submission.templateVersionId),
    eq(formTemplateVersionsTable.organizationId, tenantId(req)),
  ));
  if (!version) { res.status(409).json({ error: "Template version not found" }); return; }
  const answerError = validateAnswers(version.definition as FormDefinition, parsed.data.answers as Answers);
  if (answerError) { res.status(400).json({ error: answerError }); return; }
  const [row] = await db.update(formSubmissionsTable).set({
    answers: parsed.data.answers,
    status: submission.status === "revision_requested" ? "draft" : submission.status,
    updatedAt: new Date(),
  }).where(and(
    eq(formSubmissionsTable.id, submission.id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_submission.updated", "form_submission", { resourceId: row.id, oldValues: { status: submission.status }, newValues: { status: row.status } });
  res.json(serialize(row));
});

router.post("/form-submissions/:id/submit", requirePermission("forms.submit"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid submission id" }); return; }
  const [submission] = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.id, id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
    isNull(formSubmissionsTable.deletedAt),
  ));
  if (!submission) { res.status(404).json({ error: "Form submission not found" }); return; }
  if (submission.submittedBy !== req.vetraUser!.id) { res.status(403).json({ error: "Only the submitter may submit this response" }); return; }
  if (!["draft", "revision_requested"].includes(submission.status)) { res.status(409).json({ error: "Submission cannot be submitted in its current state" }); return; }
  const [version] = await db.select().from(formTemplateVersionsTable).where(and(
    eq(formTemplateVersionsTable.id, submission.templateVersionId),
    eq(formTemplateVersionsTable.organizationId, tenantId(req)),
  ));
  if (!version) { res.status(409).json({ error: "Template version not found" }); return; }
  const answerError = validateAnswers(version.definition as FormDefinition, submission.answers as Answers);
  if (answerError) { res.status(400).json({ error: answerError }); return; }
  const [template] = await db.select().from(formTemplatesTable).where(and(
    eq(formTemplatesTable.id, submission.templateId),
    eq(formTemplatesTable.organizationId, tenantId(req)),
  ));
  if (!template) { res.status(409).json({ error: "Form template not found" }); return; }

  let workflowRunId: number | null = submission.workflowRunId;
  if (template.workflowId && !workflowRunId) {
    const [workflow] = await db.select().from(workflowsTable).where(and(
      eq(workflowsTable.id, template.workflowId),
      eq(workflowsTable.organizationId, tenantId(req)),
      eq(workflowsTable.active, 1),
    ));
    if (!workflow || workflow.entityType !== "form_submission") {
      res.status(409).json({ error: "Form workflow is not available for submissions" });
      return;
    }
    const [firstStep] = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, workflow.id)).orderBy(asc(workflowStepsTable.stepOrder));
    if (!firstStep) { res.status(409).json({ error: "Form workflow has no steps" }); return; }
    const [run] = await db.insert(workflowRunsTable).values({
      workflowId: workflow.id,
      organizationId: tenantId(req),
      entityType: "form_submission",
      entityId: submission.id,
      submittedBy: req.vetraUser!.id,
      updatedBy: req.vetraUser!.id,
      payload: { templateId: template.id, templateVersionId: submission.templateVersionId },
    }).returning();
    await db.insert(workflowRunEventsTable).values({
      organizationId: tenantId(req),
      workflowRunId: run.id,
      workflowStepId: firstStep.id,
      action: "submitted",
      actorId: req.vetraUser!.id,
    });
    audit(req, "workflow_run.submitted", "workflow_run", { resourceId: run.id, newValues: { workflowId: run.workflowId, entityType: run.entityType, entityId: run.entityId } });
    workflowRunId = run.id;
  }

  const [row] = await db.update(formSubmissionsTable).set({
    status: "submitted",
    workflowRunId,
    submittedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(formSubmissionsTable.id, submission.id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_submission.submitted", "form_submission", { resourceId: row.id, newValues: { status: row.status, workflowRunId: row.workflowRunId } });

  // When resubmitting after revision_requested, reset the existing workflow run to pending
  // so the approval chain can continue from the current step.
  if (template.workflowId && submission.workflowRunId && submission.status === "revision_requested") {
    const [existingRun] = await db.select().from(workflowRunsTable).where(and(
      eq(workflowRunsTable.id, submission.workflowRunId),
      eq(workflowRunsTable.organizationId, tenantId(req)),
      eq(workflowRunsTable.status, "revision_requested"),
    ));
    if (existingRun) {
      await db.update(workflowRunsTable).set({
        status: "pending",
        completedAt: null,
        updatedBy: req.vetraUser!.id,
        updatedAt: new Date(),
      }).where(and(
        eq(workflowRunsTable.id, existingRun.id),
        eq(workflowRunsTable.organizationId, tenantId(req)),
      ));
      await db.insert(workflowRunEventsTable).values({
        organizationId: tenantId(req),
        workflowRunId: existingRun.id,
        workflowStepId: existingRun.currentStep,
        action: "submitted",
        actorId: req.vetraUser!.id,
      });
    }
  }

  res.json(serialize(row));
});


router.post("/form-submissions/bulk-approve", requirePermission("workflows.approve"), async (req, res): Promise<void> => {
  const { submissionIds, comment } = req.body as { submissionIds?: number[]; comment?: string };
  if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
    res.status(400).json({ error: "submissionIds must be a non-empty array" });
    return;
  }
  if (submissionIds.length > 50) {
    res.status(400).json({ error: "Cannot bulk approve more than 50 submissions at once" });
    return;
  }

  const results: Array<{ id: number; success: boolean; error?: string }> = [];
  for (const id of submissionIds) {
    const [submission] = await db.select().from(formSubmissionsTable).where(and(
      eq(formSubmissionsTable.id, id),
      eq(formSubmissionsTable.organizationId, tenantId(req)),
      isNull(formSubmissionsTable.deletedAt),
    ));
    if (!submission || !submission.workflowRunId || submission.status !== "submitted") {
      results.push({ id, success: false, error: "Not eligible for approval" });
      continue;
    }
    const [run] = await db.select().from(workflowRunsTable).where(and(
      eq(workflowRunsTable.id, submission.workflowRunId),
      eq(workflowRunsTable.organizationId, tenantId(req)),
    ));
    if (!run || run.status !== "pending") {
      results.push({ id, success: false, error: "Workflow not pending" });
      continue;
    }
    const [step] = await db.select().from(workflowStepsTable).where(and(
      eq(workflowStepsTable.workflowId, run.workflowId),
      eq(workflowStepsTable.stepOrder, run.currentStep),
    ));
    if (!step) {
      results.push({ id, success: false, error: "No current step" });
      continue;
    }
    try {
      const steps = await db.select().from(workflowStepsTable).where(
        eq(workflowStepsTable.workflowId, run.workflowId)
      ).orderBy(asc(workflowStepsTable.stepOrder));
      const isFinal = run.currentStep >= steps.length;
      const [updated] = await db.update(workflowRunsTable).set({
        currentStep: isFinal ? run.currentStep : run.currentStep + 1,
        status: isFinal ? "approved" : "pending",
        completedAt: isFinal ? new Date() : null,
        updatedBy: req.vetraUser!.id,
        updatedAt: new Date(),
      }).where(and(
        eq(workflowRunsTable.id, run.id),
        eq(workflowRunsTable.organizationId, tenantId(req)),
        eq(workflowRunsTable.currentStep, run.currentStep),
        eq(workflowRunsTable.status, "pending"),
      )).returning();
      if (!updated) {
        results.push({ id, success: false, error: "Concurrent modification" });
        continue;
      }
      await db.insert(workflowRunEventsTable).values({
        organizationId: tenantId(req),
        workflowRunId: run.id,
        workflowStepId: step.id,
        action: "approve",
        comment: comment ?? null,
        actorId: req.vetraUser!.id,
      });
      const submissionStatus = isFinal ? "approved" : "submitted";
      await db.update(formSubmissionsTable).set({
        status: submissionStatus,
        updatedAt: new Date(),
      }).where(and(
        eq(formSubmissionsTable.id, submission.id),
        eq(formSubmissionsTable.organizationId, tenantId(req)),
      ));
      audit(req, "form_submission.bulk_approved", "form_submission", {
        resourceId: submission.id,
        newValues: { status: submissionStatus, workflowRunId: run.id },
      });
      results.push({ id, success: true });
    } catch (error) {
      results.push({ id, success: false, error: String(error) });
    }
  }
  res.json({ results });
});

router.delete("/form-submissions/:id", requirePermission("forms.submit"), async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid submission id" }); return; }
  const [submission] = await db.select().from(formSubmissionsTable).where(and(
    eq(formSubmissionsTable.id, id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
    isNull(formSubmissionsTable.deletedAt),
  ));
  if (!submission) { res.status(404).json({ error: "Form submission not found" }); return; }
  if (submission.submittedBy !== req.vetraUser!.id) { res.status(403).json({ error: "Only the submitter may delete this response" }); return; }
  if (!["draft", "revision_requested"].includes(submission.status)) { res.status(409).json({ error: "Submission cannot be deleted in its current state" }); return; }
  const [row] = await db.update(formSubmissionsTable).set({
    deletedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(formSubmissionsTable.id, submission.id),
    eq(formSubmissionsTable.organizationId, tenantId(req)),
  )).returning();
  audit(req, "form_submission.deleted", "form_submission", { resourceId: row.id, oldValues: { status: submission.status } });
  res.status(204).end();
});
export { validateAnswers };
export default router;
