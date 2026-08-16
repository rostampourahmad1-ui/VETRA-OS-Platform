import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  inspectionsTable,
  nonConformanceReportsTable,
  projectsTable,
} from "@workspace/db";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";

const router = Router();

const inspectionInput = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1),
  type: z.string().trim().min(1),
  status: z.string().trim().min(1),
  inspector: z.string().trim().min(1),
  date: z.string().trim().min(1),
  findings: z.string().optional().nullable(),
});

const ncrInput = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1),
  severity: z.string().trim().min(1),
  status: z.string().trim().min(1),
  description: z.string().trim().min(1),
  correctiveAction: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const idFrom = (value: unknown) => {
  if (typeof value !== "string") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function projectBelongsToTenant(projectId: number, organizationId: number) {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, organizationId)));
  return Boolean(project);
}

router.get("/inspections", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const organizationId = tenantId(req);
  const filters = [eq(inspectionsTable.organizationId, organizationId)];
  if (typeof req.query.status === "string" && req.query.status) filters.push(eq(inspectionsTable.status, req.query.status));
  if (typeof req.query.projectId === "string" && idFrom(req.query.projectId)) filters.push(eq(inspectionsTable.projectId, Number(req.query.projectId)));
  const rows = await db.select().from(inspectionsTable).where(and(...filters));
  res.json(rows);
});

router.post("/inspections", requirePermission("quality.create"), async (req, res): Promise<void> => {
  const parsed = inspectionInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const organizationId = tenantId(req);
  if (!(await projectBelongsToTenant(parsed.data.projectId, organizationId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(inspectionsTable).values({ ...parsed.data, organizationId }).returning();
  res.status(201).json(row);
});

router.get("/inspections/:id", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  const [row] = await db.select().from(inspectionsTable).where(and(eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/inspections/:id", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  const parsed = inspectionInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.projectId && !(await projectBelongsToTenant(parsed.data.projectId, tenantId(req)))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.update(inspectionsTable).set(parsed.data).where(and(eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, tenantId(req)))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/inspections/:id", requirePermission("quality.delete"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid inspection id" }); return; }
  const result = await db.delete(inspectionsTable).where(and(eq(inspectionsTable.id, id), eq(inspectionsTable.organizationId, tenantId(req))));
  if (!result.rowCount) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

router.get("/non-conformance-reports", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const organizationId = tenantId(req);
  const filters = [eq(nonConformanceReportsTable.organizationId, organizationId)];
  if (typeof req.query.status === "string" && req.query.status) filters.push(eq(nonConformanceReportsTable.status, req.query.status));
  if (typeof req.query.projectId === "string" && idFrom(req.query.projectId)) filters.push(eq(nonConformanceReportsTable.projectId, Number(req.query.projectId)));
  const rows = await db.select().from(nonConformanceReportsTable).where(and(...filters));
  res.json(rows);
});

router.post("/non-conformance-reports", requirePermission("quality.create"), async (req, res): Promise<void> => {
  const parsed = ncrInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const organizationId = tenantId(req);
  if (!(await projectBelongsToTenant(parsed.data.projectId, organizationId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(nonConformanceReportsTable).values({ ...parsed.data, organizationId }).returning();
  res.status(201).json(row);
});

router.get("/non-conformance-reports/:id", requirePermission("quality.read"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  const [row] = await db.select().from(nonConformanceReportsTable).where(and(eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/non-conformance-reports/:id", requirePermission("quality.update"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  const parsed = ncrInput.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.projectId && !(await projectBelongsToTenant(parsed.data.projectId, tenantId(req)))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.update(nonConformanceReportsTable).set(parsed.data).where(and(eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, tenantId(req)))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/non-conformance-reports/:id", requirePermission("quality.delete"), async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid NCR id" }); return; }
  const result = await db.delete(nonConformanceReportsTable).where(and(eq(nonConformanceReportsTable.id, id), eq(nonConformanceReportsTable.organizationId, tenantId(req))));
  if (!result.rowCount) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
});

export default router;
