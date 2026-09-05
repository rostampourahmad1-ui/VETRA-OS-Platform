import { requireAuth } from '../middlewares/requireAuth';
import { requirePermission } from '../middlewares/permissions';
import { tenantId } from '../middlewares/tenant';
import { Router } from 'express';
import { db, clientsTable } from '@workspace/db';
import { and, eq, ilike, or } from 'drizzle-orm';
import { UpdateClientBody } from '@workspace/api-zod';
import { audit } from '../lib/audit';
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
  audit(req, 'crm.client.created', 'client', { resourceId: row.id, newValues: { name: row.name, company: row.company, type: row.type, status: row.status } });
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
  // VETRA-SEC-06: Capture old values for audit before update
  const [oldClient] = await db.select({ name: clientsTable.name, company: clientsTable.company, type: clientsTable.type, status: clientsTable.status }).from(clientsTable).where(and(eq(clientsTable.id, id), eq(clientsTable.organizationId, orgId)));
  const [row] = await db.update(clientsTable).set(updates).where(and(eq(clientsTable.id, id), eq(clientsTable.organizationId, orgId))).returning();
  if (!row) {
    logger.warn({ userId: req.vetraUser?.id, orgId, clientId: id }, 'CRM PATCH target not found (404)');
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  logger.info({ userId: req.vetraUser?.id, orgId, clientId: id, updatedFields: Object.keys(updates) }, 'CRM client updated');
  audit(req, 'crm.client.updated', 'client', { resourceId: row.id, oldValues: oldClient ? { name: oldClient.name, company: oldClient.company, type: oldClient.type, status: oldClient.status } : undefined, newValues: { name: row.name, company: row.company, type: row.type, status: row.status } });
  res.json(row);
});
router.delete("/crm/clients/:id", requirePermission("crm.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const organizationId = tenantId(req);
  const [row] = await db.delete(clientsTable).where(and(eq(clientsTable.id, id), eq(clientsTable.organizationId, organizationId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  audit(req, "crm.client.deleted", "client", { resourceId: id, oldValues: { name: row.name, company: row.company } });
  res.status(200).json({ message: "Client deleted" });
});

export default router;
