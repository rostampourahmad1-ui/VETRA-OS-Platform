import { and, eq } from "drizzle-orm";
import { db, dailyReportMaterialsTable, materialsTable } from "@workspace/db";
import type {
  InsertDailyReportMaterial,
  UpdateDailyReportMaterial,
  DailyReportMaterial,
} from "@workspace/db";
import { verifyDailyReportOwnership } from "./dailyReportWorkforce";

// ─── Validation helpers ──────────────────────────────────────────────────────

/**
 * Computes the closing quantity server-side.
 * Formula: opening + received - consumed + returned
 * Returns null if the result is negative (invalid).
 */
export function computeClosingQuantity(
  opening: number,
  received: number,
  consumed: number,
  returned: number,
): number | null {
  const closing = opening + received - consumed + returned;
  if (closing < 0) return null;
  return roundToPrecision(closing, 3);
}

function roundToPrecision(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

/**
 * Validates that the quantities are logically consistent:
 * - All quantities >= 0
 * - closing = opening + received - consumed + returned >= 0
 */
export function validateMaterialQuantities(input: {
  openingQuantity: number;
  received: number;
  consumed: number;
  returned: number;
}): { valid: true; closing: number } | { valid: false; error: string } {
  if (input.openingQuantity < 0) return { valid: false, error: "Opening quantity must be non-negative" };
  if (input.received < 0) return { valid: false, error: "Received quantity must be non-negative" };
  if (input.consumed < 0) return { valid: false, error: "Consumed quantity must be non-negative" };
  if (input.returned < 0) return { valid: false, error: "Returned quantity must be non-negative" };

  const closing = computeClosingQuantity(
    input.openingQuantity,
    input.received,
    input.consumed,
    input.returned,
  );

  if (closing === null) {
    return { valid: false, error: "Closing quantity must be non-negative. Check opening + received - consumed + returned." };
  }

  return { valid: true, closing };
}

// ─── Ownership verification ──────────────────────────────────────────────────

export async function verifyMaterialOwnership(
  materialId: number,
  organizationId: number,
): Promise<{ id: number; unit: string; organizationId: number } | null> {
  const [material] = await db
    .select({ id: materialsTable.id, unit: materialsTable.unit, organizationId: materialsTable.organizationId })
    .from(materialsTable)
    .where(
      and(
        eq(materialsTable.id, materialId),
        eq(materialsTable.organizationId, organizationId),
      ),
    );
  return material ?? null;
}

export { verifyDailyReportOwnership };

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function listMaterials(
  dailyReportId: number,
  organizationId: number,
): Promise<DailyReportMaterial[]> {
  return db
    .select()
    .from(dailyReportMaterialsTable)
    .where(
      and(
        eq(dailyReportMaterialsTable.dailyReportId, dailyReportId),
        eq(dailyReportMaterialsTable.organizationId, organizationId),
      ),
    );
}

export async function createMaterial(
  input: InsertDailyReportMaterial,
  organizationId: number,
  createdBy: number,
): Promise<DailyReportMaterial> {
  const validation = validateMaterialQuantities(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [row] = await db
    .insert(dailyReportMaterialsTable)
    .values({
      dailyReportId: input.dailyReportId,
      materialId: input.materialId ?? null,
      projectId: input.projectId,
      organizationId,
      openingQuantity: input.openingQuantity.toString(),
      received: input.received.toString(),
      consumed: input.consumed.toString(),
      returned: input.returned.toString(),
      closingQuantity: validation.closing.toString(),
      unit: input.unit,
      notes: input.notes ?? null,
      createdBy,
    })
    .returning();

  return row;
}

export async function updateMaterial(
  entryId: number,
  input: UpdateDailyReportMaterial,
  organizationId: number,
  dailyReportId: number,
): Promise<DailyReportMaterial | null> {
  // Verify the entry belongs to the specified daily report and organization
  const [current] = await db
    .select()
    .from(dailyReportMaterialsTable)
    .where(
      and(
        eq(dailyReportMaterialsTable.id, entryId),
        eq(dailyReportMaterialsTable.dailyReportId, dailyReportId),
        eq(dailyReportMaterialsTable.organizationId, organizationId),
      ),
    );

  if (!current) return null;

  // Build update values
  const openingQuantity = input.openingQuantity !== undefined ? input.openingQuantity : Number(current.openingQuantity);
  const received = input.received !== undefined ? input.received : Number(current.received);
  const consumed = input.consumed !== undefined ? input.consumed : Number(current.consumed);
  const returned = input.returned !== undefined ? input.returned : Number(current.returned);

  const validation = validateMaterialQuantities({ openingQuantity, received, consumed, returned });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const upd: Record<string, unknown> = {};
  if (input.materialId !== undefined) upd.materialId = input.materialId;
  if (input.openingQuantity !== undefined) upd.openingQuantity = input.openingQuantity.toString();
  if (input.received !== undefined) upd.received = input.received.toString();
  if (input.consumed !== undefined) upd.consumed = input.consumed.toString();
  if (input.returned !== undefined) upd.returned = input.returned.toString();
  if (input.unit !== undefined) upd.unit = input.unit;
  if (input.notes !== undefined) upd.notes = input.notes;
  upd.closingQuantity = validation.closing.toString();
  upd.updatedAt = new Date();

  const [row] = await db
    .update(dailyReportMaterialsTable)
    .set(upd)
    .where(
      and(
        eq(dailyReportMaterialsTable.id, entryId),
        eq(dailyReportMaterialsTable.organizationId, organizationId),
      ),
    )
    .returning();

  return row ?? null;
}

export async function deleteMaterial(
  entryId: number,
  organizationId: number,
  dailyReportId: number,
): Promise<boolean> {
  const result = await db
    .delete(dailyReportMaterialsTable)
    .where(
      and(
        eq(dailyReportMaterialsTable.id, entryId),
        eq(dailyReportMaterialsTable.dailyReportId, dailyReportId),
        eq(dailyReportMaterialsTable.organizationId, organizationId),
      ),
    );

  return (result as any).rowCount > 0;
}

/**
 * Aggregates material quantities for a daily report.
 * Returns totals for opening, received, consumed, returned, and closing.
 */
export async function aggregateMaterials(
  dailyReportId: number,
  organizationId: number,
): Promise<{
  totalOpening: number;
  totalReceived: number;
  totalConsumed: number;
  totalReturned: number;
  totalClosing: number;
  entryCount: number;
}> {
  const rows = await listMaterials(dailyReportId, organizationId);

  let totalOpening = 0;
  let totalReceived = 0;
  let totalConsumed = 0;
  let totalReturned = 0;
  let totalClosing = 0;

  for (const row of rows) {
    totalOpening += Number(row.openingQuantity);
    totalReceived += Number(row.received);
    totalConsumed += Number(row.consumed);
    totalReturned += Number(row.returned);
    totalClosing += Number(row.closingQuantity);
  }

  return {
    totalOpening: roundToPrecision(totalOpening, 3),
    totalReceived: roundToPrecision(totalReceived, 3),
    totalConsumed: roundToPrecision(totalConsumed, 3),
    totalReturned: roundToPrecision(totalReturned, 3),
    totalClosing: roundToPrecision(totalClosing, 3),
    entryCount: rows.length,
  };
}
