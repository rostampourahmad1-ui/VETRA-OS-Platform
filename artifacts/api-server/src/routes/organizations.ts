import { requireAuth } from "../middlewares/requireAuth";
import { tenantId } from "../middlewares/tenant";
import { Router } from "express";
import { db, organizationsTable } from "@workspace/db";
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

export default router;
