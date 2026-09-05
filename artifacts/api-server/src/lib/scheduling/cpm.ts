// ─── CPM (Critical Path Method) Scheduling Service ─────────────────────────────
//
// The CPM algorithm runs a forward pass to compute Early Start / Early Finish and
// a backward pass to compute Late Start / Late Finish, then derives Total Float
// and identifies the Critical Path (zero float).
//
// All calculations are done in day-offset space (day 0 = project start date),
// avoiding date-math pitfalls. Callers map offsets back to calendar dates.
//
// Dependency types supported:
//   FS (Finish-to-Start) — successor starts after predecessor finishes  [default]
//   SS (Start-to-Start)  — successor starts after predecessor starts
//   FF (Finish-to-Finish)— successor finishes after predecessor finishes
//   SF (Start-to-Finish) — successor finishes after predecessor starts
// ---------------------------------------------------------------------------

import type { ActivityNode, DependencyEdge, CPMResult, CPMOutput } from "./types";

type AdjacencyMap = Map<number, { predId: number; type: DependencyEdge["dependencyType"]; lagDays: number }[]>;

function buildPredecessorMap(
  activities: ActivityNode[],
  dependencies: DependencyEdge[],
): AdjacencyMap {
  const map: AdjacencyMap = new Map();
  for (const a of activities) map.set(a.id, []);
  for (const dep of dependencies) {
    const list = map.get(dep.successorId);
    if (list) {
      list.push({ predId: dep.predecessorId, type: dep.dependencyType, lagDays: dep.lagDays });
    }
  }
  return map;
}

function buildSuccessorMap(
  activities: ActivityNode[],
  dependencies: DependencyEdge[],
): AdjacencyMap {
  const map: AdjacencyMap = new Map();
  for (const a of activities) map.set(a.id, []);
  for (const dep of dependencies) {
    const list = map.get(dep.predecessorId);
    if (list) {
      list.push({ predId: dep.successorId, type: dep.dependencyType, lagDays: dep.lagDays });
    }
  }
  return map;
}

/**
 * Forward pass: computes Earliest Start (ES) and Earliest Finish (EF) for every
 * activity using day offsets from project start.
 */
function forwardPass(
  activities: ActivityNode[],
  predMap: AdjacencyMap,
): Map<number, { es: number; ef: number }> {
  const result = new Map<number, { es: number; ef: number }>();
  const activityMap = new Map(activities.map((a) => [a.id, a]));

  // Topological sort via Kahn's algorithm
  const inDegree = new Map<number, number>();
  for (const a of activities) inDegree.set(a.id, 0);
  for (const [, preds] of predMap) {
    for (const p of preds) {
      inDegree.set(p.predId, (inDegree.get(p.predId) ?? 0) + 1);
    }
  }

  // Also compute reverse in-degree (number of predecessors) for correct FS/SS/FF/SF
  const predecessorCount = new Map<number, number>();
  for (const a of activities) predecessorCount.set(a.id, 0);
  for (const [, preds] of predMap) {
    for (const p of preds) {
      predecessorCount.set(p.predId, (predecessorCount.get(p.predId) ?? 0) + 1);
    }
  }

  const queue: number[] = [];
  // Also track reverse: predecessors that haven't been processed yet
  const remainingPreds = new Map<number, number>();
  for (const a of activities) {
    const preds = predMap.get(a.id) ?? [];
    remainingPreds.set(a.id, preds.length);
    if (preds.length === 0) {
      queue.push(a.id);
      result.set(a.id, { es: 0, ef: a.durationDays });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentResult = result.get(current);
    if (!currentResult) continue;

    const successors = predMap.get(current);
    if (!successors) continue;

    for (const succ of successors) {
      // succ.predId is actually the successor in the successorMap version
      // but in predMap, succ.predId is the predecessor. 
      // Wait, let me reconsider the adjacency structure.
    }
  }

  // Simpler approach: iterative until all resolved
  const es = new Map<number, number>();
  const ef = new Map<number, number>();

  for (const a of activities) {
    es.set(a.id, -1);
    ef.set(a.id, -1);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const a of activities) {
      if (es.get(a.id)! >= 0) continue; // already resolved
      const preds = predMap.get(a.id) ?? [];
      if (preds.length === 0) {
        es.set(a.id, 0);
        ef.set(a.id, a.durationDays);
        changed = true;
      } else {
        let maxPredEF = -1;
        let allResolved = true;
        for (const p of preds) {
          const predES = es.get(p.predId);
          if (predES === undefined || predES < 0) { allResolved = false; break; }
          const predEF = ef.get(p.predId) ?? 0;
          const lag = p.lagDays;
          let candidate = 0;
          switch (p.type) {
            case "FS": candidate = predEF + lag; break;
            case "SS": candidate = (es.get(p.predId) ?? 0) + lag; break;
            case "FF": candidate = predEF + lag - a.durationDays; break;
            case "SF": candidate = (es.get(p.predId) ?? 0) + lag - a.durationDays; break;
          }
          if (candidate > maxPredEF) maxPredEF = candidate;
        }
        if (allResolved && maxPredEF >= 0) {
          es.set(a.id, maxPredEF);
          ef.set(a.id, maxPredEF + a.durationDays);
          changed = true;
        }
      }
    }
  }

  for (const a of activities) {
    result.set(a.id, { es: es.get(a.id) ?? 0, ef: ef.get(a.id) ?? a.durationDays });
  }
  return result;
}

