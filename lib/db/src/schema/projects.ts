import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("planning"),
  progress: numeric("progress", { precision: 5, scale: 2 }).notNull().default("0"),
  budget: numeric("budget", { precision: 15, scale: 2 }).notNull().default("0"),
  spent: numeric("spent", { precision: 15, scale: 2 }).notNull().default("0"),
  client: text("client").notNull(),
  location: text("location").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  managerId: integer("manager_id").notNull().references(() => usersTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  priority: text("priority").notNull().default("medium"),
  phase: text("phase"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
