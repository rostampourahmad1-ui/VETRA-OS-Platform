import { requireAuth } from '../middlewares/requireAuth';
import { requirePermission } from '../middlewares/permissions';
import { tenantId } from '../middlewares/tenant';
import { Router } from 'express';
import { db, clientsTable } from '@workspace/db';
import { and, eq, ilike, or } from 'drizzle-orm';

const router = Router();
router.use(requireAuth);
router.get('/crm/clients', requirePermission("crm.read"), async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const rows = search
    ? await db.select().from(clientsTable).where(and(eq(clientsTable.organizationId, tenantId(req)), or(ilike(clientsTable.name, `%${search}%`), ilike(clientsTable.company, `%${search}%`), ilike(clientsTable.email, `%${search}%`))))
    : await db.select().from(clientsTable).where(eq(clientsTable.organizationId, tenantId(req)));
  res.json(rows);
});
router.get('/crm/clients/:id', requirePermission("crm.read"), async (req, res): Promise<void> => {
  const [row] = await db.select().from(clientsTable).where(and(eq(clientsTable.id, Number(req.params.id)), eq(clientsTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: 'Client not found' }); return; }
  res.json(row);
});
router.post('/crm/clients', requirePermission("crm.create"), async (req, res): Promise<void> => {
  const { name, company, email, phone, type = 'client', status = 'active', notes } = req.body ?? {};
  const organizationId = tenantId(req);
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const [row] = await db.insert(clientsTable).values({ organizationId, name, company, email, phone, type, status, notes }).returning();
  res.status(201).json(row);
});
router.patch('/crm/clients/:id', requirePermission("crm.update"), async (req, res): Promise<void> => {
  const [row] = await db.update(clientsTable).set(req.body).where(and(eq(clientsTable.id, Number(req.params.id)), eq(clientsTable.organizationId, tenantId(req)))).returning();
  if (!row) { res.status(404).json({ error: 'Client not found' }); return; }
  res.json(row);
});
export default router;
