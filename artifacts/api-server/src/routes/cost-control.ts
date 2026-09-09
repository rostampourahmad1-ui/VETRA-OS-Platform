import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, budgetsTable, expenseCategoriesTable, expensesTable, projectsTable } from "@workspace/db";
import { z } from "zod";
import {
  CreateExpenseCategoryBody,
  CreateBudgetBody,
  CreateExpenseBody,
  GetCostControlSummaryQueryParams,
} from "@workspace/api-zod";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { tenantId, ownedProject } from "../middlewares/tenant";

const router = Router();

const projectIdQuery = z.object({
  projectId: z.coerce.number().int().positive().optional(),
});

router.get("/cost-control/summary", requirePermission("cost-control.read"), async (req, res): Promise<void> => {
  const query = GetCostControlSummaryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query parameters", details: query.error.issues }); return; }
  const projectId = query.data.projectId;
  const orgId = tenantId(req);
  const budgets = await db.select().from(budgetsTable).where(eq(budgetsTable.organizationId, orgId));
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.organizationId, orgId));
  const filteredBudgets = projectId ? budgets.filter((r) => r.projectId === projectId) : budgets;
  const filteredExpenses = projectId ? expenses.filter((r) => r.projectId === projectId) : expenses;
  const budgetTotal = filteredBudgets.reduce((s, r) => s + parseFloat(String(r.amount)), 0);
  const spentTotal = filteredExpenses.reduce((s, r) => s + parseFloat(String(r.amount)), 0);
  const categories = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.organizationId, orgId));
  res.json({ budgetTotal, spentTotal, remaining: budgetTotal - spentTotal, utilization: budgetTotal ? Math.round((spentTotal / budgetTotal) * 100) : 0, categories, budgets: filteredBudgets, expenses: filteredExpenses });
});

router.get("/cost-control/categories", requirePermission("cost-control.read"), async (req, res) => res.json(await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.organizationId, tenantId(req)))));

router.post("/cost-control/categories", requirePermission("cost-control.manage"), async (req, res): Promise<void> => {
  const parsed = CreateExpenseCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid expense category", details: parsed.error.issues }); return; }
  const { name, code, color } = parsed.data;
  const [row] = await db.insert(expenseCategoriesTable).values({ organizationId: tenantId(req), name, code, color }).returning();
  res.status(201).json(row);
  audit(req, "cost_control.category.created", "expense_category", { resourceId: row.id, newValues: { name: row.name, code: row.code } });
});

router.get("/cost-control/budgets", requirePermission("cost-control.read"), async (req, res): Promise<void> => {
  const query = projectIdQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query parameters", details: query.error.issues }); return; }
  const projectId = query.data.projectId;
  const rows = await db.select().from(budgetsTable).where(eq(budgetsTable.organizationId, tenantId(req)));
  res.json(projectId ? rows.filter((r) => r.projectId === projectId) : rows);
});

router.post("/cost-control/budgets", requirePermission("cost-control.manage"), async (req, res): Promise<void> => {
  const parsed = CreateBudgetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid budget", details: parsed.error.issues }); return; }
  const { projectId, categoryId, name, amount, period } = parsed.data;
  if (!(await ownedProject(req, projectId))) { res.status(400).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(budgetsTable).values({ organizationId: tenantId(req), projectId, categoryId, name, amount: String(amount), period: period ?? "annual" }).returning();
  res.status(201).json(row);
  audit(req, "cost_control.budget.created", "budget", { resourceId: row.id, newValues: { name: row.name, projectId: row.projectId, amount: row.amount } });
});

router.get("/cost-control/expenses", requirePermission("cost-control.read"), async (req, res): Promise<void> => {
  const query = projectIdQuery.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Invalid query parameters", details: query.error.issues }); return; }
  const projectId = query.data.projectId;
  const rows = await db.select().from(expensesTable).where(eq(expensesTable.organizationId, tenantId(req)));
  res.json(projectId ? rows.filter((r) => r.projectId === projectId) : rows);
});

router.post("/cost-control/expenses", requirePermission("cost-control.manage"), async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid expense", details: parsed.error.issues }); return; }
  const { projectId, categoryId, description, amount, expenseDate, status } = parsed.data;
  if (!(await ownedProject(req, projectId))) { res.status(400).json({ error: "Project not found" }); return; }
  const expenseDateStr = expenseDate instanceof Date ? expenseDate.toISOString().slice(0, 10) : String(expenseDate);
  const [row] = await db.insert(expensesTable).values({ organizationId: tenantId(req), projectId, categoryId, submittedBy: req.vetraUser?.id, description, amount: String(amount), expenseDate: expenseDateStr, status: status ?? "approved" }).returning();
  res.status(201).json(row);
  audit(req, "cost_control.expense.created", "expense", { resourceId: row.id, newValues: { description: row.description, projectId: row.projectId, amount: row.amount, status: row.status } });
});

export default router;
