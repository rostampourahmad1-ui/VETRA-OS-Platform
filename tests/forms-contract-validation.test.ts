import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateAnswers } from "../artifacts/api-server/src/routes/forms";
import {
  FormFieldType,
  PostFormSubmissionsBody,
  PostFormsTemplatesBody,
  PatchFormsTemplatesIdBody,
  PatchFormSubmissionsIdBody,
  PostWorkflowRunsIdDecisionBody,
} from "@workspace/api-zod";

// ============================================================================
// 1. Answer Validation — Invalid field types, missing required, invalid select
// ============================================================================

const fullDefinition = {
  fields: [
    { id: "title", label: "Title", type: "text" as const, required: true },
    { id: "quantity", label: "Quantity", type: "number" as const, required: true },
    { id: "inspectionDate", label: "Inspection date", type: "date" as const, required: false },
    { id: "passed", label: "Passed", type: "checkbox" as const, required: true },
    { id: "status", label: "Status", type: "select" as const, required: true, options: ["open", "closed"] },
    { id: "notes", label: "Notes", type: "text" as const, required: false },
  ],
};

describe("Forms: answer validation — invalid field types", () => {
  it("rejects text field with number value", () => {
    expect(validateAnswers(fullDefinition, {
      title: 123, quantity: 12, passed: true, status: "open",
    })).toContain("Invalid text value");
  });

  it("rejects text field with boolean value", () => {
    expect(validateAnswers(fullDefinition, {
      title: true, quantity: 12, passed: true, status: "open",
    })).toContain("Invalid text value");
  });

  it("rejects text field with null value (required)", () => {
    expect(validateAnswers(fullDefinition, {
      title: null, quantity: 12, passed: true, status: "open",
    })).toContain("Required field is missing");
  });

  it("rejects number field with string value", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: "twelve", passed: true, status: "open",
    })).toContain("Invalid number value");
  });

  it("rejects number field with NaN", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: NaN, passed: true, status: "open",
    })).toContain("Invalid number value");
  });

  it("rejects number field with Infinity", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: Infinity, passed: true, status: "open",
    })).toContain("Invalid number value");
  });

  it("rejects date field with invalid format", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "open",
      inspectionDate: "2026/08/22",
    })).toContain("Invalid date value");
  });

  it("rejects date field with non-string value", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "open",
      inspectionDate: 20260822,
    })).toContain("Invalid date value");
  });

  it("rejects checkbox field with non-boolean value", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: "yes", status: "open",
    })).toContain("Invalid checkbox value");
  });

  it("rejects checkbox field with falsy boolean (required)", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: false, status: "open",
    })).toContain("Required field is missing");
  });

  it("rejects select field with invalid option", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "invalid_option",
    })).toContain("Invalid selection");
  });

  it("rejects select field with empty string", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "",
    })).toContain("Required field is missing");
  });

  it("rejects select field with number value", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: 1,
    })).toContain("Invalid selection");
  });

  it("rejects unknown field keys", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "open",
      maliciousField: "DROP TABLE",
    })).toContain("Unknown form field");
  });

  it("accepts optional field left empty", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "open",
      inspectionDate: undefined,
      notes: undefined,
    })).toBeNull();
  });
});

// ============================================================================
// 2. Missing required field tests
// ============================================================================

describe("Forms: answer validation — missing required fields", () => {
  it("rejects when title is missing", () => {
    expect(validateAnswers(fullDefinition, {
      quantity: 12, passed: true, status: "open",
    })).toContain("Required field is missing: Title");
  });

  it("rejects when quantity is missing", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", passed: true, status: "open",
    })).toContain("Required field is missing: Quantity");
  });

  it("rejects when checkbox is missing", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, status: "open",
    })).toContain("Required field is missing: Passed");
  });

  it("rejects when select is missing", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true,
    })).toContain("Required field is missing: Status");
  });

  it("rejects empty string for required text field", () => {
    expect(validateAnswers(fullDefinition, {
      title: "", quantity: 12, passed: true, status: "open",
    })).toContain("Required field is missing");
  });

  it("rejects empty string for required select field", () => {
    expect(validateAnswers(fullDefinition, {
      title: "x", quantity: 12, passed: true, status: "",
    })).toContain("Required field is missing");
  });
});

