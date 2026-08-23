import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const router = Router();
router.use(requireAuth);

router.get("/notifications", requirePermission("notifications.read"), async (req, res): Promise<void> => {
  try {
    const organizationId = req.vetraUser?.organizationId;
    const userId = req.vetraUser?.id;
    if (!organizationId || !userId) {
      res.status(403).json({ error: "Forbidden: tenant context is required" });
      return;
    }

    const rows = await db.select().from(notificationsTable).where(
      and(
        eq(notificationsTable.organizationId, organizationId),
        eq(notificationsTable.userId, userId),
      ),
    ).orderBy(sql`${notificationsTable.createdAt} desc`);

    res.json(rows.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      link: n.link ?? null,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/notifications/:id/read", requirePermission("notifications.update"), async (req, res): Promise<void> => {
  try {
    const organizationId = req.vetraUser?.organizationId;
    const userId = req.vetraUser?.id;
    if (!organizationId || !userId) {
      res.status(403).json({ error: "Forbidden: tenant context is required" });
      return;
    }

    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid notification ID" });
      return;
    }

    const [row] = await db.update(notificationsTable).set({ read: true }).where(
      and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.organizationId, organizationId),
        eq(notificationsTable.userId, userId),
      ),
    ).returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id: row.id,
      title: row.title,
      message: row.message,
      type: row.type,
      read: row.read,
      link: row.link ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/notifications/unread-count", requirePermission("notifications.read"), async (req, res): Promise<void> => {
  try {
    const organizationId = req.vetraUser?.organizationId;
    const userId = req.vetraUser?.id;
    if (!organizationId || !userId) {
      res.status(403).json({ error: "Forbidden: tenant context is required" });
      return;
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.organizationId, organizationId),
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.read, false),
      ));

    res.json({ unread: result?.count ?? 0 });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
