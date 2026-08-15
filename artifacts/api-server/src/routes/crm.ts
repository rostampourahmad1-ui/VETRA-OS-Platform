import { Router } from 'express';
import { db, clientsTable } from '@workspace/db';
import { eq, ilike, or } from 'drizzle-orm';

const router = Router();
router.get('/crm/clients', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const rows = search
    ? await db.select().from(clientsTable).where(or(ilike(clientsTable.name, `%${search}%`), ilike(clientsTable.company, `%${search}%`), ilike(clientsTable.email, `%${search}%`)))
    : await db.select().from(clientsTable);
  res.json(rows);
});
router.get('/crm/clients/:id', async (req, res): Promise<void> => {
  const [row] = await db.select().from(clientsTable).where(eq(clientsTable.id, Number(req.params.id)));
  if (!row) { res.status(404).json({ error: 'Client not found' }); return; }
  res.json(row);
});
router.post('/crm/clients', async (req, res): Promise<void> => {
  const { organizationId = 1, name, company, email, phone, type = 'client', status = 'active', notes } = req.body ?? {};
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const [row] = await db.insert(clientsTable).values({ organizationId, name, company, email, phone, type, status, notes }).returning();
  res.status(201).json(row);
});
router.patch('/crm/clients/:id', async (req, res): Promise<void> => {
  const [row] = await db.update(clientsTable).set(req.body).where(eq(clientsTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: 'Client not found' }); return; }
  res.json(row);
});
export default router;
