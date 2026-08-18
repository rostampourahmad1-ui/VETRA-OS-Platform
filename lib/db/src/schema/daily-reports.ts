import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";

export const dailyReportsTable = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  weather: text("weather").notNull().default("clear"),
  temperature: numeric("temperature", { precision: 5, scale: 1 }),
  progress: numeric("progress", { precision: 5, scale: 2 }).notNull().default("0"),
  workersOnSite: integer("workers_on_site").notNull().default(0),
  issues: text("issues"),
  notes: text("notes"),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyReportSchema = createInsertSchema(dailyReportsTable).omit({ id: true, createdAt: true, organizationId: true });
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReportsTable.$inferSelect;
