import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { planningActivityInput, wbsInput } from "../artifacts/api-server/src/routes/planning";

const root = path.resolve(import.meta.dirname, "..");

describe("VETRA-PLAN-01: WBS and activity baseline", () => {
  it("validates WBS codes and project-bound activity schedule invariants", () => {
    expect(wbsInput.safeParse({ code: "1.2", name: "Structural works" }).success).toBe(true);
    expect(wbsInput.safeParse({ code: "", name: "x" }).success).toBe(false);
    expect(planningActivityInput.safeParse({
      wbsId: 10, code: "1.2.10", name: "Cast concrete", plannedStart: "2026-01-01", plannedFinish: "2026-01-03", durationDays: 3,
    }).success).toBe(true);
    expect(planningActivityInput.safeParse({
      wbsId: 10, code: "1.2.11", name: "Invalid", plannedStart: "2026-01-04", plannedFinish: "2026-01-03", durationDays: 1,
    }).success).toBe(false);
    expect(planningActivityInput.safeParse({
      wbsId: 10, code: "M-1", name: "Handover", activityType: "milestone", plannedStart: "2026-01-04", plannedFinish: "2026-01-04", durationDays: 1,
    }).success).toBe(false);
  });

  it("uses tenant RLS, unique project codes and soft-delete fields in the additive migration", () => {
    const migration = fs.readFileSync(path.join(root, "lib/db/drizzle/0010_planning_wbs.sql"), "utf8");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "work_breakdown_structures"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "planning_activities"');
    expect(migration).toContain("work_breakdown_structures_project_code_unique");
    expect(migration).toContain("planning_activities_milestone_duration_check");
    expect(migration).toContain('ALTER TABLE "work_breakdown_structures" FORCE ROW LEVEL SECURITY');
  });
});