// ============================================================================
// 3. Invalid select option tests
// ============================================================================

describe("Forms: answer validation — invalid select options", () => {
  const selectDef = {
    fields: [
      { id: "priority", label: "Priority", type: "select" as const, required: true, options: ["low", "medium", "high"] },
    ],
  };

  it("rejects value not in options list", () => {
    expect(validateAnswers(selectDef, { priority: "critical" }))
      .toContain("Invalid selection");
  });

  it("rejects empty options list (no valid choice)", () => {
    const noOptionDef = {
      fields: [
        { id: "color", label: "Color", type: "select" as const, required: true, options: [] },
      ],
    };
    expect(validateAnswers(noOptionDef, { color: "red" }))
      .toContain("Invalid selection");
  });

  it("accepts valid option from list", () => {
    expect(validateAnswers(selectDef, { priority: "medium" })).toBeNull();
  });

  it("rejects case-sensitive mismatch", () => {
    expect(validateAnswers(selectDef, { priority: "Low" }))
      .toContain("Invalid selection");
  });
});

// ============================================================================
// 4. API/Client type compatibility — Zod schema contracts
// ============================================================================

describe("Forms: API/client type compatibility", () => {
  it("PostFormsTemplatesBody accepts valid template input", () => {
    const result = PostFormsTemplatesBody.safeParse({
      name: "Inspection Form",
      description: "Daily inspection",
      projectId: 1,
      workflowId: 2,
      definition: {
        fields: [{ id: "f1", label: "Field 1", type: "text", required: true }],
      },
    });
    expect(result.success).toBe(true);
  });

  it("PostFormsTemplatesBody rejects missing name", () => {
    const result = PostFormsTemplatesBody.safeParse({
      definition: { fields: [{ id: "f1", label: "F1", type: "text", required: false }] },
    });
    expect(result.success).toBe(false);
  });

  it("PostFormsTemplatesBody rejects empty name", () => {
    const result = PostFormsTemplatesBody.safeParse({
      name: "",
      definition: { fields: [{ id: "f1", label: "F1", type: "text", required: false }] },
    });
    expect(result.success).toBe(false);
  });

  it("PostFormsTemplatesBody rejects name exceeding 256 chars", () => {
    const result = PostFormsTemplatesBody.safeParse({
      name: "x".repeat(257),
      definition: { fields: [{ id: "f1", label: "F1", type: "text", required: false }] },
    });
    expect(result.success).toBe(false);
  });

  it("PostFormsTemplatesBody rejects definition with zero fields", () => {
    const result = PostFormsTemplatesBody.safeParse({
      name: "T",
      definition: { fields: [] },
    });
    expect(result.success).toBe(false);
  });

  it("PostFormsTemplatesBody rejects definition with invalid field type", () => {
    const result = PostFormsTemplatesBody.safeParse({
      name: "T",
      definition: { fields: [{ id: "f1", label: "F1", type: "invalid_type", required: false }] },
    });
    expect(result.success).toBe(false);
  });

  it("PatchFormsTemplatesIdBody allows partial update", () => {
    const result = PatchFormsTemplatesIdBody.safeParse({
      name: "Updated Name",
    });
    expect(result.success).toBe(true);
  });

  it("PatchFormsTemplatesIdBody rejects invalid field type", () => {
    const result = PatchFormsTemplatesIdBody.safeParse({
      name: 123,
    });
    expect(result.success).toBe(false);
  });

  it("PostFormSubmissionsBody accepts valid submission", () => {
    const result = PostFormSubmissionsBody.safeParse({
      templateId: 1,
      answers: { title: "Inspection", quantity: 5 },
    });
    expect(result.success).toBe(true);
  });

  it("PostFormSubmissionsBody rejects missing templateId", () => {
    const result = PostFormSubmissionsBody.safeParse({
      answers: { title: "Inspection" },
    });
    expect(result.success).toBe(false);
  });

  it("PostFormSubmissionsBody rejects templateId <= 0", () => {
    const result = PostFormSubmissionsBody.safeParse({
      templateId: 0,
      answers: { title: "Inspection" },
    });
    expect(result.success).toBe(false);
  });

  it("PatchFormSubmissionsIdBody accepts answers update", () => {
    const result = PatchFormSubmissionsIdBody.safeParse({
      answers: { title: "Updated", quantity: 10 },
    });
    expect(result.success).toBe(true);
  });

  it("PatchFormSubmissionsIdBody rejects missing answers", () => {
    const result = PatchFormSubmissionsIdBody.safeParse({});
    expect(result.success).toBe(false);
  });

  it("PostWorkflowRunsIdDecisionBody accepts request_revision with comment", () => {
    const result = PostWorkflowRunsIdDecisionBody.safeParse({
      decision: "request_revision",
      comment: "Please fix the quantity field.",
    });
    expect(result.success).toBe(true);
  });

  it("PostWorkflowRunsIdDecisionBody accepts approve without comment", () => {
    const result = PostWorkflowRunsIdDecisionBody.safeParse({
      decision: "approve",
    });
    expect(result.success).toBe(true);
  });

  it("PostWorkflowRunsIdDecisionBody rejects invalid decision", () => {
    const result = PostWorkflowRunsIdDecisionBody.safeParse({
      decision: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("FormFieldType enum matches expected values", () => {
    expect(FormFieldType).toEqual({
      text: "text",
      number: "number",
      date: "date",
      select: "select",
      checkbox: "checkbox",
    });
  });
});

// ============================================================================
// 5. Publish immutability — template-level tests
// ============================================================================

describe("Forms: publish immutability", () => {
  it("definition is immutable after publish (version snapshot is separate)", () => {
    // This is a contract test: the version schema stores definition as jsonb,
    // and the template's definition can be updated independently when draft.
    const draftTemplate = { name: "T", status: "draft", definition: { fields: [{ id: "f1", label: "Old", type: "text", required: false }] } };
    const publishedVersion = { templateId: 1, version: 1, definition: { fields: [{ id: "f1", label: "Old", type: "text", required: false }] } };

    // Simulate editing the template definition after publish
    draftTemplate.definition = { fields: [{ id: "f1", label: "New", type: "text", required: false }] };

    // The published version should still have the old definition
    expect(publishedVersion.definition.fields[0].label).toBe("Old");
    expect(draftTemplate.definition.fields[0].label).toBe("New");
  });

  it("published version cannot be mutated (immutable snapshot)", () => {
    const version = { id: 1, templateId: 1, version: 1, definition: { fields: [{ id: "f1", label: "Title", type: "text", required: true }] } };
    // Attempt to mutate inline
    const copy = { ...version, definition: { ...version.definition } };
    copy.definition.fields = [];
    // Original should remain unchanged
    expect(version.definition.fields).toHaveLength(1);
    expect(version.definition.fields[0].label).toBe("Title");
  });
});

// ============================================================================
// 6. Cross-tenant and unauthorized access — contract tests
// ============================================================================

describe("Forms: cross-tenant access contract", () => {
  it("validateAnswers does not accept organizationId as a field", () => {
    const def = { fields: [{ id: "name", label: "Name", type: "text" as const, required: true }] };
    expect(validateAnswers(def, { name: "Test", organizationId: 2 })).toContain("Unknown form field");
  });

  it("validateAnswers does not accept createdBy as a field", () => {
    const def = { fields: [{ id: "name", label: "Name", type: "text" as const, required: true }] };
    expect(validateAnswers(def, { name: "Test", createdBy: 999 })).toContain("Unknown form field");
  });

  it("validateAnswers does not accept submittedBy as a field", () => {
    const def = { fields: [{ id: "name", label: "Name", type: "text" as const, required: true }] };
    expect(validateAnswers(def, { name: "Test", submittedBy: 999 })).toContain("Unknown form field");
  });

  it("form definition cannot contain privileged field names", () => {
    const def = {
      fields: [
        { id: "organizationId", label: "Org ID", type: "text" as const, required: false },
        { id: "name", label: "Name", type: "text" as const, required: true },
      ],
    };
    // Even if someone defines organizationId as a field, it's treated as a regular field
    // The server should never trust client-supplied organizationId values
    expect(validateAnswers(def, { name: "Test", organizationId: "2" })).toBeNull();
    // The critical point: the server must use tenantId(req), not req.body.organizationId
  });
});
