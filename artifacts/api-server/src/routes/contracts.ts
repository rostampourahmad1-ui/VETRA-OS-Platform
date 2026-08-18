import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, contractsTable, projectsTable } from "@workspace/db";
import { CreateContractBody, UpdateContractBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);
const serialize = (row: any, projectName: string | null) => ({ ...row, value: Number(row.value), projectName, createdAt: row.createdAt.toISOString() });

router.get("/contracts", requirePermission("contracts.read"), async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, tenantId(req)));
  let rows = await db.select().from(contractsTable).where(eq(contractsTable.organizationId, tenantId(req)));
  if (projectId) rows = rows.filter((c) => c.projectId === Number(projectId));
  if (status) rows = rows.filter((c) => c.status === status);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  res.json(rows.map((row) => serialize(row, names.get(row.projectId) ?? null)));
});

router.post("/contracts", requirePermission("contracts.create"), async (req, res): Promise<void> => {
  const parsed = CreateContractBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  if (!(await ownedProject(req, d.projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(contractsTable).values({ name: d.name, contractor: d.contractor, value: d.value.toString(), status: d.status ?? "draft", type: d.type, projectId: d.projectId, organizationId: tenantId(req), startDate: d.startDate, endDate: d.endDate, signedDate: d.signedDate }).returning();
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, tenantId(req))));
  res.status(201).json(serialize(row, project?.name ?? null));
});

router.get("/contracts/:id", requirePermission("contracts.read"), async (req, res): Promise<void> => {
  const [row] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, Number(req.params.id)), eq(contractsTable.organizationId, tenantId(req))));
  if (!row || !(await ownedProject(req, row.projectId))) { res.status(404).json({ error: "Not found" }); return; }
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, tenantId(req))));
  res.json(serialize(row, project?.name ?? null));
});

router.patch("/contracts/:id", requirePermission("contracts.update"), async (req, res): Promise<void> => {
  const parsed = UpdateContractBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [current] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, Number(req.params.id)), eq(contractsTable.organizationId, tenantId(req))));
  if (!current || !(await ownedProject(req, current.projectId))) { res.status(404).json({ error: "Not found" }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "contractor", "status", "type", "startDate", "endDate", "signedDate"] as const) if (d[key] !== undefined) updates[key] = d[key];
  if (d.value !== undefined) updates.value = d.value.toString();
  const [row] = await db.update(contractsTable).set(updates).where(and(eq(contractsTable.id, current.id), eq(contractsTable.organizationId, tenantId(req)))).returning();
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, row.projectId), eq(projectsTable.organizationId, tenantId(req))));
  res.json(serialize(row, project?.name ?? null));
});

export default router;
