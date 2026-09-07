import { and, eq } from "drizzle-orm";
import { db, dailyReportEquipmentTable, equipmentTable, employeesTable } from "@workspace/db";
import type {
  InsertDailyReportEquipment,
  UpdateDailyReportEquipment,
  DailyReportEquipment,
} from "@workspace/db";
import { verifyDailyReportOwnership } from "./dailyReportWorkforce";

// ─── Validation helpers ──────────────────────────────────────────────────────

/**
 * Parses a time string (HH:mm or HH:mm:ss) into total minutes since midnight.
 * Returns null if the format is invalid.
 */
export function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Validates time window constraints server-side:
 * - endTime must be after startTime
 * - operatingHours + idleHours must not exceed the time window
 */
export function validateTimeWindow(input: {
  startTime: string;
  endTime: string;
  operatingHours: number;
  idleHours: number;
}): { valid: true; durationHours: number } | { valid: false; error: string } {
  const startMin = parseTimeToMinutes(input.startTime);
  const endMin = parseTimeToMinutes(input.endTime);

  if (startMin === null || endMin === null) {
    return { valid: false, error: "startTime and endTime must be in HH:mm format" };
  }
  if (endMin <= startMin) {
    return { valid: false, error: "endTime must be after startTime" };
  }
  if (input.operatingHours < 0 || input.idleHours < 0) {
    return { valid: false, error: "operatingHours and idleHours must be non-negative" };
  }
  if (input.operatingHours > 24 || input.idleHours > 24) {
    return { valid: false, error: "operatingHours and idleHours must not exceed 24" };
  }

  const durationHours = (endMin - startMin) / 60;
  const totalHours = input.operatingHours + input.idleHours;

  if (totalHours > durationHours + 0.1) {
    return {
      valid: false,
      error: `operatingHours + idleHours (${totalHours}) must not exceed the time window (${durationHours.toFixed(1)}h)`,
    };
  }

  return { valid: true, durationHours };
}

// ─── Ownership verification ──────────────────────────────────────────────────

/**
 * Verifies that equipment belongs to the given organization, optionally
 * restricted to a specific project. Equipment with no project assignment
 * (projectId=null) is valid for any project within the organization.
 */
export async function verifyEquipmentOwnership(
  equipmentId: number,
  organizationId: number,
  projectId?: number,
): Promise<{ id: number; name: string; projectId: number | null; organizationId: number } | null> {
  const filters = [
    eq(equipmentTable.id, equipmentId),
    eq(equipmentTable.organizationId, organizationId),
  ];
  const [equipment] = await db
    .select({
      id: equipmentTable.id,
      name: equipmentTable.name,
      projectId: equipmentTable.projectId,
      organizationId: equipmentTable.organizationId,
    })
    .from(equipmentTable)
    .where(and(...filters));

  if (!equipment) return null;

  // If equipment is assigned to a project, it must match the given projectId
  if (projectId !== undefined && equipment.projectId !== null && equipment.projectId !== projectId) {
    return null;
  }

  return equipment;
}

/**
 * Verifies that an operator (employee) belongs to the given organization
 * and optionally is assigned to the project.
 */
export async function verifyOperatorOwnership(
  operatorId: number,
  organizationId: number,
  projectId?: number,
): Promise<{ id: number; firstName: string; lastName: string; organizationId: number } | null> {
  const filters = [
    eq(employeesTable.id, operatorId),
    eq(employeesTable.organizationId, organizationId),
  ];
  const [employee] = await db
    .select({
      id: employeesTable.id,
      firstName: employeesTable.firstName,
      lastName: employeesTable.lastName,
      organizationId: employeesTable.organizationId,
    })
    .from(employeesTable)
    .where(and(...filters));

  if (!employee) return null;

  return employee;
}

export { verifyDailyReportOwnership };

// ─── CRUD Operations ─────────────────────────────────────────────────────────

export async function listEquipment(
  dailyReportId: number,
  organizationId: number,
): Promise<DailyReportEquipment[]> {
  return db
    .select()
    .from(dailyReportEquipmentTable)
    .where(
      and(
        eq(dailyReportEquipmentTable.dailyReportId, dailyReportId),
        eq(dailyReportEquipmentTable.organizationId, organizationId),
      ),
    )
    .orderBy(dailyReportEquipmentTable.id);
}

