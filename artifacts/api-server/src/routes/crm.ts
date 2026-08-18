import { requireAuth } from '../middlewares/requireAuth';
import { requirePermission } from '../middlewares/permissions';
import { tenantId } from '../middlewares/tenant';
import { Router } from 'express';
import { db, clientsTable } from '@workspace/db';
import { and, eq, ilike, or } from 'drizzle-orm';
import { UpdateClientBody } from '@workspace/api-zod';
import { logger } from '../lib/logger';

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
  const id = Number(req.params.id);
  const orgId = tenantId(req);
  const parsed = UpdateClientBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ userId: req.vetraUser?.id, orgId, clientId: id, issues: parsed.error.flatten() }, 'CRM PATCH validation failed');
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    return;
  }
  const allowed = parsed.data;
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allowed as Record<string, unknown>)) {
    if (value !== undefined) updates[key] = value;
  }
  const [row] = await db.update(clientsTable).set(updates).where(and(eq(clientsTable.id, id), eq(clientsTable.organizationId, orgId))).returning();
  if (!row) {
    logger.warn({ userId: req.vetraUser?.id, orgId, clientId: id }, 'CRM PATCH target not found (404)');
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  logger.info({ userId: req.vetraUser?.id, orgId, clientId: id, updatedFields: Object.keys(updates) }, 'CRM client updated');
  res.json(row);
});
export default router;
