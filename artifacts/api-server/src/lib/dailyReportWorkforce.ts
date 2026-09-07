import { db, dailyReportWorkforceTable, dailyReportsTable, employeesTable, projectsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  insertDailyReportWorkforceSchema,
  updateDailyReportWorkforceSchema,
  type InsertDailyReportWorkforce,
  type UpdateDailyReportWorkforce,
  type DailyReportWorkforce,
} from "@workspace/db";

// ─── Validation Helpers ─────────────────────────────────────────────────────

/** Validates and sanitizes a workforce insert payload. */
export function validateWorkforceInsert(body: unknown): InsertDailyReportWorkforce {
  return insertDailyReportWorkforceSchema.parse(body);
}

/** Validates and sanitizes a workforce update payload. */
export function validateWorkforceUpdate(body: unknown): UpdateDailyReportWorkforce {
  return updateDailyReportWorkforceSchema.parse(body);
}

// ─── Ownership & Authorization ──────────────────────────────────────────────

/** Verifies the daily report exists and belongs to the given organization. */
export async function verifyDailyReportOwnership(
  dailyReportId: number,
  organizationId: number,
): Promise<{ projectId: number; organizationId: number } | null> {
  const [report] = await db
    .select({ projectId: dailyReportsTable.projectId, organizationId: dailyReportsTable.organizationId })
    .from(dailyReportsTable)
    .where(
      and(
        eq(dailyReportsTable.id, dailyReportId),
        eq(dailyReportsTable.organizationId, organizationId),
      ),
    );
  return report ? { projectId: report.projectId, organizationId: report.organizationId } : null;
}

/** Verifies the employee exists and belongs to the given organization. */
export async function verifyEmployeeOwnership(
  employeeId: number,
  organizationId: number,
): Promise<boolean> {
  const [employee] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(
      and(
        eq(employeesTable.id, employeeId),
        eq(employeesTable.organizationId, organizationId),
      ),
    );
  return Boolean(employee);
}

// ─── CRUD Operations ────────────────────────────────────────────────────────

/** Lists all workforce entries for a daily report, scoped by organization. */
export async function listWorkforce(
  dailyReportId: number,
  organizationId: number,
): Promise<DailyReportWorkforce[]> {
  return db
    .select()
    .from(dailyReportWorkforceTable)
    .where(
      and(
        eq(dailyReportWorkforceTable.dailyReportId, dailyReportId),
        eq(dailyReportWorkforceTable.organizationId, organizationId),
      ),
    )
    .orderBy(dailyReportWorkforceTable.id);
}

/** Creates a new workforce entry for a daily report. */
export async function createWorkforce(
  data: InsertDailyReportWorkforce,
  organizationId: number,
  createdBy: number,
): Promise<DailyReportWorkforce> {
  const [entry] = await db
    .insert(dailyReportWorkforceTable)
    .values({
      dailyReportId: data.dailyReportId,
      projectId: data.projectId,
      organizationId,
      employeeId: data.employeeId ?? null,
      groupName: data.groupName ?? null,
      role: data.role,
      count: data.count,
      attendanceStatus: data.attendanceStatus,
      hoursWorked: data.hoursWorked.toString(),
      notes: data.notes ?? null,
      createdBy,
    })
    .returning();
  return entry;
}

/** Updates a workforce entry. Returns the updated entry or null if not found. */
export async function updateWorkforce(
  entryId: number,
  data: UpdateDailyReportWorkforce,
  organizationId: number,
  dailyReportId: number,
): Promise<DailyReportWorkforce | null> {
  const upd: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["employeeId", "groupName", "role", "count", "attendanceStatus", "notes"] as const) {
    if (data[key] !== undefined) upd[key] = data[key] ?? null;
  }
  if (data.hoursWorked !== undefined) upd.hoursWorked = data.hoursWorked.toString();

  const [entry] = await db
    .update(dailyReportWorkforceTable)
    .set(upd)
    .where(
      and(
        eq(dailyReportWorkforceTable.id, entryId),
        eq(dailyReportWorkforceTable.dailyReportId, dailyReportId),
        eq(dailyReportWorkforceTable.organizationId, organizationId),
      ),
    )
    .returning();
  return entry ?? null;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/** Aggregates workforce stats for a daily report. */
export async function aggregateWorkforce(
  dailyReportId: number,
  organizationId: number,
): Promise<{
  totalWorkers: number;
  totalHours: number;
  byRole: Array<{ role: string; count: number; hours: number }>;
  byStatus: Array<{ status: string; count: number }>;
}> {
  const entries = await listWorkforce(dailyReportId, organizationId);

  const byRoleMap = new Map<string, { count: number; hours: number }>();
  const byStatusMap = new Map<string, number>();
  let totalWorkers = 0;
  let totalHours = 0;

  for (const entry of entries) {
    totalWorkers += entry.count;
    totalHours += Number(entry.hoursWorked) * entry.count;

    const existing = byRoleMap.get(entry.role) ?? { count: 0, hours: 0 };
    existing.count += entry.count;
    existing.hours += Number(entry.hoursWorked) * entry.count;
    byRoleMap.set(entry.role, existing);

    byStatusMap.set(entry.attendanceStatus, (byStatusMap.get(entry.attendanceStatus) ?? 0) + entry.count);
  }

  return {
    totalWorkers,
    totalHours: Math.round(totalHours * 10) / 10,
    byRole: Array.from(byRoleMap.entries()).map(([role, data]) => ({
      role, count: data.count, hours: Math.round(data.hours * 10) / 10,
    })),
    byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({
      status, count,
    })),
  };
}
