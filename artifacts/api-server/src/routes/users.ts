import { Router } from "express";
import { db, usersTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";

const router = Router();

router.get("/users", async (req, res): Promise<void> => {
  const { role, search } = req.query as { role?: string; search?: string };

  let rows = await db.select().from(usersTable);
  if (role) rows = rows.filter(u => u.role === role);
  if (search) rows = rows.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const orgs = await db.select().from(organizationsTable);
  const orgMap = new Map(orgs.map(o => [o.id, o.name]));

  res.json(rows.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.department ?? null,
    phone: u.phone ?? null,
    avatarInitials: u.avatarInitials,
    organizationId: u.organizationId,
    organizationName: orgMap.get(u.organizationId) ?? null,
    active: u.active,
    createdAt: u.createdAt.toISOString(),
  })));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;

  const initials = d.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const [row] = await db.insert(usersTable).values({
    name: d.name,
    email: d.email,
    role: d.role,
    department: d.department,
    phone: d.phone,
    avatarInitials: initials,
    organizationId: d.organizationId,
  }).returning();

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, row.organizationId));

  res.status(201).json({
    ...row,
    organizationName: org?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, row.organizationId));

  res.json({
    ...row,
    organizationName: org?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const d = parsed.data;
  const updates: Record<string, unknown> = {};
  if (d.name !== undefined) updates.name = d.name;
  if (d.email !== undefined) updates.email = d.email;
  if (d.role !== undefined) updates.role = d.role;
  if (d.department !== undefined) updates.department = d.department;
  if (d.phone !== undefined) updates.phone = d.phone;
  if (d.active !== undefined) updates.active = d.active;

  const [row] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, row.organizationId));

  res.json({
    ...row,
    organizationName: org?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
