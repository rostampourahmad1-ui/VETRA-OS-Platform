import { describe, expect, it } from "vitest";
import { validateAnswers } from "../artifacts/api-server/src/routes/forms";
import { PostFormSubmissionsBody, PostWorkflowRunsIdDecisionBody } from "@workspace/api-zod";

const definition = {
  fields: [
    { id: "title", label: "Title", type: "text" as const, required: true },
    { id: "quantity", label: "Quantity", type: "number" as const, required: true },
    { id: "inspectionDate", label: "Inspection date", type: "date" as const, required: false },
    { id: "passed", label: "Passed", type: "checkbox" as const, required: true },
    { id: "status", label: "Status", type: "select" as const, required: true, options: ["open", "closed"] },
  ],
};

describe("form submission answer validation", () => {
  it("accepts answers that match immutable field definitions", () => {
    expect(validateAnswers(definition, {
      title: "Concrete inspection",
      quantity: 12,
      inspectionDate: "2026-08-22",
      passed: true,
      status: "open",
    })).toBeNull();
  });

  it("accepts submission and approval workflow payload contracts", () => {
    expect(PostFormSubmissionsBody.safeParse({ templateId: 12, answers: { title: "Inspection" } }).success).toBe(true);
    expect(PostWorkflowRunsIdDecisionBody.safeParse({ decision: "request_revision", comment: "Please add the missing evidence." }).success).toBe(true);
    expect(PostWorkflowRunsIdDecisionBody.safeParse({ decision: "request_revision" }).success).toBe(true);
  });

  it("rejects missing required values, unknown fields and invalid typed values", () => {
    expect(validateAnswers(definition, { quantity: 12, passed: true, status: "open" }))
      .toContain("Required field is missing: Title");
    expect(validateAnswers(definition, { title: "x", quantity: "12", passed: true, status: "open" }))
      .toContain("Invalid number value");
    expect(validateAnswers(definition, { title: "x", quantity: 12, passed: true, status: "invalid" }))
      .toContain("Invalid selection");
    expect(validateAnswers(definition, { title: "x", quantity: 12, passed: true, status: "open", attacker: true }))
      .toContain("Unknown form field");
  });
});
