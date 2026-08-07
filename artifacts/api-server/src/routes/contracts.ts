import { Router } from "express";
import { db, contractsTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateContractBody, UpdateContractBody } from "@workspace/api-zod";

const router = Router();

router.get("/contracts", async (req, res): Promise<void> => {
  const { projectId, status } = req.query as { projectId?: string; status?: string };

  let rows = await db.select().from(contractsTable);
  if (projectId) rows = rows.filter(c => c.projectId === parseInt(projectId, 10));
  if (status) rows = rows.filter(c => c.status === status);

  const projects = await db.select().from(projectsTable);
  const projMap = new Map(projects.map(p => [p.id, p.name]));

  res.json(rows.map(c => ({
    id: c.id,
    name: c.name,
    contractor: c.contractor,
    value: parseFloat(c.value as string),
    status: c.status,
    type: c.type ?? null,
    projectId: c.projectId,
    projectName: projMap.get(c.projectId) ?? "Unknown",
    startDate: c.startDate,
    endDate: c.endDate,
    signedDate: c.signedDate ?? null,
    createdAt: c.createdAt.toISOString(),
  })));
});

router.post("/contracts", async (req, res): Promise<void> => {
  const parsed = CreateContractBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const [row] = await db.insert(contractsTable).values({
    name: d.name,
    contractor: d.contractor,
    value: d.value.toString(),
    status: d.status ?? "draft",
    type: d.type,
    projectId: d.projectId,
    startDate: d.startDate,
    endDate: d.endDate,
    signedDate: d.signedDate,
  }).returning();

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.status(201).json({
    ...row,
    value: parseFloat(row.value as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/contracts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db.select().from(contractsTable).where(eq(contractsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.json({
    ...row,
    value: parseFloat(row.value as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/contracts/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateContractBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.contractor !== undefined) updates.contractor = d.contractor;
  if (d.value !== undefined) updates.value = d.value.toString();
  if (d.status !== undefined) updates.status = d.status;
  if (d.type !== undefined) updates.type = d.type;
  if (d.startDate !== undefined) updates.startDate = d.startDate;
  if (d.endDate !== undefined) updates.endDate = d.endDate;
  if (d.signedDate !== undefined) updates.signedDate = d.signedDate;

  const [row] = await db.update(contractsTable).set(updates).where(eq(contractsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, row.projectId));

  res.json({
    ...row,
    value: parseFloat(row.value as string),
    projectName: proj?.name ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
