import { describe, expect, it } from "vitest";
import { validateAnswers } from "../artifacts/api-server/src/routes/forms";

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
