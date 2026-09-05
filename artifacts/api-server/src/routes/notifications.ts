import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, notificationsTable, notificationPreferencesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { sseBroadcaster } from "../lib/sseBroadcaster";

const router = Router();
router.use(requireAuth);

// ─── GET /notifications (paginated) ────────────────────────────────────────
router.get("/notifications", requirePermission("notifications.read"), async (req, res): Promise<void> => {
  try {
    const organizationId = req.vetraUser?.organizationId;
    const userId = req.vetraUser?.id;
    if (!organizationId || !userId) {
      res.status(403).json({ error: "Forbidden: tenant context is required" });
      return;
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    // Get total count for pagination metadata
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.organizationId, organizationId),
        eq(notificationsTable.userId, userId),
      ));

    const rows = await db.select().from(notificationsTable).where(
      and(
        eq(notificationsTable.organizationId, organizationId),
        eq(notificationsTable.userId, userId),
      ),
    ).orderBy(sql`${notificationsTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

    res.json({
      data: rows.map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        read: n.read,
        link: n.link ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        limit,
        offset,
        total: count,
        hasMore: offset + limit < count,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /notifications/:id/read ─────────────────────────────────────────
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

// ─── GET /notifications/unread-count ───────────────────────────────────────
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

// ─── GET /notifications/preferences ────────────────────────────────────────
router.get("/notifications/preferences", requirePermission("notifications.read"), async (req, res): Promise<void> => {
  try {
    const organizationId = req.vetraUser?.organizationId;
    const userId = req.vetraUser?.id;
    if (!organizationId || !userId) {
      res.status(403).json({ error: "Forbidden: tenant context is required" });
      return;
    }

    const prefs = await db
      .select()
      .from(notificationPreferencesTable)
      .where(and(
        eq(notificationPreferencesTable.organizationId, organizationId),
        eq(notificationPreferencesTable.userId, userId),
      ));

    res.json(prefs.map(p => ({
      type: p.type,
      optIn: p.optIn,
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /notifications/preferences ────────────────────────────────────────
router.put("/notifications/preferences", requirePermission("notifications.update"), async (req, res): Promise<void> => {
  try {
    const organizationId = req.vetraUser?.organizationId;
    const userId = req.vetraUser?.id;
    if (!organizationId || !userId) {
      res.status(403).json({ error: "Forbidden: tenant context is required" });
      return;
    }

    const { preferences } = req.body;
    if (!Array.isArray(preferences)) {
      res.status(400).json({ error: "preferences must be an array of { type, optIn }" });
      return;
    }

    for (const pref of preferences) {
      if (typeof pref.type !== "string" || typeof pref.optIn !== "boolean") {
        res.status(400).json({ error: "Each preference must have a string 'type' and boolean 'optIn'" });
        return;
      }
    }

    // Upsert each preference
    for (const pref of preferences) {
      await db
        .insert(notificationPreferencesTable)
        .values({
          organizationId,
          userId,
          type: pref.type,
          optIn: pref.optIn,
        })
        .onConflictDoUpdate({
          target: [
            notificationPreferencesTable.organizationId,
            notificationPreferencesTable.userId,
            notificationPreferencesTable.type,
          ],
          set: { optIn: pref.optIn },
        });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /notifications/stream (SSE) ───────────────────────────────────────
router.get("/notifications/stream", requirePermission("notifications.read"), async (req, res): Promise<void> => {
  const organizationId = req.vetraUser?.organizationId;
  const userId = req.vetraUser?.id;
  if (!organizationId || !userId) {
    res.status(403).json({ error: "Forbidden: tenant context is required" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Send initial keepalive
  res.write(": connected\n\n");

  // Register this client
  sseBroadcaster.addClient(organizationId, userId, res);

  // Heartbeat every 30 seconds to keep the connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 30_000);

  res.on("close", () => {
    clearInterval(heartbeat);
  });
});

export default router;
