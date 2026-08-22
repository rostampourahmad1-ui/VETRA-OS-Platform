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
    if (field.required && (missing || (field.type === "checkbox" && value !== true))) {
      return `Required field is missing: ${field.label}`;
    }
    if (missing) continue;

    if (field.type === "text" && typeof value !== "string") return `Invalid text value for: ${field.label}`;
    if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return `Invalid number value for: ${field.label}`;
    if (field.type === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) return `Invalid date value for: ${field.label}`;
    if (field.type === "checkbox" && typeof value !== "boolean") return `Invalid checkbox value for: ${field.label}`;
    if (field.type === "select" && (typeof value !== "string" || !field.options?.includes(value))) return `Invalid selection for: ${field.label}`;
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
  res.json(serialize(row));
});

export { validateAnswers };
export default router;
