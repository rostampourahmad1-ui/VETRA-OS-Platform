import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectionInput, ncrInput } from "../artifacts/api-server/src/routes/quality";

describe("Quality and NCR validation", () => {
  it("accepts documented inspection and NCR lifecycle values", () => {
    expect(inspectionInput.safeParse({
      projectId: 10,
      title: "Concrete inspection",
      type: "site",
      status: "planned",
      inspector: "Supervisor",
      date: "2026-08-22",
      templateId: "12",
    }).success).toBe(true);
    expect(ncrInput.safeParse({
      projectId: 10,
      title: "Rebar cover NCR",
      severity: "high",
      status: "open",
      description: "Cover depth differs from the approved drawing.",
    }).success).toBe(true);
  });

  it("keeps the inspection-template migration discoverable by the release runner", () => {
    const sql = readFileSync(new URL("../lib/db/drizzle/0013_quality_inspection_templates.sql", import.meta.url), "utf8");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "template_id"');
    expect(sql).toContain('REFERENCES "form_templates"("id")');
  });

  it("rejects fabricated status, severity, type and malformed date values", () => {
    expect(inspectionInput.safeParse({
      projectId: 10, title: "x", type: "uncontrolled", status: "approved", inspector: "x", date: "2026-99-99",
    }).success).toBe(false);
    expect(ncrInput.safeParse({
      projectId: 10, title: "x", severity: "emergency", status: "approved", description: "x",
    }).success).toBe(false);
  });
});
