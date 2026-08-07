import { Router } from "express";
import { db, tasksTable, projectsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateTaskBody, UpdateTaskBody } from "@workspace/api-zod";

const router = Router();

function formatTask(t: typeof tasksTable.$inferSelect, projectName: string, assigneeName: string | null) {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    projectId: t.projectId,
    projectName,
    assigneeId: t.assigneeId ?? null,
    assigneeName: assigneeName ?? null,
    dueDate: t.dueDate ?? null,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/tasks", async (req, res): Promise<void> => {
  const { projectId, status, assigneeId } = req.query as {
    projectId?: string; status?: string; assigneeId?: string;
  };

  let rows = await db.select().from(tasksTable);
  if (projectId) rows = rows.filter(t => t.projectId === parseInt(projectId, 10));
  if (status) rows = rows.filter(t => t.status === status);
  if (assigneeId) rows = rows.filter(t => t.assigneeId === parseInt(assigneeId, 10));

  const projects = await db.select().from(projectsTable);
  const users = await db.select().from(usersTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));
  const userMap = new Map(users.map(u => [u.id, u.name]));

  res.json(rows.map(t => formatTask(t, projMap.get(t.projectId) ?? "Unknown", t.assigneeId ? (userMap.get(t.assigneeId) ?? null) : null)));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(tasksTable).values({
    title: d.title,
    description: d.description,
    status: d.status ?? "todo",
    priority: d.priority ?? "medium",
    projectId: d.projectId,
    assigneeId: d.assigneeId,
    dueDate: d.dueDate,
  }).returning();

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));
  const assignee = row.assigneeId ? await db.select().from(usersTable).where(eq(usersTable.id, row.assigneeId)) : [];

  res.status(201).json(formatTask(row, proj?.name ?? "Unknown", assignee[0]?.name ?? null));
});

router.get("/tasks/summary", async (req, res): Promise<void> => {
  const tasks = await db.select().from(tasksTable);
  const today = new Date().toISOString().split("T")[0];
  res.json({
    total: tasks.length,
    todo: tasks.filter(t => t.status === "todo").length,
    inProgress: tasks.filter(t => t.status === "in-progress").length,
    review: tasks.filter(t => t.status === "review").length,
    done: tasks.filter(t => t.status === "done").length,
    overdue: tasks.filter(t => t.status !== "done" && t.dueDate && t.dueDate < today).length,
  });
});

router.get("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));
  const assignee = row.assigneeId ? await db.select().from(usersTable).where(eq(usersTable.id, row.assigneeId)) : [];

  res.json(formatTask(row, proj?.name ?? "Unknown", assignee[0]?.name ?? null));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.title !== undefined) updates.title = d.title;
  if (d.description !== undefined) updates.description = d.description;
  if (d.status !== undefined) updates.status = d.status;
  if (d.priority !== undefined) updates.priority = d.priority;
  if (d.assigneeId !== undefined) updates.assigneeId = d.assigneeId;
  if (d.dueDate !== undefined) updates.dueDate = d.dueDate;

  const [row] = await db.update(tasksTable).set(updates).where(eq(tasksTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));
  const assignee = row.assigneeId ? await db.select().from(usersTable).where(eq(usersTable.id, row.assigneeId)) : [];

  res.json(formatTask(row, proj?.name ?? "Unknown", assignee[0]?.name ?? null));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  res.status(204).send();
});

export default router;
