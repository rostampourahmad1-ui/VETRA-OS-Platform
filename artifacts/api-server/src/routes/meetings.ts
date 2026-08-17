import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { Router } from "express";
import { db, meetingsTable, projectsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateMeetingBody, UpdateMeetingBody } from "@workspace/api-zod";

const router = Router();
router.use(requireAuth);

router.get("/meetings", requirePermission("meetings.read"), async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };

  let rows = await db.select().from(meetingsTable).orderBy(sql`${meetingsTable.date} desc`);
  if (projectId) rows = rows.filter(m => m.projectId === parseInt(projectId, 10));
  if (status) rows = rows.filter(m => m.status === status);

  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(m => ({
    id: m.id,
    title: m.title,
    date: m.date.toISOString(),
    location: m.location,
    status: m.status,
    agenda: m.agenda ?? null,
    minutes: m.minutes ?? null,
    attendees: m.attendees,
    projectId: m.projectId,
    projectName: projMap.get(m.projectId) ?? "Unknown",
    organizer: m.organizer,
    createdAt: m.createdAt.toISOString(),
  })));
});

router.post("/meetings", requirePermission("meetings.create"), async (req, res): Promise<void> => {
  const parsed = CreateMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(meetingsTable).values({
    title: d.title,
    date: new Date(d.date),
    location: d.location,
    status: d.status ?? "scheduled",
    agenda: d.agenda,
    attendees: d.attendees ?? "",
    projectId: d.projectId,
    organizer: d.organizer,
  }).returning();

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.status(201).json({
    ...row,
    date: row.date.toISOString(),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/meetings/:id", requirePermission("meetings.read"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.json({
    ...row,
    date: row.date.toISOString(),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/meetings/:id", requirePermission("meetings.update"), async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateMeetingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.title !== undefined) updates.title = d.title;
  if (d.date !== undefined) updates.date = new Date(d.date);
  if (d.location !== undefined) updates.location = d.location;
  if (d.status !== undefined) updates.status = d.status;
  if (d.agenda !== undefined) updates.agenda = d.agenda;
  if (d.minutes !== undefined) updates.minutes = d.minutes;
  if (d.attendees !== undefined) updates.attendees = d.attendees;

  const [row] = await db.update(meetingsTable).set(updates).where(eq(meetingsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.json({
    ...row,
    date: row.date.toISOString(),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
