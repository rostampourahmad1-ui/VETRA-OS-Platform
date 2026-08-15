import { Router } from 'express';
import { db, usersTable, organizationsTable, projectsTable, tasksTable, expensesTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const router = Router();
const preferences = new Map<number, Record<string, unknown>>();

router.get('/workspaces', async (_req, res) => {
  const rows = await db.select().from(usersTable);
  const roles = ['CEO', 'Project Manager', 'Site Engineer', 'HR'];
  res.json(roles.map((role) => ({ role, label: role, description: role === 'CEO' ? 'Portfolio and financial overview' : role === 'Project Manager' ? 'Projects, tasks and delivery' : role === 'Site Engineer' ? 'Site activity and daily reports' : 'People, attendance and staffing', available: rows.some((user) => user.role === role) })));
});
router.get('/workspaces/:role', async (req, res) => {
  const role = decodeURIComponent(req.params.role);
  const [projects, tasks, expenses] = await Promise.all([db.select().from(projectsTable), db.select().from(tasksTable), db.select().from(expensesTable)]);
  res.json({ role, metrics: { projects: projects.length, activeProjects: projects.filter((p) => p.status === 'active').length, openTasks: tasks.filter((t) => t.status !== 'done').length, spent: expenses.reduce((sum, item) => sum + Number(item.amount), 0) }, projects: projects.slice(0, 5), recentTasks: tasks.slice(0, 8) });
});

router.get('/settings/profile', async (req, res): Promise<void> => {
  const id = Number(req.query.userId ?? 1);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});
router.patch('/settings/profile', async (req, res): Promise<void> => {
  const id = Number(req.body?.id ?? 1);
  const [user] = await db.update(usersTable).set({ name: req.body.name, phone: req.body.phone, department: req.body.department }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});
router.get('/settings/organization', async (req, res): Promise<void> => {
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, Number(req.query.organizationId ?? 1)));
  if (!org) { res.status(404).json({ error: 'Organization not found' }); return; }
  res.json(org);
});
router.patch('/settings/preferences', async (req, res) => {
  const userId = Number(req.body?.userId ?? 1);
  const value = { ...(preferences.get(userId) ?? {}), ...req.body };
  preferences.set(userId, value);
  res.json(value);
});

router.get('/reports/summary', async (_req, res) => {
  const [projects, tasks, expenses] = await Promise.all([db.select().from(projectsTable), db.select().from(tasksTable), db.select().from(expensesTable)]);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const budget = projects.reduce((sum, item) => sum + Number(item.budget), 0);
  res.json({ generatedAt: new Date().toISOString(), projects: { total: projects.length, active: projects.filter((p) => p.status === 'active').length, completed: projects.filter((p) => p.status === 'completed').length }, tasks: { total: tasks.length, completed: tasks.filter((t) => t.status === 'done').length, open: tasks.filter((t) => t.status !== 'done').length }, costs: { budget, spent, variance: budget - spent, utilization: budget ? Math.round((spent / budget) * 100) : 0 } });
});
export default router;
