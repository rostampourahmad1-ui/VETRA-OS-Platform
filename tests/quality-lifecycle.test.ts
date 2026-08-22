import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  inspectionInput,
  inspectionTransitionInput,
  inspectionTransitions,
  ncrInput,
  ncrTransitionInput,
  ncrTransitions,
} from "../artifacts/api-server/src/routes/quality";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("VETRA-QUALITY-01: controlled Quality/NCR lifecycle", () => {
  it("accepts only initial lifecycle states on create", () => {
    expect(inspectionInput.safeParse({
      projectId: 10, title: "Inspection", type: "site", inspector: "Supervisor", date: "2026-08-22",
    }).success).toBe(true);
    expect(inspectionInput.safeParse({
      projectId: 10, title: "Inspection", type: "site", status: "completed", inspector: "Supervisor", date: "2026-08-22",
    }).success).toBe(false);

    expect(ncrInput.safeParse({
      projectId: 10, title: "NCR", severity: "high", description: "Observed deviation",
    }).success).toBe(true);
    expect(ncrInput.safeParse({
      projectId: 10, title: "NCR", severity: "high", status: "closed", description: "Observed deviation",
    }).success).toBe(false);
  });

  it("defines explicit forward transitions and rejects fabricated target states", () => {
    expect(inspectionTransitions.planned).toEqual(["in_progress", "cancelled"]);
    expect(inspectionTransitions.in_progress).toContain("completed");
    expect(inspectionTransitions.completed).toEqual([]);
    expect(ncrTransitions.open).toEqual(["in_progress"]);
    expect(ncrTransitions.in_progress).toEqual(["resolved"]);
    expect(ncrTransitions.resolved).toContain("awaiting_approval");
    expect(ncrTransitions.awaiting_approval).toContain("closed");
    expect(ncrTransitionInput.safeParse({ status: "closed" }).success).toBe(true);
    expect(ncrTransitionInput.safeParse({ status: "fabricated" }).success).toBe(false);
    expect(inspectionTransitionInput.safeParse({ status: "approved" }).success).toBe(false);
  });

  it("keeps lifecycle events immutable and quality records soft-deletable in the migration", () => {
    const migration = read("lib/db/drizzle/0009_quality_lifecycle.sql");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "deleted_at"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "quality_events"');
    expect(migration).toContain('ALTER TABLE "quality_events" FORCE ROW LEVEL SECURITY');
    expect(migration).toContain("quality_events table is append-only");
    expect(migration).toContain("ncr_active_workflow_run_idx");
  });

  it("exposes typed OpenAPI contracts for lifecycle, history and the NCR workflow adapter", () => {
    const spec = read("lib/api-spec/openapi.yaml");
    expect(spec).toContain("/quality/inspections/{id}/transition");
    expect(spec).toContain("/quality/non-conformance-reports/{id}/workflow-runs");
    expect(spec).toContain("NcrWorkflowRunInput");
    expect(spec).toContain("NcrTransitionInput");
  });
});
