import { Router } from "express";
import { and, eq, desc, isNull } from "drizzle-orm";
import { db, boqItemsTable, qtoItemsTable, paymentCertificatesTable, contractsTable, projectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

// ─── BOQ Items ───────────────────────────────────────────────────────────────

router.get("/contracts/:contractId/boq", requirePermission("contracts.read"), async (req, res): Promise<void> => {
  const contractId = Number(req.params.contractId);
  const [contract] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, contractId), eq(contractsTable.organizationId, tenantId(req))));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  const rows = await db.select().from(boqItemsTable).where(and(
    eq(boqItemsTable.contractId, contractId),
    eq(boqItemsTable.organizationId, tenantId(req)),
    isNull(boqItemsTable.deletedAt),
  )).orderBy(boqItemsTable.sortOrder);
  res.json(rows.map(r => ({ ...r, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice), totalPrice: Number(r.totalPrice) })));
});

router.post("/contracts/:contractId/boq", requirePermission("contracts.create"), async (req, res): Promise<void> => {
  const contractId = Number(req.params.contractId);
  const { code, description, unit, quantity, unitPrice, parentId, level, sortOrder } = req.body;
  const [contract] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, contractId), eq(contractsTable.organizationId, tenantId(req))));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  if (!code || !description || !unit) { res.status(400).json({ error: "code, description, unit are required" }); return; }
  const totalPrice = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const [row] = await db.insert(boqItemsTable).values({
    contractId, organizationId: tenantId(req), code, description, unit,
    quantity: (quantity ?? "0").toString(), unitPrice: (unitPrice ?? "0").toString(),
    totalPrice: totalPrice.toString(), parentId: parentId ?? null, level: level ?? 0, sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), totalPrice: Number(row.totalPrice) });
  audit(req, "boq.created", "boq_item", { resourceId: row.id, newValues: { code, description, contractId } });
});

router.patch("/contracts/:contractId/boq/:id", requirePermission("contracts.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(boqItemsTable).where(and(eq(boqItemsTable.id, id), eq(boqItemsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "BOQ item not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["code", "description", "unit", "parentId", "level", "sortOrder"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  if (req.body.quantity !== undefined) upd.quantity = req.body.quantity.toString();
  if (req.body.unitPrice !== undefined) upd.unitPrice = req.body.unitPrice.toString();
  const q = Number(upd.quantity ?? current.quantity);
  const p = Number(upd.unitPrice ?? current.unitPrice);
  upd.totalPrice = (q * p).toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(boqItemsTable).set(upd).where(and(eq(boqItemsTable.id, id), eq(boqItemsTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), totalPrice: Number(row.totalPrice) });
  audit(req, "boq.updated", "boq_item", { resourceId: id, oldValues: { code: current.code }, newValues: { code: row.code } });
});

router.delete("/contracts/:contractId/boq/:id", requirePermission("contracts.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(boqItemsTable).where(and(eq(boqItemsTable.id, id), eq(boqItemsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "BOQ item not found" }); return; }
  await db.update(boqItemsTable).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(boqItemsTable.id, id), eq(boqItemsTable.organizationId, tenantId(req))));
  res.status(204).end();
  audit(req, "boq.deleted", "boq_item", { resourceId: id, oldValues: { code: current.code } });
});

// ─── QTO Items ───────────────────────────────────────────────────────────────

router.get("/boq-items/:boqItemId/qto", requirePermission("contracts.read"), async (req, res): Promise<void> => {
  const boqItemId = Number(req.params.boqItemId);
  const [boqItem] = await db.select().from(boqItemsTable).where(and(eq(boqItemsTable.id, boqItemId), eq(boqItemsTable.organizationId, tenantId(req))));
  if (!boqItem) { res.status(404).json({ error: "BOQ item not found" }); return; }
  const rows = await db.select().from(qtoItemsTable).where(and(eq(qtoItemsTable.boqItemId, boqItemId), eq(qtoItemsTable.organizationId, tenantId(req))));
  res.json(rows.map(r => ({ ...r, designQuantity: Number(r.designQuantity), fieldQuantity: Number(r.fieldQuantity), wasteFactor: Number(r.wasteFactor) })));
});

