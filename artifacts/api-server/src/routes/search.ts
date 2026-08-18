import { requireAuth } from '../middlewares/requireAuth';
import { requirePermission } from '../middlewares/permissions';
import { Router } from 'express';
import { db, projectsTable, tasksTable, documentsTable, contractsTable, clientsTable } from '@workspace/db';
import { and, eq, ilike } from 'drizzle-orm';
import { tenantId } from '../middlewares/tenant';

const router = Router();
router.use(requireAuth);
router.get('/search', requirePermission("search.read"), async (req, res): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) { res.json([]); return; }
  const pattern = `%${q}%`;
  const organizationId = tenantId(req);
  const [projects, tasks, documents, contracts, clients] = await Promise.all([
    db.select({ id: projectsTable.id, title: projectsTable.name }).from(projectsTable).where(and(eq(projectsTable.organizationId, organizationId), ilike(projectsTable.name, pattern))),
    db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(and(eq(tasksTable.organizationId, organizationId), ilike(tasksTable.title, pattern))),
    db.select({ id: documentsTable.id, title: documentsTable.name }).from(documentsTable).where(and(eq(documentsTable.organizationId, organizationId), ilike(documentsTable.name, pattern))),
    db.select({ id: contractsTable.id, title: contractsTable.name }).from(contractsTable).where(and(eq(contractsTable.organizationId, organizationId), ilike(contractsTable.name, pattern))),
    db.select({ id: clientsTable.id, title: clientsTable.name }).from(clientsTable).where(and(eq(clientsTable.organizationId, organizationId), ilike(clientsTable.name, pattern))),
  ]);
  res.json([
    ...projects.map((item) => ({ ...item, type: 'project', href: `/projects/${item.id}` })),
    ...tasks.map((item) => ({ ...item, type: 'task', href: '/tasks' })),
    ...documents.map((item) => ({ ...item, type: 'document', href: '/documents' })),
    ...contracts.map((item) => ({ ...item, type: 'contract', href: '/contracts' })),
    ...clients.map((item) => ({ ...item, type: 'client', href: '/crm' })),
  ]);
});
export default router;
