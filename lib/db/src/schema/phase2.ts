import { createInsertSchema } from 'drizzle-zod';
import { boolean, date, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';
import { projectsTable } from './projects';
import { usersTable } from './users';

export const expenseCategoriesTable = pgTable('expense_categories', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  color: text('color').notNull().default('#64748b'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const budgetsTable = pgTable('budgets', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  projectId: integer('project_id').notNull().references(() => projectsTable.id),
  categoryId: integer('category_id').references(() => expenseCategoriesTable.id),
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull().default('0'),
  period: text('period').notNull().default('annual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expensesTable = pgTable('expenses', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  projectId: integer('project_id').notNull().references(() => projectsTable.id),
  categoryId: integer('category_id').references(() => expenseCategoriesTable.id),
  submittedBy: integer('submitted_by').references(() => usersTable.id),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  expenseDate: date('expense_date', { mode: 'string' }).notNull(),
  status: text('status').notNull().default('approved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clientsTable = pgTable('clients', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  name: text('name').notNull(),
  company: text('company'),
  email: text('email'),
  phone: text('phone'),
  type: text('type').notNull().default('client'),
  status: text('status').notNull().default('active'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const insertExpenseCategorySchema = createInsertSchema(expenseCategoriesTable).omit({ id: true, createdAt: true });
export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, createdAt: true });
export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });

export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;
export type Budget = typeof budgetsTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;
export type Client = typeof clientsTable.$inferSelect;
