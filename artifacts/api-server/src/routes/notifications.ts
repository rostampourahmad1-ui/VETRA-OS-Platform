import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

router.get("/notifications", requirePermission("notifications.read"), async (req, res): Promise<void> => {
  // Notifications currently lack a tenant key; fail closed rather than risk disclosure.
  res.json([]);
  return;
  const rows = await db.select().from(notificationsTable).orderBy(sql`${notificationsTable.createdAt} desc`);
  res.json(rows.map(n => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read,
    link: n.link ?? null,
    createdAt: n.createdAt.toISOString(),
  })));
});

router.patch("/notifications/:id/read", requirePermission("notifications.update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  res.status(404).json({ error: "Not found" });
  return;
  const [row] = await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    read: row.read,
    link: row.link ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
