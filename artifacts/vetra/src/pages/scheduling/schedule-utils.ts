import { formatJalali, persianNumber } from "@/lib/jalali";
import type {
  PlanningActivity,
  WorkBreakdownStructure,
} from "@workspace/api-client-react";
import {
  addMonths as addJalaliMonths,
  startOfMonth as startOfJalaliMonth,
} from "date-fns-jalali";

export type ScheduleScale = "day" | "week" | "month";

export type ScheduleDependency = {
  id: number;
  predecessorId: number;
  successorId: number;
  dependencyType: "FS" | "SS" | "FF" | "SF";
  lagDays: number;
};

export type ScheduleRow = {
  id: string;
  kind: "summary" | "activity";
  level: number;
  code: string;
  name: string;
  wbsId?: number;
  activity?: PlanningActivity;
  start?: string;
  finish?: string;
  durationDays?: number;
  predecessor?: string;
  weight: string;
  status?: PlanningActivity["status"];
  activityType?: PlanningActivity["activityType"];
};

const DAY_MS = 86_400_000;

export function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

export function dateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, amount: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateToIso(date);
}

export function jalaliMonthStart(value: string): string {
  return dateToIso(startOfJalaliMonth(parseIsoDate(value)));
}

export function addJalaliMonthsIso(value: string, amount: number): string {
  return dateToIso(addJalaliMonths(parseIsoDate(value), amount));
}

export function daysBetween(start: string, finish: string): number {
  return Math.round(
    (parseIsoDate(finish).getTime() - parseIsoDate(start).getTime()) / DAY_MS,
  );
}

export function inclusiveDuration(start: string, finish: string): number {
  return Math.max(1, daysBetween(start, finish) + 1);
}

export function shiftActivity(
  activity: PlanningActivity,
  deltaDays: number,
): Pick<PlanningActivity, "plannedStart" | "plannedFinish"> {
  return {
    plannedStart: addDays(activity.plannedStart, deltaDays),
    plannedFinish: addDays(activity.plannedFinish, deltaDays),
  };
}

export function resizeActivity(
  activity: PlanningActivity,
  deltaDays: number,
): Pick<PlanningActivity, "plannedFinish" | "durationDays"> {
  const durationDays = Math.max(0, activity.durationDays + deltaDays);
  return {
    durationDays,
    plannedFinish: addDays(
      activity.plannedStart,
      Math.max(0, durationDays - 1),
    ),
  };
}

function activityDates(activities: PlanningActivity[]): {
  start?: string;
  finish?: string;
} {
  if (activities.length === 0) return {};
  return activities.reduce(
    (range, activity) => ({
      start:
        !range.start || activity.plannedStart < range.start
          ? activity.plannedStart
          : range.start,
      finish:
        !range.finish || activity.plannedFinish > range.finish
          ? activity.plannedFinish
          : range.finish,
    }),
    {} as { start?: string; finish?: string },
  );
}

