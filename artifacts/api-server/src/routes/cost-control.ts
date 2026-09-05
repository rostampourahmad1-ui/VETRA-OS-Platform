import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, budgetsTable, expenseCategoriesTable, expensesTable, projectsTable } from "@workspace/db";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { tenantId } from "../middlewares/tenant";

const router = Router(); const money = (value: unknown) => Number(value ?? 0);
async function ownedProject(req: any, projectId: number) { const [p] = await db.select().from(projectsTable).where(and(eq(projectsTable.id, projectId), eq(projectsTable.organizationId, tenantId(req)))); return p; }

router.get("/cost-control/summary", requirePermission("cost-control.read"), async (req, res): Promise<void> => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
  const budgets = await db.select().from(budgetsTable).where(eq(budgetsTable.organizationId, tenantId(req)));
  const expenses = await db.select().from(expensesTable).where(eq(expensesTable.organizationId, tenantId(req)));
  const filteredBudgets = projectId ? budgets.filter((r) => r.projectId === projectId) : budgets; const filteredExpenses = projectId ? expenses.filter((r) => r.projectId === projectId) : expenses;
  const budgetTotal = filteredBudgets.reduce((s, r) => s + money(r.amount), 0); const spentTotal = filteredExpenses.reduce((s, r) => s + money(r.amount), 0);
  const categories = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.organizationId, tenantId(req)));
  res.json({ budgetTotal, spentTotal, remaining: budgetTotal - spentTotal, utilization: budgetTotal ? Math.round((spentTotal / budgetTotal) * 100) : 0, categories, budgets: filteredBudgets, expenses: filteredExpenses });
});
router.get("/cost-control/categories", requirePermission("cost-control.read"), async (req, res) => res.json(await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.organizationId, tenantId(req)))));
router.post("/cost-control/categories", requirePermission("cost-control.manage"), async (req, res): Promise<void> => { const { name, code, color } = req.body ?? {}; if (!name || !code) { res.status(400).json({ error: "name and code are required" }); return; } const [row] = await db.insert(expenseCategoriesTable).values({ organizationId: tenantId(req), name, code, color }).returning(); res.status(201).json(row);
audit(req, "cost_control.category.created", "expense_category", { resourceId: row.id, newValues: { name: row.name, code: row.code } }); });
router.get("/cost-control/budgets", requirePermission("cost-control.read"), async (req, res) => { const projectId = req.query.projectId ? Number(req.query.projectId) : undefined; const rows = await db.select().from(budgetsTable).where(eq(budgetsTable.organizationId, tenantId(req))); res.json(projectId ? rows.filter((r) => r.projectId === projectId) : rows); });
router.post("/cost-control/budgets", requirePermission("cost-control.manage"), async (req, res): Promise<void> => { const { projectId, categoryId, name, amount, period = "annual" } = req.body ?? {}; if (!projectId || !name || amount === undefined || !(await ownedProject(req, Number(projectId)))) { res.status(400).json({ error: "valid projectId, name and amount are required" }); return; } const [row] = await db.insert(budgetsTable).values({ organizationId: tenantId(req), projectId, categoryId, name, amount: String(amount), period }).returning(); res.status(201).json(row);
audit(req, "cost_control.budget.created", "budget", { resourceId: row.id, newValues: { name: row.name, projectId: row.projectId, amount: row.amount } }); });
router.get("/cost-control/expenses", requirePermission("cost-control.read"), async (req, res) => { const projectId = req.query.projectId ? Number(req.query.projectId) : undefined; const rows = await db.select().from(expensesTable).where(eq(expensesTable.organizationId, tenantId(req))); res.json(projectId ? rows.filter((r) => r.projectId === projectId) : rows); });
router.post("/cost-control/expenses", requirePermission("cost-control.manage"), async (req, res): Promise<void> => { const { projectId, categoryId, submittedBy, description, amount, expenseDate, status = "submitted" } = req.body ?? {}; if (!projectId || !description || amount === undefined || !expenseDate || !(await ownedProject(req, Number(projectId)))) { res.status(400).json({ error: "valid projectId, description, amount and expenseDate are required" }); return; } const [row] = await db.insert(expensesTable).values({ organizationId: tenantId(req), projectId, categoryId, submittedBy, description, amount: String(amount), expenseDate, status }).returning(); res.status(201).json(row);
audit(req, "cost_control.expense.created", "expense", { resourceId: row.id, newValues: { description: row.description, projectId: row.projectId, amount: row.amount, status: row.status } }); });
export default router;
