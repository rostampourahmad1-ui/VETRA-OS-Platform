import { Router } from "express";
import { db, projectsTable, usersTable, tasksTable, documentsTable, contractsTable, meetingsTable, dailyReportsTable, equipmentTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";

const router = Router();

router.get("/projects", async (req, res): Promise<void> => {
  const { status, search } = req.query as { status?: string; search?: string };

  let rows = await db.select().from(projectsTable);

  if (status) rows = rows.filter(p => p.status === status);
  if (search) rows = rows.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const userRows = await db.select().from(usersTable);
  const userMap = new Map(userRows.map(u => [u.id, u]));

  const result = rows.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    status: p.status,
    progress: parseFloat(p.progress as string),
    budget: parseFloat(p.budget as string),
    spent: parseFloat(p.spent as string),
    client: p.client,
    location: p.location,
    startDate: p.startDate,
    endDate: p.endDate,
    managerId: p.managerId,
    managerName: userMap.get(p.managerId)?.name ?? "Unknown",
    organizationId: p.organizationId,
    priority: p.priority,
    phase: p.phase ?? null,
    createdAt: p.createdAt.toISOString(),
  }));

  res.json(result);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [row] = await db.insert(projectsTable).values({
    name: d.name,
    description: d.description,
    client: d.client,
    location: d.location,
    startDate: d.startDate,
    endDate: d.endDate,
    budget: d.budget?.toString() ?? "0",
    managerId: d.managerId,
    organizationId: d.organizationId,
    priority: d.priority ?? "medium",
    phase: d.phase,
    status: d.status ?? "planning",
  }).returning();

  const manager = await db.select().from(usersTable).where(eq(usersTable.id, row.managerId));

  res.status(201).json({
    ...row,
    progress: parseFloat(row.progress as string),
    budget: parseFloat(row.budget as string),
    spent: parseFloat(row.spent as string),
    managerName: manager[0]?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const managers = await db.select().from(usersTable).where(eq(usersTable.id, row.managerId));

  res.json({
    ...row,
    progress: parseFloat(row.progress as string),
    budget: parseFloat(row.budget as string),
    spent: parseFloat(row.spent as string),
    managerName: managers[0]?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.description !== undefined) updates.description = d.description;
  if (d.status !== undefined) updates.status = d.status;
  if (d.progress !== undefined) updates.progress = d.progress.toString();
  if (d.budget !== undefined) updates.budget = d.budget.toString();
  if (d.spent !== undefined) updates.spent = d.spent.toString();
  if (d.client !== undefined) updates.client = d.client;
  if (d.location !== undefined) updates.location = d.location;
  if (d.startDate !== undefined) updates.startDate = d.startDate;
  if (d.endDate !== undefined) updates.endDate = d.endDate;
  if (d.managerId !== undefined) updates.managerId = d.managerId;
  if (d.priority !== undefined) updates.priority = d.priority;
  if (d.phase !== undefined) updates.phase = d.phase;

  const [row] = await db.update(projectsTable).set(updates).where(eq(projectsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const managers = await db.select().from(usersTable).where(eq(usersTable.id, row.managerId));

  res.json({
    ...row,
    progress: parseFloat(row.progress as string),
    budget: parseFloat(row.budget as string),
    spent: parseFloat(row.spent as string),
    managerName: managers[0]?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.status(204).send();
});

router.get("/projects/:id/stats", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  const [tasks, docs, contracts, meetings, reports, equip] = await Promise.all([
    db.select().from(tasksTable).where(eq(tasksTable.projectId, id)),
    db.select().from(documentsTable).where(eq(documentsTable.projectId, id)),
    db.select().from(contractsTable).where(eq(contractsTable.projectId, id)),
    db.select().from(meetingsTable).where(eq(meetingsTable.projectId, id)),
    db.select().from(dailyReportsTable).where(eq(dailyReportsTable.projectId, id)),
    db.select().from(equipmentTable).where(eq(equipmentTable.projectId, id)),
  ]);

  res.json({
    taskCount: tasks.length,
    completedTasks: tasks.filter(t => t.status === "done").length,
    openTasks: tasks.filter(t => t.status !== "done").length,
    documentCount: docs.length,
    contractCount: contracts.length,
    meetingCount: meetings.length,
    reportCount: reports.length,
    equipmentCount: equip.length,
  });
});

export default router;
