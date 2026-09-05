import { describe, expect, it } from "vitest";
import { computeCPM, addBusinessDays } from "../artifacts/api-server/src/lib/scheduling/cpm";
import { computeEVM } from "../artifacts/api-server/src/lib/scheduling/evm";
import { computeWeightedProgress, deriveActivityStatus, calculatePlannedProgress } from "../artifacts/api-server/src/lib/scheduling/progress";

// ─── CPM Tests ──────────────────────────────────────────────────────────────

describe("CPM Scheduling Service", () => {
  const activities = [
    { id: 1, code: "A", name: "Activity A", durationDays: 5, plannedStart: "2026-01-01", plannedFinish: "2026-01-06" },
    { id: 2, code: "B", name: "Activity B", durationDays: 3, plannedStart: "2026-01-01", plannedFinish: "2026-01-04" },
    { id: 3, code: "C", name: "Activity C", durationDays: 4, plannedStart: "2026-01-01", plannedFinish: "2026-01-05" },
    { id: 4, code: "D", name: "Activity D", durationDays: 2, plannedStart: "2026-01-01", plannedFinish: "2026-01-03" },
  ];

  it("computes forward pass for activities without dependencies", () => {
    const result = computeCPM(activities, []);
    expect(result.totalDurationDays).toBe(5);
    expect(result.activities).toHaveLength(4);
    for (const a of result.activities) {
      expect(a.earlyStart).toBe(0);
      expect(a.earlyFinish).toBe(a.durationDays);
    }
  });

  it("computes critical path with simple FS dependency", () => {
    const deps = [
      { id: 1, predecessorId: 1, successorId: 2, dependencyType: "FS" as const, lagDays: 0 },
      { id: 2, predecessorId: 2, successorId: 3, dependencyType: "FS" as const, lagDays: 0 },
    ];
    const result = computeCPM(activities.slice(0, 3), deps);
    expect(result.totalDurationDays).toBe(12);
    const actA = result.activities.find((a) => a.activityId === 1)!;
    const actB = result.activities.find((a) => a.activityId === 2)!;
    const actC = result.activities.find((a) => a.activityId === 3)!;
    expect(actA.earlyStart).toBe(0);
    expect(actA.earlyFinish).toBe(5);
    expect(actB.earlyStart).toBe(5);
    expect(actB.earlyFinish).toBe(8);
    expect(actC.earlyStart).toBe(8);
    expect(actC.earlyFinish).toBe(12);
    expect(actA.isCritical).toBe(true);
    expect(actB.isCritical).toBe(true);
    expect(actC.isCritical).toBe(true);
    expect(result.criticalPathIds).toEqual([1, 2, 3]);
  });

  it("parallel activities have float", () => {
    const deps = [
      { id: 1, predecessorId: 1, successorId: 2, dependencyType: "FS" as const, lagDays: 0 },
      { id: 2, predecessorId: 1, successorId: 3, dependencyType: "FS" as const, lagDays: 0 },
    ];
    const result = computeCPM(activities.slice(0, 3), deps);
    expect(result.totalDurationDays).toBe(9);
    const actB = result.activities.find((a) => a.activityId === 2)!;
    const actC = result.activities.find((a) => a.activityId === 3)!;
    expect(actC.isCritical).toBe(true);
    expect(actB.totalFloat).toBeGreaterThanOrEqual(0.9);
  });

  it("handles empty activities gracefully", () => {
    const result = computeCPM([], []);
    expect(result.totalDurationDays).toBe(0);
    expect(result.activities).toHaveLength(0);
    expect(result.criticalPathIds).toHaveLength(0);
  });

  it("addBusinessDays works correctly", () => {
    expect(addBusinessDays("2026-01-01", 0)).toBe("2026-01-01");
    expect(addBusinessDays("2026-01-01", 5)).toBe("2026-01-06");
    expect(addBusinessDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

// ─── EVM Tests ──────────────────────────────────────────────────────────────

describe("EVM Service", () => {
  it("computes standard EVM metrics correctly", () => {
    const result = computeEVM({
      plannedValue: 100,
      earnedValue: 80,
      actualCost: 90,
      budgetAtCompletion: 200,
    });
    expect(result.costVariance).toBe(-10);
    expect(result.scheduleVariance).toBe(-20);
    expect(result.costPerformanceIndex).toBeCloseTo(0.89, 1);
    expect(result.schedulePerformanceIndex).toBeCloseTo(0.80, 1);
    expect(result.estimateAtCompletion).toBeGreaterThan(0);
    expect(result.estimateToComplete).toBeGreaterThan(0);
  });

  it("handles perfect performance (on budget, on schedule)", () => {
    const result = computeEVM({
      plannedValue: 100,
      earnedValue: 100,
      actualCost: 100,
      budgetAtCompletion: 200,
    });
    expect(result.costVariance).toBe(0);
    expect(result.scheduleVariance).toBe(0);
    expect(result.costPerformanceIndex).toBe(1);
    expect(result.schedulePerformanceIndex).toBe(1);
  });

  it("handles division by zero when AC is 0", () => {
    const result = computeEVM({
      plannedValue: 0,
      earnedValue: 0,
      actualCost: 0,
      budgetAtCompletion: 100,
    });
    expect(result.costPerformanceIndex).toBe(1);
    expect(result.costVariance).toBe(0);
  });
});

// ─── Progress Tests ─────────────────────────────────────────────────────────

describe("Progress Service", () => {
  it("computes weighted progress correctly", () => {
    const result = computeWeightedProgress([
      { activityId: 1, progressPercent: 100, weight: 10 },
      { activityId: 2, progressPercent: 50, weight: 10 },
    ]);
    expect(result.overallProgressPercent).toBe(75);
    expect(result.totalWeight).toBe(20);
    expect(result.weightedScored).toBe(1500);
  });

  it("handles zero-weight items with simple average", () => {
    const result = computeWeightedProgress([
      { activityId: 1, progressPercent: 100, weight: 0 },
      { activityId: 2, progressPercent: 50, weight: 0 },
    ]);
    expect(result.overallProgressPercent).toBe(75);
    expect(result.totalWeight).toBe(0);
  });

  it("handles empty input", () => {
    const result = computeWeightedProgress([]);
    expect(result.overallProgressPercent).toBe(0);
    expect(result.activities).toHaveLength(0);
  });

  it("derives activity status from progress percent", () => {
    expect(deriveActivityStatus(0)).toBe("not_started");
    expect(deriveActivityStatus(50)).toBe("in_progress");
    expect(deriveActivityStatus(100)).toBe("completed");
  });

  it("calculates planned progress linearly", () => {
    const result = calculatePlannedProgress("2026-01-01", "2026-01-11", 10, "2026-01-06");
    expect(result).toBeCloseTo(50, 0);
  });
});

// --- Calendar-Aware Scheduling Tests ---

import { countWorkingDays, addWorkingDays, workingDaysToCalendarDays, offsetToCalendarDate } from "../artifacts/api-server/src/lib/scheduling/calendar";
import type { CalendarInfo, CalendarExceptionRecord } from "../artifacts/api-server/src/lib/scheduling/types";

const testCalendar: CalendarInfo = {
  id: 1,
  projectId: 1,
  name: "Standard Work Week",
  workDays: "1,2,3,4,5,6", // Sat-Thu (Persian week: 0=Sun..6=Sat)
  workStartHour: "08:00",
  workEndHour: "17:00",
};

const weekendExceptions: CalendarExceptionRecord[] = [
  { exceptionDate: "2026-01-02", isWorkingDay: 1, description: "Extra working day (Friday)" },
  { exceptionDate: "2026-01-05", isWorkingDay: 0, description: "Holiday (Monday)" },
];

describe("Calendar-Aware Scheduling", () => {
  it("countWorkingDays counts regular working days", () => {
    // 2026-01-01 (Thu) to 2026-01-07 (Wed) = 6 calendar days
    // Working days: Thu, Sat, Sun, Mon, Tue = 5 (Fri is off in Persian week)
    const count = countWorkingDays(testCalendar, [], "2026-01-01", "2026-01-07");
    expect(count).toBe(5);  // Thu,Fri,Sat,Mon,Tue (Sun off, Wed excluded)
  });

  it("countWorkingDays respects exceptions", () => {
    // Mon 2026-01-05 is normally working but marked as holiday
    const count = countWorkingDays(testCalendar, weekendExceptions, "2026-01-01", "2026-01-07");
    // Without exception: Thu,Fri,Sat,Sun,Mon,Tue = 5 (Sun off)
    // With exception: Mon(off) -> Thu,Fri,Sat,Tue = 4
    expect(count).toBe(4);
  });

  it("addWorkingDays adds calendar days respecting work schedule", () => {
    // Start Thu 2026-01-01, add 1 working day -> Fri 2026-01-02
    const result = addWorkingDays(testCalendar, [], "2026-01-01", 1);
    expect(result).toBe("2026-01-02");
  });

  it("addWorkingDays returns start date for zero days", () => {
    const result = addWorkingDays(testCalendar, [], "2026-01-01", 0);
    expect(result).toBe("2026-01-01");
  });

  it("addWorkingDays respects exception overrides", () => {
    // Start Thu 2026-01-01, add 2 working days
    // Without exceptions: day1=Sat(03), day2=Sun(04) 
    // With exceptions (Fri is working): day1=Fri(02), day2=Sat(03)
    const result = addWorkingDays(testCalendar, weekendExceptions, "2026-01-01", 2);
    expect(result).toBe("2026-01-03");
  });

  it("offsetToCalendarDate maps day offset to calendar date", () => {
    // 0 offset = start date
    const result = offsetToCalendarDate(testCalendar, [], "2026-01-01", 0);
    expect(result).toBe("2026-01-01");
    // 1 working day offset -> Fri Jan 2
    const result1 = offsetToCalendarDate(testCalendar, [], "2026-01-01", 1);
    expect(result1).toBe("2026-01-02");
  });

  it("workingDaysToCalendarDays calculates span correctly", () => {
    // 5 working days from Thu Jan 1 = Wed Jan 7 (1 week minus Fri)
    const result = workingDaysToCalendarDays(testCalendar, [], "2026-01-01", 5);
    expect(result).toBe(6); // spans 6 calendar days
  });

  it("handles empty calendar gracefully", () => {
    const emptyCal: CalendarInfo = { ...testCalendar, workDays: "" };
    const count = countWorkingDays(emptyCal, [], "2026-01-01", "2026-01-07");
    expect(count).toBe(0);
  });
});
