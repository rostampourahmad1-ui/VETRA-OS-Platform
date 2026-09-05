import { requireAuth } from "../middlewares/requireAuth";
import { tenantId } from "../middlewares/tenant";
import { Router } from "express";
import { db, organizationsTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { eq } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

router.get("/organizations", async (req, res): Promise<void> => {
  const rows = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tenantId(req)));
  res.json(rows.map(o => ({
    id: o.id,
    name: o.name,
    type: o.type,
    logoInitials: o.logoInitials,
    industry: o.industry ?? null,
    country: o.country ?? null,
    createdAt: o.createdAt.toISOString(),
  })));
});

router.patch("/organizations", requireAuth, async (req, res): Promise<void> => {
  const { name, type, industry, country } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (type !== undefined) updates.type = type;
  if (industry !== undefined) updates.industry = industry;
  if (country !== undefined) updates.country = country;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [old] = await db.select({ name: organizationsTable.name, type: organizationsTable.type }).from(organizationsTable).where(eq(organizationsTable.id, tenantId(req)));
  const [row] = await db.update(organizationsTable).set(updates).where(eq(organizationsTable.id, tenantId(req))).returning();
  if (!row) { res.status(404).json({ error: "Organization not found" }); return; }
  res.json({ id: row.id, name: row.name, type: row.type, logoInitials: row.logoInitials, industry: row.industry ?? null, country: row.country ?? null, createdAt: row.createdAt.toISOString() });
  audit(req, "organization.updated", "organization", { resourceId: row.id, oldValues: old ? { name: old.name, type: old.type } : undefined, newValues: { name: row.name, type: row.type } });
});

export default router;
