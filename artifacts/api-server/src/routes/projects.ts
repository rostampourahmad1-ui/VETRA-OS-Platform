import { Router } from "express";
import { and, eq, ilike } from "drizzle-orm";
import { db, projectsTable, usersTable, tasksTable, documentsTable, contractsTable, meetingsTable, dailyReportsTable, equipmentTable } from "@workspace/db";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { tenantId } from "../middlewares/tenant";

const router = Router();
const serialize = (row: any, managerName = "Unknown") => ({
  ...row,
  progress: Number(row.progress ?? 0), budget: Number(row.budget ?? 0), spent: Number(row.spent ?? 0),
  managerName, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
});

router.get("/projects", requirePermission("projects.read"), async (req, res): Promise<void> => {
  const { status, search } = req.query as { status?: string; search?: string };
  const filters = [eq(projectsTable.organizationId, tenantId(req))];
  if (status) filters.push(eq(projectsTable.status, status));
  if (search) filters.push(ilike(projectsTable.name, `%${search}%`));
  const rows = await db.select().from(projectsTable).where(and(...filters));
  const userRows = await db.select().from(usersTable).where(eq(usersTable.organizationId, tenantId(req)));
  const userMap = new Map(userRows.map((u) => [u.id, u.name]));
  res.json(rows.map((row) => serialize(row, userMap.get(row.managerId) ?? "Unknown")));
});

router.post("/projects", requirePermission("projects.create"), async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [row] = await db.insert(projectsTable).values({
    name: d.name, description: d.description, client: d.client, location: d.location,
    startDate: d.startDate, endDate: d.endDate, budget: d.budget?.toString() ?? "0",
    managerId: d.managerId, organizationId: tenantId(req), priority: d.priority ?? "medium",
    phase: d.phase, status: d.status ?? "planning",
  }).returning();
  const [manager] = await db.select().from(usersTable).where(and(eq(usersTable.id, row.managerId), eq(usersTable.organizationId, tenantId(req))));
  audit(req, "project.created", "project", { resourceId: row.id, newValues: { name: row.name, status: row.status, phase: row.phase } });
  res.status(201).json(serialize(row, manager?.name));
});

router.get("/projects/:id", requirePermission("projects.read"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [manager] = await db.select().from(usersTable).where(and(eq(usersTable.id, row.managerId), eq(usersTable.organizationId, tenantId(req))));
  res.json(serialize(row, manager?.name));
});

router.patch("/projects/:id", requirePermission("projects.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  for (const key of ["name", "description", "status", "client", "location", "startDate", "endDate", "managerId", "priority", "phase"] as const) if (d[key] !== undefined) updates[key] = d[key];
  for (const key of ["progress", "budget", "spent"] as const) if (d[key] !== undefined) updates[key] = d[key]!.toString();
  // VETRA-SEC-06: Capture old values for audit before update
  const [old] = await db.select({ name: projectsTable.name, status: projectsTable.status, phase: projectsTable.phase, budget: projectsTable.budget })
    .from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.organizationId, tenantId(req))));
  if (!old) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const oldValues = { name: old.name, status: old.status, phase: old.phase, budget: old.budget };
  const [row] = await db.update(projectsTable).set(updates).where(and(eq(projectsTable.id, id), eq(projectsTable.organizationId, tenantId(req)))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serialize(row));
  audit(req, "project.updated", "project", { resourceId: row.id, oldValues, newValues: { name: row.name, status: row.status, phase: row.phase, budget: row.budget } });
});

router.delete("/projects/:id", requirePermission("projects.delete"), async (req, res): Promise<void> => {
  const result = await db.delete(projectsTable).where(and(eq(projectsTable.id, Number(req.params.id)), eq(projectsTable.organizationId, tenantId(req))));
  if (!result.rowCount) { res.status(404).json({ error: "Not found" }); return; }
  res.status(204).send();
  audit(req, "project.deleted", "project", { resourceId: Number(req.params.id) });
});

router.get("/projects/:id/stats", requirePermission("projects.read"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [project] = await db.select({ id: projectsTable.id }).from(projectsTable).where(and(eq(projectsTable.id, id), eq(projectsTable.organizationId, tenantId(req))));
  if (!project) { res.status(404).json({ error: "Not found" }); return; }
  const [tasks, docs, contracts, meetings, reports, equip] = await Promise.all([
    db.select().from(tasksTable).where(eq(tasksTable.projectId, id)), db.select().from(documentsTable).where(and(eq(documentsTable.projectId, id), eq(documentsTable.organizationId, tenantId(req)))),
    db.select().from(contractsTable).where(eq(contractsTable.projectId, id)), db.select().from(meetingsTable).where(eq(meetingsTable.projectId, id)),
    db.select().from(dailyReportsTable).where(eq(dailyReportsTable.projectId, id)), db.select().from(equipmentTable).where(eq(equipmentTable.projectId, id)),
  ]);
  res.json({ taskCount: tasks.length, completedTasks: tasks.filter((t) => t.status === "done").length, openTasks: tasks.filter((t) => t.status !== "done").length, documentCount: docs.length, contractCount: contracts.length, meetingCount: meetings.length, reportCount: reports.length, equipmentCount: equip.length });
});

export default router;
