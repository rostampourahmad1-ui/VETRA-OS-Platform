import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, dailyReportsTable, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateDailyReportBody } from "@workspace/api-zod";

const router = Router();
router.use(requireAuth);

router.get("/daily-reports", requirePermission("daily-reports.read"), async (req, res): Promise<void> => {
  const { projectId } = req.query as { projectId?: string };

  let rows = await db.select().from(dailyReportsTable).orderBy(sql`${dailyReportsTable.date} desc`);
  if (projectId) rows = rows.filter(r => r.projectId === parseInt(projectId, 10));

  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(r => ({
    id: r.id,
    date: r.date,
    weather: r.weather,
    temperature: r.temperature ? parseFloat(r.temperature as string) : null,
    progress: parseFloat(r.progress as string),
    workersOnSite: r.workersOnSite,
    issues: r.issues ?? null,
    notes: r.notes ?? null,
    projectId: r.projectId,
    projectName: projMap.get(r.projectId) ?? "Unknown",
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  })));
});

router.post("/daily-reports", requirePermission("daily-reports.create"), async (req, res): Promise<void> => {
  const parsed = CreateDailyReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(dailyReportsTable).values({
    date: d.date,
    weather: d.weather,
    temperature: d.temperature?.toString(),
    progress: d.progress.toString(),
    workersOnSite: d.workersOnSite ?? 0,
    issues: d.issues,
    notes: d.notes,
    projectId: d.projectId,
    createdBy: d.createdBy,
  }).returning();

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.status(201).json({
    ...row,
    temperature: row.temperature ? parseFloat(row.temperature as string) : null,
    progress: parseFloat(row.progress as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/daily-reports/:id", requirePermission("daily-reports.read"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db.select().from(dailyReportsTable).where(eq(dailyReportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.json({
    ...row,
    temperature: row.temperature ? parseFloat(row.temperature as string) : null,
    progress: parseFloat(row.progress as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
