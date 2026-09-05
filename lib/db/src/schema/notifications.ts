import { pgTable, text, serial, timestamp, boolean, integer, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"),
  read: boolean("read").notNull().default(false),
  link: text("link"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;

/**
 * VETRA-SEC-03: Notification Preferences Table
 *
 * Allows users to opt in or out of specific notification types.
 * Each row is scoped by organizationId (tenant isolation) and userId.
 * If no row exists for a given type, the default is opt-in (true).
 */
export const notificationPreferencesTable = pgTable("notification_preferences", {
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizationsTable.id),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  type: text("type").notNull(),
  optIn: boolean("opt_in").notNull().default(true),
}, (table) => ({
  pk: primaryKey({ columns: [table.organizationId, table.userId, table.type] }),
  typeIdx: uniqueIndex("notification_prefs_type_idx").on(table.organizationId, table.userId, table.type),
}));

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferencesTable);
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
