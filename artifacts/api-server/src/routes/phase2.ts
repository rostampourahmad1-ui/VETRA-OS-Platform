import { requireAuth } from '../middlewares/requireAuth';
import { requirePermission } from '../middlewares/permissions';
import { tenantId } from '../middlewares/tenant';
import { Router } from 'express';
import { db, usersTable, organizationsTable, projectsTable, tasksTable, expensesTable } from '@workspace/db';
import { and, eq } from 'drizzle-orm';

const router = Router();
router.use(requireAuth);
const preferences = new Map<number, Record<string, unknown>>();

router.get('/workspaces', requirePermission("phase2.read"), async (_req, res) => {
  const rows = await db.select().from(usersTable).where(eq(usersTable.organizationId, tenantId(_req)));
  const roles = ['CEO', 'Project Manager', 'Site Engineer', 'HR'];
  res.json(roles.map((role) => ({ role, label: role, description: role === 'CEO' ? 'Portfolio and financial overview' : role === 'Project Manager' ? 'Projects, tasks and delivery' : role === 'Site Engineer' ? 'Site activity and daily reports' : 'People, attendance and staffing', available: rows.some((user) => user.role === role) })));
});
router.get('/workspaces/:role', requirePermission("phase2.read"), async (req, res) => {
  const rawRole = Array.isArray(req.params.role) ? req.params.role[0] : req.params.role;
  const role = decodeURIComponent(rawRole);
  const organizationId = tenantId(req);
  const [projects, tasks, expenses] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId)),
    db.select().from(tasksTable).where(eq(tasksTable.organizationId, organizationId)),
    db.select().from(expensesTable).where(eq(expensesTable.organizationId, organizationId)),
  ]);
  res.json({ role, metrics: { projects: projects.length, activeProjects: projects.filter((p) => p.status === 'active').length, openTasks: tasks.filter((t) => t.status !== 'done').length, spent: expenses.reduce((sum, item) => sum + Number(item.amount), 0) }, projects: projects.slice(0, 5), recentTasks: tasks.slice(0, 8) });
});

router.get('/settings/profile', requirePermission("phase2.read"), async (req, res): Promise<void> => {
  const id = req.vetraUser?.id;
  if (!id) { res.status(401).json({ error: 'Authenticated user is missing' }); return; }
  const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.organizationId, tenantId(req))));
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});
router.patch('/settings/profile', requirePermission("phase2.update"), async (req, res): Promise<void> => {
  const id = req.vetraUser?.id;
  if (!id) { res.status(401).json({ error: 'Authenticated user is missing' }); return; }
  const [user] = await db.update(usersTable).set({ name: req.body.name, phone: req.body.phone, department: req.body.department }).where(and(eq(usersTable.id, id), eq(usersTable.organizationId, tenantId(req)))).returning();
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});
router.get('/settings/organization', requirePermission("phase2.read"), async (req, res): Promise<void> => {
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tenantId(req)));
  if (!org) { res.status(404).json({ error: 'Organization not found' }); return; }
  res.json(org);
});
router.patch('/settings/preferences', requirePermission("phase2.update"), async (req, res) => {
  const userId = req.vetraUser?.id ?? 0;
  const value = { ...(preferences.get(userId) ?? {}), ...req.body };
  preferences.set(userId, value);
  res.json(value);
});

router.get('/reports/summary', requirePermission("phase2.read"), async (_req, res) => {
  const organizationId = tenantId(_req);
  const [projects, tasks, expenses] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId)),
    db.select().from(tasksTable).where(eq(tasksTable.organizationId, organizationId)),
    db.select().from(expensesTable).where(eq(expensesTable.organizationId, organizationId)),
  ]);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const budget = projects.reduce((sum, item) => sum + Number(item.budget), 0);
  res.json({ generatedAt: new Date().toISOString(), projects: { total: projects.length, active: projects.filter((p) => p.status === 'active').length, completed: projects.filter((p) => p.status === 'completed').length }, tasks: { total: tasks.length, completed: tasks.filter((t) => t.status === 'done').length, open: tasks.filter((t) => t.status !== 'done').length }, costs: { budget, spent, variance: budget - spent, utilization: budget ? Math.round((spent / budget) * 100) : 0 } });
});
export default router;
