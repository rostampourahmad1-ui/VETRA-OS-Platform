import { Router } from 'express';
import { and, eq, ilike } from 'drizzle-orm';
import { db, budgetsTable, expenseCategoriesTable, expensesTable, projectsTable } from '@workspace/db';

const router = Router();
const money = (value: unknown) => Number(value ?? 0);

router.get('/cost-control/summary', async (req, res): Promise<void> => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
  const budgets = await db.select().from(budgetsTable);
  const expenses = await db.select().from(expensesTable);
  const filteredBudgets = projectId ? budgets.filter((row) => row.projectId === projectId) : budgets;
  const filteredExpenses = projectId ? expenses.filter((row) => row.projectId === projectId) : expenses;
  const budgetTotal = filteredBudgets.reduce((sum, row) => sum + money(row.amount), 0);
  const spentTotal = filteredExpenses.reduce((sum, row) => sum + money(row.amount), 0);
  const categories = await db.select().from(expenseCategoriesTable);
  res.json({ budgetTotal, spentTotal, remaining: budgetTotal - spentTotal, utilization: budgetTotal ? Math.round((spentTotal / budgetTotal) * 100) : 0, categories, budgets: filteredBudgets, expenses: filteredExpenses });
});

router.get('/cost-control/categories', async (_req, res) => res.json(await db.select().from(expenseCategoriesTable)));
router.post('/cost-control/categories', async (req, res): Promise<void> => {
  const { organizationId = 1, name, code, color } = req.body ?? {};
  if (!name || !code) { res.status(400).json({ error: 'name and code are required' }); return; }
  const [row] = await db.insert(expenseCategoriesTable).values({ organizationId, name, code, color }).returning();
  res.status(201).json(row);
});

router.get('/cost-control/budgets', async (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
  const rows = await db.select().from(budgetsTable);
  res.json(projectId ? rows.filter((row) => row.projectId === projectId) : rows);
});
router.post('/cost-control/budgets', async (req, res): Promise<void> => {
  const { organizationId = 1, projectId, categoryId, name, amount, period = 'annual' } = req.body ?? {};
  if (!projectId || !name || amount === undefined) { res.status(400).json({ error: 'projectId, name and amount are required' }); return; }
  const [row] = await db.insert(budgetsTable).values({ organizationId, projectId, categoryId, name, amount: String(amount), period }).returning();
  res.status(201).json(row);
});

router.get('/cost-control/expenses', async (req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
  const rows = await db.select().from(expensesTable);
  res.json(projectId ? rows.filter((row) => row.projectId === projectId) : rows);
});
router.post('/cost-control/expenses', async (req, res): Promise<void> => {
  const { organizationId = 1, projectId, categoryId, submittedBy, description, amount, expenseDate, status = 'approved' } = req.body ?? {};
  if (!projectId || !description || amount === undefined || !expenseDate) { res.status(400).json({ error: 'projectId, description, amount and expenseDate are required' }); return; }
  const [row] = await db.insert(expensesTable).values({ organizationId, projectId, categoryId, submittedBy, description, amount: String(amount), expenseDate, status }).returning();
  res.status(201).json(row);
});

export default router;
