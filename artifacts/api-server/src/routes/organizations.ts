import { Router } from "express";
import { db, organizationsTable } from "@workspace/db";

const router = Router();

router.get("/organizations", async (req, res): Promise<void> => {
  const rows = await db.select().from(organizationsTable);
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
