import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import {
  projectsTable,
  tasksTable,
  usersTable,
  equipmentTable,
  activityTable,
} from "@workspace/db";
import { tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

router.get("/dashboard/summary", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const organizationId = tenantId(req);
  const [projects, tasks, users, equipment] = await Promise.all([
    db.select().from(projectsTable).where(eq(projectsTable.organizationId, organizationId)),
    db.select().from(tasksTable).where(eq(tasksTable.organizationId, organizationId)),
    db.select().from(usersTable).where(eq(usersTable.organizationId, organizationId)),
    db.select().from(equipmentTable).where(eq(equipmentTable.organizationId, organizationId)),
  ]);

  const activeProjects = projects.filter(p => p.status === "active").length;
  const totalBudget = projects.reduce((s, p) => s + parseFloat(p.budget as string), 0);
  const spentBudget = projects.reduce((s, p) => s + parseFloat(p.spent as string), 0);
  const avgProgress = projects.length > 0
    ? projects.reduce((s, p) => s + parseFloat(p.progress as string), 0) / projects.length
    : 0;
  const overallProgress = Math.round(avgProgress * 10) / 10;

  const today = new Date().toISOString().split("T")[0];
  const delayedActivities = projects.filter(p =>
    p.status === "active" && p.endDate < today
  ).length;

  const openTasks = tasks.filter(t => t.status !== "done").length;
  const overdueTasksCount = tasks.filter(t =>
    t.status !== "done" && t.dueDate && t.dueDate < today
  ).length;

  const pendingApprovals = tasks.filter(t => t.status === "review").length;
  const equipmentActive = equipment.filter(e => e.status === "in-use").length;

  res.json({
    activeProjects,
    totalBudget,
    spentBudget,
    overallProgress,
    delayedActivities,
    totalWorkforce: users.length,
    pendingApprovals,
    equipmentActive,
    equipmentTotal: equipment.length,
    openTasks,
    overdueTasksCount,
  });
});

router.get("/dashboard/project-health", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, tenantId(req)));
  const today = new Date();

  const health = projects.map(p => {
    const budgetUsed = parseFloat(p.spent as string);
    const budgetTotal = parseFloat(p.budget as string);
    const budgetRatio = budgetTotal > 0 ? budgetUsed / budgetTotal : 0;
    const progress = parseFloat(p.progress as string);
    const endDate = new Date(p.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let h = "good";
    if (p.status === "on-hold" || daysRemaining < 0 || budgetRatio > 0.95) h = "critical";
    else if (daysRemaining < 30 || budgetRatio > 0.85 || progress < 40) h = "warning";

    return {
      projectId: p.id,
      projectName: p.name,
      progress,
      status: p.status,
      health: h,
      budgetUsed,
      budgetTotal,
      daysRemaining,
    };
  });

  res.json(health);
});

router.get("/dashboard/recent-activity", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const items = await db
    .select()
    .from(activityTable)
    .where(eq(activityTable.organizationId, tenantId(req)))
    .orderBy(sql`${activityTable.createdAt} desc`)
    .limit(20);

  res.json(
    items.map(i => ({
      id: i.id,
      type: i.type,
      description: i.description,
      user: i.user,
      projectName: i.projectName ?? null,
      createdAt: i.createdAt.toISOString(),
    }))
  );
});

router.get("/dashboard/cash-flow", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const currentMonth = new Date().getMonth();
  const data = months.map((month, i) => {
    const offset = i - currentMonth;
    const base = 2000000 + Math.sin(i) * 500000;
    return {
      month,
      income: i <= currentMonth ? Math.round(base + Math.random() * 400000) : 0,
      expense: i <= currentMonth ? Math.round(base * 0.75 + Math.random() * 300000) : 0,
    };
  });
  res.json(data);
});

/**
 * VETRA-SEC-04: Audit Logs endpoint
 *
 * Returns paginated audit log entries for the current tenant.
 * Supports optional filtering by action, resource, and actorId.
 * Sorted by most recent first.
 *
 * Security:
 * - Tenant isolation via organizationId (extracted from authenticated user)
 * - Requires dashboard.read permission
 * - Enforces append-only audit principle (no writes via this endpoint)
 */
router.get("/dashboard/audit-logs", requirePermission("dashboard.read"), async (req, res): Promise<void> => {
  const organizationId = tenantId(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const filters = [eq(auditLogsTable.organizationId, organizationId)];
  if (typeof req.query.action === "string" && req.query.action) {
    filters.push(eq(auditLogsTable.action, req.query.action));
  }
  if (typeof req.query.resource === "string" && req.query.resource) {
    filters.push(eq(auditLogsTable.resource, req.query.resource));
  }
  if (typeof req.query.actorId === "string" && req.query.actorId) {
    const actorId = Number(req.query.actorId);
    if (Number.isInteger(actorId) && actorId > 0) {
      filters.push(eq(auditLogsTable.actorId, actorId));
    }
  }

  const [rows, countResult] = await Promise.all([
    db.select()
      .from(auditLogsTable)
      .where(and(...filters))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)` })
      .from(auditLogsTable)
      .where(and(...filters)),
  ]);

  const total = Number(countResult[0]?.total ?? 0);
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resourceId,
      actorId: row.actorId,
      actorClerkId: row.actorClerkId,
      oldValues: row.oldValues,
      newValues: row.newValues,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
});

export default router;
