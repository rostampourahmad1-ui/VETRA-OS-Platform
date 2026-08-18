import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, tasksTable, projectsTable, usersTable } from "@workspace/db";
import { CreateTaskBody, UpdateTaskBody } from "@workspace/api-zod";
import { requirePermission } from "../middlewares/permissions";
import { tenantId } from "../middlewares/tenant";

const router = Router();
function formatTask(t: typeof tasksTable.$inferSelect, projectName: string, assigneeName: string | null) {
  return { id: t.id, title: t.title, description: t.description ?? null, status: t.status, priority: t.priority, projectId: t.projectId, projectName, assigneeId: t.assigneeId ?? null, assigneeName, dueDate: t.dueDate ?? null, createdAt: t.createdAt.toISOString() };
}
async function projectIdsForTenant(orgId: number): Promise<number[]> {
  return (await db.select({ id: projectsTable.id }).from(projectsTable).where(eq(projectsTable.organizationId, orgId))).map((p) => p.id);
}

router.get("/tasks", requirePermission("tasks.read"), async (req, res): Promise<void> => {
  const orgProjects = await projectIdsForTenant(tenantId(req));
  const { projectId, status, assigneeId } = req.query as { projectId?: string; status?: string; assigneeId?: string };
  let rows = await db.select().from(tasksTable).where(eq(tasksTable.organizationId, tenantId(req)));
  rows = rows.filter((t) => orgProjects.includes(t.projectId));
  if (projectId) rows = rows.filter((t) => t.projectId === Number(projectId));
  if (status) rows = rows.filter((t) => t.status === status);
  if (assigneeId) rows = rows.filter((t) => t.assigneeId === Number(assigneeId));
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, tenantId(req)));
  const users = await db.select().from(usersTable).where(eq(usersTable.organizationId, tenantId(req)));
  const projMap = new Map(projects.map((p) => [p.id, p.name])); const userMap = new Map(users.map((u) => [u.id, u.name]));
  res.json(rows.map((t) => formatTask(t, projMap.get(t.projectId) ?? "Unknown", t.assigneeId ? userMap.get(t.assigneeId) ?? null : null)));
});

router.post("/tasks", requirePermission("tasks.create"), async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data; const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, d.projectId), eq(projectsTable.organizationId, tenantId(req))));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (d.assigneeId !== undefined) {
    const [assignee] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, d.assigneeId), eq(usersTable.organizationId, tenantId(req))));
    if (!assignee) { res.status(400).json({ error: "Assignee must belong to the current organization" }); return; }
  }
  const [row] = await db.insert(tasksTable).values({ title: d.title, description: d.description, status: d.status ?? "todo", priority: d.priority ?? "medium", projectId: d.projectId, organizationId: tenantId(req), assigneeId: d.assigneeId, dueDate: d.dueDate }).returning();
  const [assignee] = row.assigneeId ? await db.select().from(usersTable).where(and(eq(usersTable.id, row.assigneeId), eq(usersTable.organizationId, tenantId(req)))) : [];
  res.status(201).json(formatTask(row, project.name, assignee?.name ?? null));
});

router.get("/tasks/summary", requirePermission("tasks.read"), async (req, res): Promise<void> => {
  const ids = await projectIdsForTenant(tenantId(req)); const tasks = (await db.select().from(tasksTable).where(eq(tasksTable.organizationId, tenantId(req)))).filter((t) => ids.includes(t.projectId)); const today = new Date().toISOString().split("T")[0];
  res.json({ total: tasks.length, todo: tasks.filter((t) => t.status === "todo").length, inProgress: tasks.filter((t) => t.status === "in-progress").length, review: tasks.filter((t) => t.status === "review").length, done: tasks.filter((t) => t.status === "done").length, overdue: tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < today).length });
});

router.get("/tasks/:id", requirePermission("tasks.read"), async (req, res): Promise<void> => {
  const [row] = await db.select().from(tasksTable).innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id)).where(and(eq(tasksTable.id, Number(req.params.id)), eq(tasksTable.organizationId, tenantId(req)), eq(projectsTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const task = row.tasks; const [assignee] = task.assigneeId ? await db.select().from(usersTable).where(and(eq(usersTable.id, task.assigneeId), eq(usersTable.organizationId, tenantId(req)))) : [];
  res.json(formatTask(task, row.projects.name, assignee?.name ?? null));
});

router.patch("/tasks/:id", requirePermission("tasks.update"), async (req, res): Promise<void> => {
  const parsed = UpdateTaskBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data; const updates: Record<string, unknown> = {}; for (const key of ["title", "description", "status", "priority", "assigneeId", "dueDate"] as const) if (d[key] !== undefined) updates[key] = d[key];
  const owned = await db.select({ id: tasksTable.id }).from(tasksTable).innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id)).where(and(eq(tasksTable.id, Number(req.params.id)), eq(tasksTable.organizationId, tenantId(req)), eq(projectsTable.organizationId, tenantId(req))));
  if (!owned.length) { res.status(404).json({ error: "Not found" }); return; }
  if (d.assigneeId !== undefined) {
    const [assignee] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, d.assigneeId), eq(usersTable.organizationId, tenantId(req))));
    if (!assignee) { res.status(400).json({ error: "Assignee must belong to the current organization" }); return; }
  }
  const [task] = await db.update(tasksTable).set(updates).where(and(eq(tasksTable.id, Number(req.params.id)), eq(tasksTable.organizationId, tenantId(req)))).returning();
  const [project] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, task.projectId), eq(projectsTable.organizationId, tenantId(req)))); const [assignee] = task.assigneeId ? await db.select().from(usersTable).where(and(eq(usersTable.id, task.assigneeId), eq(usersTable.organizationId, tenantId(req)))) : [];
  res.json(formatTask(task, project?.name ?? "Unknown", assignee?.name ?? null));
});

router.delete("/tasks/:id", requirePermission("tasks.delete"), async (req, res): Promise<void> => {
  const owned = await db.select({ id: tasksTable.id }).from(tasksTable).innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id)).where(and(eq(tasksTable.id, Number(req.params.id)), eq(tasksTable.organizationId, tenantId(req)), eq(projectsTable.organizationId, tenantId(req))));
  if (!owned.length) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(tasksTable).where(eq(tasksTable.id, Number(req.params.id))); res.status(204).send();
});
export default router;
