import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";

export const meetingsTable = pgTable("meetings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  location: text("location").notNull(),
  status: text("status").notNull().default("scheduled"),
  agenda: text("agenda"),
  minutes: text("minutes"),
  attendees: text("attendees").notNull().default(""),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  organizer: text("organizer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetingsTable).omit({ id: true, createdAt: true, organizationId: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetingsTable.$inferSelect;
