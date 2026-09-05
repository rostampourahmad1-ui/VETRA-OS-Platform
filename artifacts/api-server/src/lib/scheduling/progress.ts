// ─── Progress Tracking Service ─────────────────────────────────────────────────
//
// Aggregation of physical/earned progress across activities using weighted
// averaging. Weights can be planned cost, person-hours, or duration.
// ---------------------------------------------------------------------------

import type { WeightedProgressInput, ProjectProgressResult } from "./types";

/**
 * Compute weighted overall project progress from per-activity progress data.
 */
export function computeWeightedProgress(items: WeightedProgressInput[]): ProjectProgressResult {
  if (items.length === 0) {
    return { overallProgressPercent: 0, weightedScored: 0, totalWeight: 0, activities: [] };
  }

  const totalWeight = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);

  if (totalWeight === 0) {
    const avg = items.reduce((sum, i) => sum + i.progressPercent, 0) / items.length;
    return {
      overallProgressPercent: Math.round(avg * 100) / 100,
      weightedScored: 0,
      totalWeight: 0,
      activities: items.map((i) => ({ activityId: i.activityId, progressPercent: i.progressPercent, weight: i.weight })),
    };
  }

  const weightedScored = items.reduce(
    (sum, i) => sum + Math.max(0, Math.min(100, i.progressPercent)) * Math.max(0, i.weight),
    0,
  );

  const overallProgressPercent = Math.round((weightedScored / totalWeight) * 100) / 100;

  return {
    overallProgressPercent,
    weightedScored: Math.round(weightedScored * 100) / 100,
    totalWeight: Math.round(totalWeight * 100) / 100,
    activities: items.map((i) => ({
      activityId: i.activityId,
      progressPercent: Math.max(0, Math.min(100, i.progressPercent)),
      weight: i.weight,
    })),
  };
}

/**
 * Derive activity status from its progress percentage.
 */
export function deriveActivityStatus(progressPercent: number): string {
  if (progressPercent >= 100) return "completed";
  if (progressPercent > 0) return "in_progress";
  return "not_started";
}

/**
 * Calculate planned progress % at a given date based on activity
 * planned start/finish assuming linear distribution.
 */
export function calculatePlannedProgress(
  plannedStart: string,
  plannedFinish: string,
  durationDays: number,
  asOfDate: string,
): number {
  if (durationDays <= 0) return 0;
  if (asOfDate <= plannedStart) return 0;
  if (asOfDate >= plannedFinish) return 100;

  const start = new Date(plannedStart + "T00:00:00Z").getTime();
  const end = new Date(plannedFinish + "T00:00:00Z").getTime();
  const asOf = new Date(asOfDate + "T00:00:00Z").getTime();

  const elapsed = asOf - start;
  const total = end - start;

  if (total <= 0) return 0;
  return Math.round((elapsed / total) * 100);
}