export async function createEquipment(
  input: InsertDailyReportEquipment,
  organizationId: number,
  createdBy: number,
): Promise<DailyReportEquipment> {
  const validation = validateTimeWindow(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const [row] = await db
    .insert(dailyReportEquipmentTable)
    .values({
      dailyReportId: input.dailyReportId,
      equipmentId: input.equipmentId,
      projectId: input.projectId,
      organizationId,
      operatorId: input.operatorId ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      operatingHours: input.operatingHours.toString(),
      idleHours: input.idleHours.toString(),
      status: input.status,
      notes: input.notes ?? null,
      createdBy,
    })
    .returning();

  return row;
}

export async function updateEquipment(
  entryId: number,
  input: UpdateDailyReportEquipment,
  organizationId: number,
  dailyReportId: number,
): Promise<DailyReportEquipment | null> {
  // Verify the entry belongs to the specified daily report and organization
  const [current] = await db
    .select()
    .from(dailyReportEquipmentTable)
    .where(
      and(
        eq(dailyReportEquipmentTable.id, entryId),
        eq(dailyReportEquipmentTable.dailyReportId, dailyReportId),
        eq(dailyReportEquipmentTable.organizationId, organizationId),
      ),
    );

  if (!current) return null;

  // Build update values with fallbacks to current values
  const startTime = input.startTime ?? current.startTime;
  const endTime = input.endTime ?? current.endTime;
  const operatingHours = input.operatingHours ?? Number(current.operatingHours);
  const idleHours = input.idleHours ?? Number(current.idleHours);

  const validation = validateTimeWindow({ startTime, endTime, operatingHours, idleHours });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const upd: Record<string, unknown> = {};
  if (input.equipmentId !== undefined) upd.equipmentId = input.equipmentId;
  if (input.operatorId !== undefined) upd.operatorId = input.operatorId ?? null;
  if (input.startTime !== undefined) upd.startTime = input.startTime;
  if (input.endTime !== undefined) upd.endTime = input.endTime;
  if (input.operatingHours !== undefined) upd.operatingHours = input.operatingHours.toString();
  if (input.idleHours !== undefined) upd.idleHours = input.idleHours.toString();
  if (input.status !== undefined) upd.status = input.status;
  if (input.notes !== undefined) upd.notes = input.notes ?? null;
  upd.updatedAt = new Date();

  const [row] = await db
    .update(dailyReportEquipmentTable)
    .set(upd)
    .where(
      and(
        eq(dailyReportEquipmentTable.id, entryId),
        eq(dailyReportEquipmentTable.organizationId, organizationId),
      ),
    )
    .returning();

  return row ?? null;
}

export async function deleteEquipment(
  entryId: number,
  organizationId: number,
  dailyReportId: number,
): Promise<boolean> {
  const result = await db
    .delete(dailyReportEquipmentTable)
    .where(
      and(
        eq(dailyReportEquipmentTable.id, entryId),
        eq(dailyReportEquipmentTable.dailyReportId, dailyReportId),
        eq(dailyReportEquipmentTable.organizationId, organizationId),
      ),
    );

  return (result as any).rowCount > 0;
}

/**
 * Aggregates equipment usage for a daily report.
 * Returns totals for operating hours, idle hours, and counts by status.
 */
export async function aggregateEquipment(
  dailyReportId: number,
  organizationId: number,
): Promise<{
  totalOperatingHours: number;
  totalIdleHours: number;
  totalEntries: number;
  byStatus: Array<{ status: string; count: number; operatingHours: number; idleHours: number }>;
}> {
  const rows = await listEquipment(dailyReportId, organizationId);

  const byStatusMap = new Map<string, { count: number; operatingHours: number; idleHours: number }>();
  let totalOperatingHours = 0;
  let totalIdleHours = 0;

  for (const row of rows) {
    const opHours = Number(row.operatingHours);
    const idHours = Number(row.idleHours);
    totalOperatingHours += opHours;
    totalIdleHours += idHours;

    const existing = byStatusMap.get(row.status) ?? { count: 0, operatingHours: 0, idleHours: 0 };
    existing.count += 1;
    existing.operatingHours += opHours;
    existing.idleHours += idHours;
    byStatusMap.set(row.status, existing);
  }

  return {
    totalOperatingHours: Math.round(totalOperatingHours * 10) / 10,
    totalIdleHours: Math.round(totalIdleHours * 10) / 10,
    totalEntries: rows.length,
    byStatus: Array.from(byStatusMap.entries()).map(([status, data]) => ({
      status,
      count: data.count,
      operatingHours: Math.round(data.operatingHours * 10) / 10,
      idleHours: Math.round(data.idleHours * 10) / 10,
    })),
  };
}
