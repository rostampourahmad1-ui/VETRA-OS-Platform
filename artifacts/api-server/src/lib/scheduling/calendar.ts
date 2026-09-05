// ─── Calendar-Aware Scheduling Service ─────────────────────────────────────────
//
// Computes working-day offsets and calendar-aware date arithmetic using
// project_calendars (workDays, work hours) and calendar_exceptions
// (holidays / extra working days).
// ---------------------------------------------------------------------------

import type { CalendarInfo, CalendarExceptionRecord } from "./types";

/**
 * Count the number of working days between two dates (inclusive of start,
 * exclusive of end) according to a calendar profile and its exceptions.
 */
export function countWorkingDays(
  calendar: CalendarInfo,
  exceptions: CalendarExceptionRecord[],
  startDate: string,
  endDate: string,
): number {
  const workDaySet = new Set(
    calendar.workDays.split(",").map((d) => d.trim()).filter(Boolean).map(Number),
  );
  const exceptionMap = new Map<string, number>();
  for (const ex of exceptions) {
    exceptionMap.set(ex.exceptionDate, ex.isWorkingDay);
  }

  let count = 0;
  const current = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");

  while (current < end) {
    const dateStr = current.toISOString().split("T")[0];
    const dow = current.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const exception = exceptionMap.get(dateStr);

    if (exception !== undefined) {
      // Explicit exception overrides the normal workDays rule
      if (exception === 1) count++;
    } else if (workDaySet.has(dow)) {
      count++;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/**
 * Add N working days to a start date using the calendar.
 * Returns the resulting date string (YYYY-MM-DD).
 */
export function addWorkingDays(
  calendar: CalendarInfo,
  exceptions: CalendarExceptionRecord[],
  startDate: string,
  workingDays: number,
): string {
  if (workingDays <= 0) return startDate;

  const workDaySet = new Set(
    calendar.workDays.split(",").map((d) => d.trim()).filter(Boolean).map(Number),
  );
  const exceptionMap = new Map<string, number>();
  for (const ex of exceptions) {
    exceptionMap.set(ex.exceptionDate, ex.isWorkingDay);
  }

  let daysAdded = 0;
  const current = new Date(startDate + "T00:00:00Z");

  while (daysAdded < workingDays) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dateStr = current.toISOString().split("T")[0];
    const dow = current.getUTCDay();
    const exception = exceptionMap.get(dateStr);

    let isWorkDay: boolean;
    if (exception !== undefined) {
      isWorkDay = exception === 1;
    } else {
      isWorkDay = workDaySet.has(dow);
    }

    if (isWorkDay) {
      daysAdded++;
    }
  }

  return current.toISOString().split("T")[0];
}

/**
 * Calculate the number of calendar days spanned by a given number of
 * working days starting from startDate (calendar-aware).
 */
export function workingDaysToCalendarDays(
  calendar: CalendarInfo,
  exceptions: CalendarExceptionRecord[],
  startDate: string,
  workingDays: number,
): number {
  if (workingDays <= 0) return 0;

  const endDate = addWorkingDays(calendar, exceptions, startDate, workingDays);
  const start = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Convert a calendar-days offset (simple CPM offset) into actual calendar
 * dates using the project's calendar.
 */
export function offsetToCalendarDate(
  calendar: CalendarInfo,
  exceptions: CalendarExceptionRecord[],
  startDate: string,
  offsetDays: number,
): string {
  // offsetDays from CPM are in simple day units. Convert to working days
  // by scanning forward and counting only working days.
  if (offsetDays <= 0) return startDate;

  const workDaySet = new Set(
    calendar.workDays.split(",").map((d) => d.trim()).filter(Boolean).map(Number),
  );
  const exceptionMap = new Map<string, number>();
  for (const ex of exceptions) {
    exceptionMap.set(ex.exceptionDate, ex.isWorkingDay);
  }

  let daysPassed = 0;
  const current = new Date(startDate + "T00:00:00Z");

  while (daysPassed < offsetDays) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dateStr = current.toISOString().split("T")[0];
    const dow = current.getUTCDay();
    const exception = exceptionMap.get(dateStr);

    let isWorkDay: boolean;
    if (exception !== undefined) {
      isWorkDay = exception === 1;
    } else {
      isWorkDay = workDaySet.has(dow);
    }

    if (isWorkDay) {
      daysPassed++;
    }
  }

  return current.toISOString().split("T")[0];
}