export function buildScheduleRows(
  wbsItems: WorkBreakdownStructure[],
  activities: PlanningActivity[],
  dependencies: ScheduleDependency[],
  collapsed: Set<number>,
): ScheduleRow[] {
  const childrenByParent = new Map<number | null, WorkBreakdownStructure[]>();
  const activitiesByWbs = new Map<number, PlanningActivity[]>();
  const activityById = new Map(
    activities.map((activity) => [activity.id, activity]),
  );

  for (const item of wbsItems) {
    const children = childrenByParent.get(item.parentId ?? null) ?? [];
    children.push(item);
    childrenByParent.set(item.parentId ?? null, children);
  }
  for (const item of wbsItems) {
    childrenByParent
      .get(item.parentId ?? null)
      ?.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
      );
  }
  for (const activity of activities) {
    const items = activitiesByWbs.get(activity.wbsId) ?? [];
    items.push(activity);
    activitiesByWbs.set(activity.wbsId, items);
  }
  for (const items of activitiesByWbs.values()) {
    items.sort(
      (a, b) =>
        a.plannedStart.localeCompare(b.plannedStart) ||
        a.code.localeCompare(b.code),
    );
  }

  const descendants = (wbsId: number): PlanningActivity[] => {
    const own = activitiesByWbs.get(wbsId) ?? [];
    const children = wbsItems.filter((item) => item.parentId === wbsId);
    return own.concat(children.flatMap((child) => descendants(child.id)));
  };

  const predecessorByActivity = new Map<number, string>();
  for (const dependency of dependencies) {
    const predecessor = activityById.get(dependency.predecessorId);
    if (predecessor)
      predecessorByActivity.set(dependency.successorId, predecessor.code);
  }

  const rows: ScheduleRow[] = [];
  const visit = (item: WorkBreakdownStructure, level: number) => {
    const descendantsForItem = descendants(item.id);
    const range = activityDates(descendantsForItem);
    rows.push({
      id: `wbs-${item.id}`,
      kind: "summary",
      level,
      code: item.code,
      name: item.name,
      wbsId: item.id,
      start: range.start,
      finish: range.finish,
      durationDays:
        range.start && range.finish
          ? inclusiveDuration(range.start, range.finish)
          : undefined,
      weight: "—",
    });

    if (collapsed.has(item.id)) return;
    for (const activity of activitiesByWbs.get(item.id) ?? []) {
      rows.push({
        id: `activity-${activity.id}`,
        kind: "activity",
        level: level + 1,
        code: activity.code,
        name: activity.name,
        wbsId: item.id,
        activity,
        start: activity.plannedStart,
        finish: activity.plannedFinish,
        durationDays: activity.durationDays,
        predecessor: predecessorByActivity.get(activity.id),
        weight: "—",
        status: activity.status,
        activityType: activity.activityType,
      });
    }
    for (const child of childrenByParent.get(item.id) ?? [])
      visit(child, level + 1);
  };

  const wbsIds = new Set(wbsItems.map((item) => item.id));
  const roots = wbsItems.filter(
    (item) => item.parentId == null || !wbsIds.has(item.parentId),
  );
  roots.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  for (const root of roots) visit(root, 0);

  const existingWbsIds = new Set(wbsItems.map((item) => item.id));
  const ungrouped = activities.filter(
    (activity) => !existingWbsIds.has(activity.wbsId),
  );
  if (ungrouped.length > 0) {
    for (const activity of ungrouped) {
      rows.push({
        id: `activity-${activity.id}`,
        kind: "activity",
        level: 0,
        code: activity.code,
        name: activity.name,
        activity,
        start: activity.plannedStart,
        finish: activity.plannedFinish,
        durationDays: activity.durationDays,
        predecessor: predecessorByActivity.get(activity.id),
        weight: "—",
        status: activity.status,
        activityType: activity.activityType,
      });
    }
  }

  return rows;
}

export function getScheduleRange(
  rows: ScheduleRow[],
): { start: string; finish: string } | null {
  const dated = rows.filter(
    (row): row is ScheduleRow & { start: string; finish: string } =>
      Boolean(row.start && row.finish),
  );
  if (dated.length === 0) return null;
  const start = dated.reduce(
    (value, row) => (row.start < value ? row.start : value),
    dated[0].start,
  );
  const finish = dated.reduce(
    (value, row) => (row.finish > value ? row.finish : value),
    dated[0].finish,
  );
  return { start: addDays(start, -2), finish: addDays(finish, 3) };
}

export function scaleToPixelsPerDay(scale: ScheduleScale): number {
  if (scale === "day") return 44;
  if (scale === "month") return 9;
  return 20;
}

export function formatScaleLabel(date: string, scale: ScheduleScale): string {
  if (scale === "month") return formatJalali(date, "MMMM yyyy");
  if (scale === "week")
    return `هفتهٔ ${persianNumber(formatJalali(date, "ww"))}`;
  return formatJalali(date, "d");
}

export function formatSubScaleLabel(
  date: string,
  scale: ScheduleScale,
): string {
  if (scale === "month") return formatJalali(date, "yyyy");
  if (scale === "week") return formatJalali(date, "d MMM");
  return formatJalali(date, "EEE");
}

export function buildScaleTicks(
  range: { start: string; finish: string },
  scale: ScheduleScale,
): string[] {
  const ticks: string[] = [];
  let cursor = scale === "month" ? jalaliMonthStart(range.start) : range.start;
  while (cursor <= range.finish) {
    ticks.push(cursor);
    cursor =
      scale === "day"
        ? addDays(cursor, 1)
        : scale === "week"
          ? addDays(cursor, 7)
          : addJalaliMonthsIso(cursor, 1);
    if (ticks.length > 240) break;
  }
  return ticks;
}

export function isCompleted(activity?: PlanningActivity): boolean {
  return activity?.status === "completed";
}