router.post("/boq-items/:boqItemId/qto", requirePermission("contracts.create"), async (req, res): Promise<void> => {
  const boqItemId = Number(req.params.boqItemId);
  const { description, unit, designQuantity, fieldQuantity, wasteFactor, notes } = req.body;
  const [boqItem] = await db.select().from(boqItemsTable).where(and(eq(boqItemsTable.id, boqItemId), eq(boqItemsTable.organizationId, tenantId(req))));
  if (!boqItem) { res.status(404).json({ error: "BOQ item not found" }); return; }
  if (!description || !unit) { res.status(400).json({ error: "description and unit are required" }); return; }
  const [row] = await db.insert(qtoItemsTable).values({
    boqItemId, organizationId: tenantId(req), description, unit,
    designQuantity: (designQuantity ?? "0").toString(), fieldQuantity: (fieldQuantity ?? "0").toString(),
    wasteFactor: (wasteFactor ?? "0").toString(), notes,
  }).returning();
  res.status(201).json({ ...row, designQuantity: Number(row.designQuantity), fieldQuantity: Number(row.fieldQuantity), wasteFactor: Number(row.wasteFactor) });
  audit(req, "qto.created", "qto_item", { resourceId: row.id, newValues: { description, boqItemId } });
});

router.patch("/boq-items/:boqItemId/qto/:id", requirePermission("contracts.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(qtoItemsTable).where(and(eq(qtoItemsTable.id, id), eq(qtoItemsTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "QTO item not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["description", "unit", "notes"] as const) if (req.body[k] !== undefined) upd[k] = req.body[k];
  if (req.body.designQuantity !== undefined) upd.designQuantity = req.body.designQuantity.toString();
  if (req.body.fieldQuantity !== undefined) upd.fieldQuantity = req.body.fieldQuantity.toString();
  if (req.body.wasteFactor !== undefined) upd.wasteFactor = req.body.wasteFactor.toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(qtoItemsTable).set(upd).where(and(eq(qtoItemsTable.id, id), eq(qtoItemsTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, designQuantity: Number(row.designQuantity), fieldQuantity: Number(row.fieldQuantity), wasteFactor: Number(row.wasteFactor) });
  audit(req, "qto.updated", "qto_item", { resourceId: id, oldValues: { description: current.description }, newValues: { description: row.description } });
});

// ─── Payment Certificates (صورت‌وضعیت) ────────────────────────────────────────

router.get("/contracts/:contractId/payment-certificates", requirePermission("contracts.read"), async (req, res): Promise<void> => {
  const contractId = Number(req.params.contractId);
  const [contract] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, contractId), eq(contractsTable.organizationId, tenantId(req))));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  const rows = await db.select().from(paymentCertificatesTable).where(and(
    eq(paymentCertificatesTable.contractId, contractId),
    eq(paymentCertificatesTable.organizationId, tenantId(req)),
    isNull(paymentCertificatesTable.deletedAt),
  )).orderBy(desc(paymentCertificatesTable.createdAt));
  res.json(rows.map(r => ({ ...r, previousCumulative: Number(r.previousCumulative), thisPeriod: Number(r.thisPeriod), deductions: Number(r.deductions), retention: Number(r.retention), netPayable: Number(r.netPayable), cumulativeToDate: Number(r.cumulativeToDate) })));
});

