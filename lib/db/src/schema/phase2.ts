import { createInsertSchema } from 'drizzle-zod';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizationsTable } from './organizations';

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

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true });
export type Client = typeof clientsTable.$inferSelect;
