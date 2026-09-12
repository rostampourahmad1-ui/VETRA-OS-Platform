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
  approvedBy: integer('approved_by').references(() => usersTable.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invoicesTable = pgTable('invoices', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  projectId: integer('project_id').references(() => projectsTable.id),
  invoiceNumber: text('invoice_number').notNull(),
  title: text('title').notNull(),
  clientName: text('client_name'),
  issueDate: date('issue_date', { mode: 'string' }).notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }).notNull().default('0'),
  tax: numeric('tax', { precision: 15, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 15, scale: 2 }).notNull().default('0'),
  status: text('status').notNull().default('draft'),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => usersTable.id),
  approvedBy: integer('approved_by').references(() => usersTable.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const invoiceLinesTable = pgTable('invoice_lines', {
  id: serial('id').primaryKey(),
  invoiceId: integer('invoice_id').notNull().references(() => invoicesTable.id, { onDelete: 'cascade' }),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('0'),
  unitPrice: numeric('unit_price', { precision: 15, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentSchedulesTable = pgTable('payment_schedules', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizationsTable.id),
  projectId: integer('project_id').references(() => projectsTable.id),
  invoiceId: integer('invoice_id').references(() => invoicesTable.id),
  title: text('title').notNull(),
  installmentNumber: integer('installment_number').notNull().default(1),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  dueDate: date('due_date', { mode: 'string' }).notNull(),
  paidDate: date('paid_date', { mode: 'string' }),
  status: text('status').notNull().default('scheduled'),
  retentionRelease: boolean('retention_release').notNull().default(false),
  notes: text('notes'),
  createdBy: integer('created_by').references(() => usersTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
