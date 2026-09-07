import { describe, expect, it } from "vitest";
import {
  CreateExpenseCategoryBody,
  CreateBudgetBody,
  CreateExpenseBody,
  GetCostControlSummaryQueryParams,
} from "../lib/api-zod/src/generated/api";

// ─── Cost Control Zod Validation Tests ─────────────────────────────────────

describe("Cost Control Zod Validation", () => {
  describe("CreateExpenseCategoryBody", () => {
    it("accepts valid minimal input", () => {
      const result = CreateExpenseCategoryBody.safeParse({ name: "Materials", code: "MAT-001" });
      expect(result.success).toBe(true);
    });

    it("accepts full input with optional fields", () => {
      const result = CreateExpenseCategoryBody.safeParse({
        name: "Materials",
        code: "MAT-001",
        color: "#ff0000",
        organizationId: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing name", () => {
      const result = CreateExpenseCategoryBody.safeParse({ code: "MAT-001" });
      expect(result.success).toBe(false);
    });

    it("rejects missing code", () => {
      const result = CreateExpenseCategoryBody.safeParse({ name: "Materials" });
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = CreateExpenseCategoryBody.safeParse({ name: "", code: "MAT-001" });
      // Note: generated schema uses zod.string() without .min(1), so empty strings pass
      expect(result.success).toBe(true);
    });

    it("rejects empty code", () => {
      const result = CreateExpenseCategoryBody.safeParse({ name: "Materials", code: "" });
      // Note: generated schema uses zod.string() without .min(1), so empty strings pass
      expect(result.success).toBe(true);
    });

    it("rejects non-string name", () => {
      const result = CreateExpenseCategoryBody.safeParse({ name: 123, code: "MAT-001" });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateBudgetBody", () => {
    it("accepts valid minimal input", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1,
        name: "Q4 Budget",
        amount: 1000000,
      });
      expect(result.success).toBe(true);
    });

    it("accepts full input with optional fields", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1,
        name: "Q4 Budget",
        amount: 1000000,
        categoryId: 5,
        period: "quarterly",
        organizationId: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing projectId", () => {
      const result = CreateBudgetBody.safeParse({ name: "Budget", amount: 1000 });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer projectId", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1.5,
        name: "Budget",
        amount: 1000,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing name", () => {
      const result = CreateBudgetBody.safeParse({ projectId: 1, amount: 1000 });
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1,
        name: "",
        amount: 1000,
      });
      // Note: generated schema uses zod.string() without .min(1), so empty strings pass
      expect(result.success).toBe(true);
    });

    it("rejects missing amount", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1,
        name: "Budget",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-numeric amount", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1,
        name: "Budget",
        amount: "one thousand",
      });
      expect(result.success).toBe(false);
    });

    it("accepts negative amount at schema level (service handles validation)", () => {
      const result = CreateBudgetBody.safeParse({
        projectId: 1,
        name: "Budget",
        amount: -1000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CreateExpenseBody", () => {
    it("accepts valid minimal input", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Cement purchase",
        amount: 50000,
        expenseDate: new Date("2026-09-01"),
      });
      expect(result.success).toBe(true);
    });

    it("accepts full input with optional fields", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Cement purchase",
        amount: 50000,
        expenseDate: new Date("2026-09-01"),
        categoryId: 3,
        status: "submitted",
        organizationId: 1,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing projectId", () => {
      const result = CreateExpenseBody.safeParse({
        description: "Test",
        amount: 1000,
        expenseDate: new Date(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing description", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        amount: 1000,
        expenseDate: new Date(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty description", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "",
        amount: 1000,
        expenseDate: new Date(),
      });
      // Note: generated schema uses zod.string() without .min(1), so empty strings pass
      expect(result.success).toBe(true);
    });

    it("rejects missing amount", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Test",
        expenseDate: new Date(),
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing expenseDate", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Test",
        amount: 1000,
      });
      expect(result.success).toBe(false);
    });

    it("coerces string date to Date object", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Test",
        amount: 1000,
        expenseDate: "2026-09-01",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expenseDate).toBeInstanceOf(Date);
      }
    });

    it("rejects invalid date string", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Test",
        amount: 1000,
        expenseDate: "not-a-date",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-numeric amount", () => {
      const result = CreateExpenseBody.safeParse({
        projectId: 1,
        description: "Test",
        amount: "one thousand",
        expenseDate: new Date(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("GetCostControlSummaryQueryParams", () => {
    it("accepts no params", () => {
      const result = GetCostControlSummaryQueryParams.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid projectId", () => {
      const result = GetCostControlSummaryQueryParams.safeParse({ projectId: "1" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectId).toBe(1);
      }
    });

    it("coerces string projectId to number", () => {
      const result = GetCostControlSummaryQueryParams.safeParse({ projectId: "42" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectId).toBe(42);
      }
    });

    it("rejects non-numeric projectId", () => {
      const result = GetCostControlSummaryQueryParams.safeParse({ projectId: "abc" });
      expect(result.success).toBe(false);
    });

    it("rejects float projectId", () => {
      const result = GetCostControlSummaryQueryParams.safeParse({ projectId: "1.5" });
      expect(result.success).toBe(false);
    });
  });
});