router.post("/contracts/:contractId/payment-certificates", requirePermission("contracts.create"), async (req, res): Promise<void> => {
  const contractId = Number(req.params.contractId);
  const { title, certificateNumber, periodStart, periodEnd, thisPeriod, deductions, retention, notes } = req.body;
  const [contract] = await db.select().from(contractsTable).where(and(eq(contractsTable.id, contractId), eq(contractsTable.organizationId, tenantId(req))));
  if (!contract) { res.status(404).json({ error: "Contract not found" }); return; }
  if (!title || !certificateNumber || !periodStart || !periodEnd) { res.status(400).json({ error: "title, certificateNumber, periodStart, periodEnd are required" }); return; }
  // Get previous cumulative from last certificate
  const [lastCert] = await db.select().from(paymentCertificatesTable).where(and(
    eq(paymentCertificatesTable.contractId, contractId),
    eq(paymentCertificatesTable.organizationId, tenantId(req)),
    isNull(paymentCertificatesTable.deletedAt),
  )).orderBy(desc(paymentCertificatesTable.createdAt)).limit(1);
  const previousCumulative = lastCert ? Number(lastCert.cumulativeToDate) : 0;
  const thisPeriodVal = Number(thisPeriod) || 0;
  const deductionsVal = Number(deductions) || 0;
  const retentionVal = Number(retention) || 0;
  const netPayable = thisPeriodVal - deductionsVal - retentionVal;
  const cumulativeToDate = previousCumulative + netPayable;
  const [row] = await db.insert(paymentCertificatesTable).values({
    contractId, organizationId: tenantId(req), title, certificateNumber, periodStart, periodEnd,
    previousCumulative: previousCumulative.toString(), thisPeriod: thisPeriodVal.toString(),
    deductions: deductionsVal.toString(), retention: retentionVal.toString(),
    netPayable: netPayable.toString(), cumulativeToDate: cumulativeToDate.toString(),
    notes, createdBy: req.vetraUser!.id,
  }).returning();
  res.status(201).json({ ...row, previousCumulative: Number(row.previousCumulative), thisPeriod: Number(row.thisPeriod), deductions: Number(row.deductions), retention: Number(row.retention), netPayable: Number(row.netPayable), cumulativeToDate: Number(row.cumulativeToDate) });
  audit(req, "payment_certificate.created", "payment_certificate", { resourceId: row.id, newValues: { title, certificateNumber, contractId } });
});

router.patch("/contracts/:contractId/payment-certificates/:id", requirePermission("contracts.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(paymentCertificatesTable).where(and(eq(paymentCertificatesTable.id, id), eq(paymentCertificatesTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Payment certificate not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Only draft certificates can be edited" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["title", "certificateNumber", "periodStart", "periodEnd", "notes"] as const) if (req.body[k] !== undefined) upd[k] = req.body[k];
  if (req.body.thisPeriod !== undefined) upd.thisPeriod = req.body.thisPeriod.toString();
  if (req.body.deductions !== undefined) upd.deductions = req.body.deductions.toString();
  if (req.body.retention !== undefined) upd.retention = req.body.retention.toString();
  const tp = Number(upd.thisPeriod ?? current.thisPeriod);
  const dd = Number(upd.deductions ?? current.deductions);
  const rt = Number(upd.retention ?? current.retention);
  upd.netPayable = (tp - dd - rt).toString();
  upd.cumulativeToDate = (Number(current.previousCumulative) + Number(upd.netPayable)).toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(paymentCertificatesTable).set(upd).where(and(eq(paymentCertificatesTable.id, id), eq(paymentCertificatesTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, previousCumulative: Number(row.previousCumulative), thisPeriod: Number(row.thisPeriod), deductions: Number(row.deductions), retention: Number(row.retention), netPayable: Number(row.netPayable), cumulativeToDate: Number(row.cumulativeToDate) });
  audit(req, "payment_certificate.updated", "payment_certificate", { resourceId: id, oldValues: { title: current.title }, newValues: { title: row.title } });
});

router.post("/contracts/:contractId/payment-certificates/:id/approve", requirePermission("contracts.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(paymentCertificatesTable).where(and(eq(paymentCertificatesTable.id, id), eq(paymentCertificatesTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Payment certificate not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Only draft certificates can be approved" }); return; }
  const [row] = await db.update(paymentCertificatesTable).set({
    status: "approved", approvedBy: req.vetraUser!.id, approvedAt: new Date(), updatedAt: new Date(),
  }).where(and(eq(paymentCertificatesTable.id, id), eq(paymentCertificatesTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, previousCumulative: Number(row.previousCumulative), thisPeriod: Number(row.thisPeriod), deductions: Number(row.deductions), retention: Number(row.retention), netPayable: Number(row.netPayable), cumulativeToDate: Number(row.cumulativeToDate) });
  audit(req, "payment_certificate.approved", "payment_certificate", { resourceId: id, newValues: { status: "approved" } });
});

export default router;
