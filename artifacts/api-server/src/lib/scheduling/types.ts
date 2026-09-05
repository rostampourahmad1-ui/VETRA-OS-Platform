// ─── Scheduling Service Types ──────────────────────────────────────────────────

export interface ActivityNode {
  id: number;
  code: string;
  name: string;
  durationDays: number;
  plannedStart: string;
  plannedFinish: string;
}

export interface DependencyEdge {
  id: number;
  predecessorId: number;
  successorId: number;
  dependencyType: "FS" | "SS" | "FF" | "SF";
  lagDays: number;
}

export interface CPMResult {
  activityId: number;
  code: string;
  name: string;
  durationDays: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  isCritical: boolean;
}

export interface CPMOutput {
  projectStartDate: string;
  projectEndDate: string;
  totalDurationDays: number;
  activities: CPMResult[];
  criticalPathIds: number[];
}

export interface WeightedProgressInput {
  activityId: number;
  progressPercent: number;
  weight: number;
}

export interface ProjectProgressResult {
  overallProgressPercent: number;
  weightedScored: number;
  totalWeight: number;
  activities: { activityId: number; progressPercent: number; weight: number }[];
}

export interface EVMInput {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  budgetAtCompletion: number;
  bottomUpEstimateToComplete?: number; /** Optional user-provided bottom-up ETC for alternative EAC variants */
}

export interface EVMOutput {
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  costPerformanceIndex: number;
  schedulePerformanceIndex: number;
  estimateAtCompletion: number;
  estimateToComplete: number;
  varianceAtCompletion: number;
  toCompletePerformanceIndex: number;
  /** EAC = BAC / (CPI * SPI) – accounts for both cost and schedule efficiency */
  eacCpiSpi: number;
  /** ETC for bottom-up approach (same as estimateToComplete when no user input) */
  etcBottomUp: number;
  /** EAC = AC + bottom-up ETC – uses independent estimates for remaining work */
  eacBottomUp: number;
}

/**
 * Calendar-aware scheduling types.
 */
export interface CalendarInfo {
  id: number;
  projectId: number;
  name: string;
  workDays: string;       /** Comma-separated day-of-week numbers, e.g. "1,2,3,4,5,6" */
  workStartHour: string;
  workEndHour: string;
}

export interface CalendarExceptionRecord {
  exceptionDate: string;
  isWorkingDay: number;   /** 1 = extra working day, 0 = holiday/exception */
  description?: string | null;
}
