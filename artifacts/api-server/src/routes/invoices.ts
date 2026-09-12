import { Router } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, invoicesTable, invoiceLinesTable, paymentSchedulesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { tenantId } from "../middlewares/tenant";
import { createNotification, NotificationType } from "../lib/notifications";

const router = Router();
router.use(requireAuth);

// ─── GET /invoices ───────────────────────────────────────────────────────────
router.get("/invoices", requirePermission("invoices.read"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const { status, contractId } = req.query as { status?: string; contractId?: string };

  const filters = [eq(invoicesTable.organizationId, org)];
  if (status) filters.push(eq(invoicesTable.status, status));
  if (contractId) filters.push(eq(invoicesTable.contractId, Number(contractId)));

  const rows = await db.select().from(invoicesTable)
    .where(and(...filters))
    .orderBy(desc(invoicesTable.createdAt));

  res.json(rows.map(r => ({
    ...r,
    subtotal: Number(r.subtotal),
    taxAmount: Number(r.taxAmount),
    totalAmount: Number(r.totalAmount),
  })));
});

// ─── POST /invoices ──────────────────────────────────────────────────────────
router.post("/invoices", requirePermission("invoices.create"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const { invoiceNumber, contractId, projectId, issueDate, dueDate, notes, lines } = req.body;

  if (!invoiceNumber || !issueDate || !Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "invoiceNumber, issueDate, and lines[] are required" });
    return;
  }

  // Calculate totals
  let subtotal = 0;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    subtotal += qty * price;
  }
  const taxAmount = subtotal * 0.09; // 9% VAT
  const totalAmount = subtotal + taxAmount;

  const [invoice] = await db.transaction(async (tx) => {
    const [inv] = await tx.insert(invoicesTable).values({
      organizationId: org,
      invoiceNumber,
      contractId: contractId ?? null,
      projectId: projectId ?? null,
      issueDate: new Date(issueDate),
      dueDate: dueDate ? new Date(dueDate) : null,
      subtotal: subtotal.toString(),
      taxAmount: taxAmount.toString(),
      totalAmount: totalAmount.toString(),
      status: "draft",
      notes: notes ?? null,
      createdBy: userId,
    }).returning();

    // Insert lines
    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const lineTotal = qty * price;
      await tx.insert(invoiceLinesTable).values({
        organizationId: org,
        invoiceId: inv.id,
        description: line.description,
        quantity: qty.toString(),
        unitPrice: price.toString(),
        totalPrice: lineTotal.toString(),
      });
    }

    return [inv];
  });

  res.status(201).json({
    ...invoice,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
  });
  audit(req, "invoice.created", "invoice", { resourceId: invoice.id, newValues: { invoiceNumber, totalAmount } });
});

// ─── GET /invoices/:id ───────────────────────────────────────────────────────
router.get("/invoices/:id", requirePermission("invoices.read"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const id = Number(req.params.id);

  const [invoice] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org)));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

  const lines = await db.select().from(invoiceLinesTable)
    .where(and(eq(invoiceLinesTable.invoiceId, id), eq(invoiceLinesTable.organizationId, org)));

  res.json({
    ...invoice,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
    lines: lines.map(l => ({
      ...l,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      totalPrice: Number(l.totalPrice),
    })),
  });
});

// ─── PATCH /invoices/:id/approve ─────────────────────────────────────────────
router.patch("/invoices/:id/approve", requirePermission("invoices.update"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const id = Number(req.params.id);

  const [current] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org)));
  if (!current) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (current.status === "approved" || current.status === "sent") {
    res.status(409).json({ error: "Invoice already approved or sent" });
    return;
  }

  const [invoice] = await db.update(invoicesTable).set({
    status: "approved",
    approvedBy: userId,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org))).returning();

  res.json({
    ...invoice,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
  });
  audit(req, "invoice.approved", "invoice", { resourceId: id, newValues: { status: "approved" } });

  // Invoice due notification (fire-and-forget)
  if (invoice.dueDate && invoice.createdBy) {
    const dueInDays = Math.ceil((invoice.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (dueInDays <= 7) {
      createNotification({
        organizationId: org,
        userId: invoice.createdBy,
        title: "فاکتور در سررسید",
        message: `فاکتور "${invoice.invoiceNumber}" در ${dueInDays} روز سررسید دارد`,
        type: NotificationType.INVOICE_DUE,
        link: `/invoices/${invoice.id}`,
      }).catch(() => {});
    }
  }
});

