import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, usersTable, organizationsTable } from "@workspace/db";
import { CreateUserBody, UpdateUserBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

function serialize(row: any, organizationName: string | null) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department ?? null,
    phone: row.phone ?? null,
    avatarInitials: row.avatarInitials,
    organizationId: row.organizationId,
    organizationName,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/users", requirePermission("users.read"), async (req, res): Promise<void> => {
  const { role, search } = req.query as { role?: string; search?: string };
  let rows = await db.select().from(usersTable).where(eq(usersTable.organizationId, tenantId(req)));
  if (role) rows = rows.filter((u) => u.role === role);
  if (search) {
    const needle = search.toLowerCase();
    rows = rows.filter((u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));
  }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tenantId(req)));
  res.json(rows.map((row) => serialize(row, org?.name ?? null)));
});

router.post("/users", requirePermission("users.create"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const organizationId = tenantId(req);
  const initials = d.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const [row] = await db.insert(usersTable).values({
    name: d.name, email: d.email, role: d.role, department: d.department, phone: d.phone,
    avatarInitials: initials, organizationId,
  }).returning();
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, organizationId));
  res.status(201).json(serialize(row, org?.name ?? null));
  audit(req, "user.created", "user", { resourceId: row.id, newValues: { name: row.name, email: row.email, role: row.role } });
});

router.get("/users/:id", requirePermission("users.read"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.organizationId, tenantId(req))));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tenantId(req)));
  res.json(serialize(row, org?.name ?? null));
});

router.patch("/users/:id", requirePermission("users.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
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
  // VETRA-SEC-06: Capture old values for audit before update
  const [oldUser] = await db.select({ name: usersTable.name, email: usersTable.email, role: usersTable.role, active: usersTable.active })
    .from(usersTable).where(and(eq(usersTable.id, id), eq(usersTable.organizationId, tenantId(req))));
  if (!oldUser) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db.update(usersTable).set(updates).where(and(eq(usersTable.id, id), eq(usersTable.organizationId, tenantId(req)))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, tenantId(req)));
  res.json(serialize(row, org?.name ?? null));
  if (oldUser.role !== row.role || oldUser.active !== row.active) {
    audit(req, "user.role_changed", "user", { resourceId: row.id, oldValues: { role: oldUser.role, active: oldUser.active }, newValues: { role: row.role, active: row.active } });
  } else {
    audit(req, "user.updated", "user", { resourceId: row.id, oldValues: { name: oldUser.name, email: oldUser.email }, newValues: { name: row.name, email: row.email } });
  }
});

export default router;
