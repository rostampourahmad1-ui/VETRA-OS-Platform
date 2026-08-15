import { Router } from 'express';
import { db, projectsTable, tasksTable, documentsTable, contractsTable, clientsTable } from '@workspace/db';
import { ilike } from 'drizzle-orm';

const router = Router();
router.get('/search', async (req, res): Promise<void> => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) { res.json([]); return; }
  const pattern = `%${q}%`;
  const [projects, tasks, documents, contracts, clients] = await Promise.all([
    db.select({ id: projectsTable.id, title: projectsTable.name }).from(projectsTable).where(ilike(projectsTable.name, pattern)),
    db.select({ id: tasksTable.id, title: tasksTable.title }).from(tasksTable).where(ilike(tasksTable.title, pattern)),
    db.select({ id: documentsTable.id, title: documentsTable.name }).from(documentsTable).where(ilike(documentsTable.name, pattern)),
    db.select({ id: contractsTable.id, title: contractsTable.name }).from(contractsTable).where(ilike(contractsTable.name, pattern)),
    db.select({ id: clientsTable.id, title: clientsTable.name }).from(clientsTable).where(ilike(clientsTable.name, pattern)),
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