// ─── PATCH /invoices/:id ─────────────────────────────────────────────────────
router.patch("/invoices/:id", requirePermission("invoices.update"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const id = Number(req.params.id);

  const [current] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org)));
  if (!current) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (current.status === "approved" || current.status === "sent") {
    res.status(409).json({ error: "Cannot edit approved/sent invoices" });
    return;
  }

  const upd: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["invoiceNumber", "issueDate", "dueDate", "notes", "status"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }

  const [invoice] = await db.update(invoicesTable).set(upd)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org)))
    .returning();

  res.json({
    ...invoice,
    subtotal: Number(invoice.subtotal),
    taxAmount: Number(invoice.taxAmount),
    totalAmount: Number(invoice.totalAmount),
  });
  audit(req, "invoice.updated", "invoice", { resourceId: id, oldValues: { status: current.status }, newValues: { status: invoice.status } });
});

// ─── DELETE /invoices/:id ────────────────────────────────────────────────────
router.delete("/invoices/:id", requirePermission("invoices.delete"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const id = Number(req.params.id);

  const [current] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org)));
  if (!current) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (current.status === "approved" || current.status === "sent") {
    res.status(409).json({ error: "Cannot delete approved/sent invoices" });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(invoiceLinesTable).where(and(eq(invoiceLinesTable.invoiceId, id), eq(invoiceLinesTable.organizationId, org)));
    await tx.delete(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.organizationId, org)));
  });

  res.status(204).end();
  audit(req, "invoice.deleted", "invoice", { resourceId: id, oldValues: { invoiceNumber: current.invoiceNumber } });
});

// ─── Payment Schedules ───────────────────────────────────────────────────────

router.get("/payment-schedules", requirePermission("payment-schedule.read"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const { contractId, status } = req.query as { contractId?: string; status?: string };

  const filters = [eq(paymentSchedulesTable.organizationId, org)];
  if (contractId) filters.push(eq(paymentSchedulesTable.contractId, Number(contractId)));
  if (status) filters.push(eq(paymentSchedulesTable.status, status));

  const rows = await db.select().from(paymentSchedulesTable)
    .where(and(...filters))
    .orderBy(paymentSchedulesTable.dueDate);

  const now = new Date();
  res.json(rows.map(r => ({
    ...r,
    amount: Number(r.amount),
    paidAmount: Number(r.paidAmount),
    isOverdue: r.status !== "paid" && r.dueDate < now,
  })));
});

router.post("/payment-schedules", requirePermission("payment-schedule.create"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const userId = req.vetraUser!.id;
  const { contractId, description, amount, dueDate, notes } = req.body;

  if (!contractId || !description || !amount || !dueDate) {
    res.status(400).json({ error: "contractId, description, amount, dueDate are required" });
    return;
  }

  const [row] = await db.insert(paymentSchedulesTable).values({
    organizationId: org,
    contractId,
    description,
    amount: Number(amount).toString(),
    paidAmount: "0",
    dueDate: new Date(dueDate),
    status: "pending",
    notes: notes ?? null,
    createdBy: userId,
  }).returning();

  res.status(201).json({ ...row, amount: Number(row.amount), paidAmount: Number(row.paidAmount) });
  audit(req, "payment_schedule.created", "payment_schedule", { resourceId: row.id, newValues: { description, amount } });
});

router.patch("/payment-schedules/:id", requirePermission("payment-schedule.update"), async (req, res): Promise<void> => {
  const org = tenantId(req);
  const id = Number(req.params.id);

  const [current] = await db.select().from(paymentSchedulesTable)
    .where(and(eq(paymentSchedulesTable.id, id), eq(paymentSchedulesTable.organizationId, org)));
  if (!current) { res.status(404).json({ error: "Payment schedule not found" }); return; }

  const upd: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["description", "dueDate", "notes", "status"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  if (req.body.amount !== undefined) upd.amount = Number(req.body.amount).toString();
  if (req.body.paidAmount !== undefined) upd.paidAmount = Number(req.body.paidAmount).toString();

  const [row] = await db.update(paymentSchedulesTable).set(upd)
    .where(and(eq(paymentSchedulesTable.id, id), eq(paymentSchedulesTable.organizationId, org)))
    .returning();

  res.json({ ...row, amount: Number(row.amount), paidAmount: Number(row.paidAmount) });
  audit(req, "payment_schedule.updated", "payment_schedule", { resourceId: id, oldValues: { status: current.status }, newValues: { status: row.status } });
});

export default router;