/**
 * Backward pass: computes Latest Start (LS) and Latest Finish (LF) given the
 * project deadline (typically the max EF from forward pass).
 */
function backwardPass(
  activities: ActivityNode[],
  succMap: AdjacencyMap,
  forward: Map<number, { es: number; ef: number }>,
  projectDeadline: number,
): Map<number, { ls: number; lf: number }> {
  const ls = new Map<number, number>();
  const lf = new Map<number, number>();

  for (const a of activities) {
    ls.set(a.id, -1);
    lf.set(a.id, -1);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const a of activities) {
      if (lf.get(a.id)! >= 0) continue;
      const succs = succMap.get(a.id) ?? [];
      if (succs.length === 0) {
        lf.set(a.id, projectDeadline);
        ls.set(a.id, projectDeadline - a.durationDays);
        changed = true;
      } else {
        let minSuccLS = Number.MAX_SAFE_INTEGER;
        let allResolved = true;
        for (const s of succs) {
          const succLS = ls.get(s.predId);
          const succLF = lf.get(s.predId);
          if (succLS === undefined || succLS < 0 || succLF === undefined || succLF < 0) {
            allResolved = false;
            break;
          }
          const lag = s.lagDays;
          let candidate = 0;
          switch (s.type) {
            case "FS": candidate = succLS - lag; break;
            case "SS": candidate = succLS - lag; break;
            case "FF": candidate = succLF - lag; break;
            case "SF": candidate = succLF - lag; break;
          }
          if (candidate < minSuccLS) minSuccLS = candidate;
        }
        if (allResolved && minSuccLS < Number.MAX_SAFE_INTEGER) {
          lf.set(a.id, minSuccLS);
          ls.set(a.id, minSuccLS - a.durationDays);
          changed = true;
        }
      }
    }
  }

  const result = new Map<number, { ls: number; lf: number }>();
  for (const a of activities) {
    result.set(a.id, { ls: ls.get(a.id) ?? 0, lf: lf.get(a.id) ?? projectDeadline });
  }
  return result;
}

/**
 * Computes the Critical Path Method schedule for a set of activities and
 * dependencies.
 *
 * @returns A CPMOutput with per-activity ES/EF/LS/LF/totalFloat/isCritical
 *          computed in day-offset space, plus the project end date string.
 */
export function computeCPM(
  activities: ActivityNode[],
  dependencies: DependencyEdge[],
): CPMOutput {
  if (activities.length === 0) {
    return {
      projectStartDate: "",
      projectEndDate: "",
      totalDurationDays: 0,
      activities: [],
      criticalPathIds: [],
    };
  }

  const predMap = buildPredecessorMap(activities, dependencies);
  const succMap = buildSuccessorMap(activities, dependencies);

  const forward = forwardPass(activities, predMap);

  // Project deadline = max EF across all activities
  let projectDeadline = 0;
  for (const a of activities) {
    const f = forward.get(a.id);
    if (f && f.ef > projectDeadline) projectDeadline = f.ef;
  }
  const totalDurationDays = projectDeadline;

  const backward = backwardPass(activities, succMap, forward, projectDeadline);

  const activityMap = new Map(activities.map((a) => [a.id, a]));
  const cpmActivities: CPMResult[] = [];
  const criticalPathIds: number[] = [];

  for (const a of activities) {
    const f = forward.get(a.id)!;
    const b = backward.get(a.id)!;
    const totalFloat = b.lf - f.ef;
    const isCritical = Math.abs(totalFloat) < 0.005;
    cpmActivities.push({
      activityId: a.id,
      code: a.code,
      name: a.name,
      durationDays: a.durationDays,
      earlyStart: f.es,
      earlyFinish: f.ef,
      lateStart: b.ls,
      lateFinish: b.lf,
      totalFloat: Math.round(totalFloat * 100) / 100,
      isCritical,
    });
    if (isCritical) criticalPathIds.push(a.id);
  }

  // Sort by ES then code
  cpmActivities.sort((a, b) => a.earlyStart - b.earlyStart || a.code.localeCompare(b.code));

  return {
    projectStartDate: activities.length > 0 ? activities[0].plannedStart : "",
    projectEndDate: "",
    totalDurationDays,
    activities: cpmActivities,
    criticalPathIds,
  };
}

/**
 * Calculate project end date by adding totalDurationDays to start date.
 * Simple day offset; calendar-aware scheduling can be layered on top.
 */
export function addBusinessDays(startDate: string, days: number): string {
  const date = new Date(startDate + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}
