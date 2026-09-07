import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { workflowRunsTable } from "./workflows";
import { employeesTable } from "./hr";
import { materialsTable } from "./procurement-ext";
import { equipmentTable } from "./equipment";

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
  status: text("status").notNull().default("draft"),
  workflowRunId: integer("workflow_run_id").references(() => workflowRunsTable.id),
  submittedBy: integer("submitted_by").references(() => usersTable.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertDailyReportSchema = createInsertSchema(dailyReportsTable).omit({
  id: true,
  organizationId: true,
  status: true,
  workflowRunId: true,
  submittedBy: true,
  submittedAt: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReportsTable.$inferSelect;

// ─── Daily Report Attachments ────────────────────────────────────────────────
// VETRA-DR-02: Attachments linked to a daily report. Files are stored on disk
// using the existing fileStorage helpers (same uploads directory, extension/MIME
// allowlist, safe filename generation, and path traversal prevention).
// Authorization is enforced at the route level: tenant isolation, project
// ownership, and daily report ownership are all verified before access.

export const dailyReportAttachmentsTable = pgTable("daily_report_attachments", {
  id: serial("id").primaryKey(),
  dailyReportId: integer("daily_report_id").notNull().references(() => dailyReportsTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  fileName: text("file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyReportAttachmentSchema = createInsertSchema(dailyReportAttachmentsTable).omit({
  id: true,
  organizationId: true,
  createdAt: true,
});
export type InsertDailyReportAttachment = z.infer<typeof insertDailyReportAttachmentSchema>;
export type DailyReportAttachment = typeof dailyReportAttachmentsTable.$inferSelect;

// ─── Daily Report Workforce ──────────────────────────────────────────────────
// VETRA-DR-03: Workforce entries linked to a daily report. Each entry connects
// an employee (or a group) to the daily report, capturing role, count,
// attendance status, and hours worked. Authorization is enforced at the route
// level: tenant isolation, project ownership, and daily report ownership are
// all verified before access.

export const dailyReportWorkforceTable = pgTable("daily_report_workforce", {
  id: serial("id").primaryKey(),
  dailyReportId: integer("daily_report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  employeeId: integer("employee_id").references(() => employeesTable.id),
  groupName: text("group_name"),
  role: text("role").notNull(),
  count: integer("count").notNull().default(1),
  attendanceStatus: text("attendance_status").notNull().default("present"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 1 }).notNull().default("0"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyReportWorkforceSchema = z.object({
  dailyReportId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  employeeId: z.number().int().positive().nullable().optional(),
  groupName: z.string().trim().min(1).max(200).nullable().optional(),
  role: z.string().trim().min(1).max(200),
  count: z.number().int().min(1),
  attendanceStatus: z.enum(["present", "absent", "late", "on_leave", "half_day"]),
  hoursWorked: z.number().min(0).max(24),
  notes: z.string().trim().max(2000).nullable().optional(),
}).refine(
  (data) => data.employeeId || data.groupName,
  { message: "Either employeeId or groupName must be provided", path: ["employeeId"] },
);

export const updateDailyReportWorkforceSchema = insertDailyReportWorkforceSchema.partial().omit({
  dailyReportId: true, projectId: true,
});
export type InsertDailyReportWorkforce = z.infer<typeof insertDailyReportWorkforceSchema>;
export type UpdateDailyReportWorkforce = z.infer<typeof updateDailyReportWorkforceSchema>;
export type DailyReportWorkforce = typeof dailyReportWorkforceTable.$inferSelect;

// ─── Daily Report Materials ─────────────────────────────────────────────────
// VETRA-DR-04: Daily report material entries linking materials to daily reports.
// Each entry records opening quantity, received, consumed, returned, and
// closing quantity (computed server-side) for a material on a given day.
// Authorization is enforced at the route level: tenant isolation, project
// ownership, and daily report ownership are verified before access.

export const dailyReportMaterialsTable = pgTable("daily_report_materials", {
  id: serial("id").primaryKey(),
  dailyReportId: integer("daily_report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  materialId: integer("material_id").references(() => materialsTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  openingQuantity: numeric("opening_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  received: numeric("received", { precision: 12, scale: 3 }).notNull().default("0"),
  consumed: numeric("consumed", { precision: 12, scale: 3 }).notNull().default("0"),
  returned: numeric("returned", { precision: 12, scale: 3 }).notNull().default("0"),
  closingQuantity: numeric("closing_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  unit: text("unit").notNull(),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDailyReportMaterialSchema = z.object({
  dailyReportId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  materialId: z.number().int().positive().nullable().optional(),
  openingQuantity: z.number().min(0),
  received: z.number().min(0),
  consumed: z.number().min(0),
  returned: z.number().min(0),
  unit: z.string().trim().min(1).max(50),
  notes: z.string().trim().max(2000).nullable().optional(),
}).refine(
  (data) => {
    const computedClosing = data.openingQuantity + data.received - data.consumed + data.returned;
    return computedClosing >= 0;
  },
  { message: "Closing quantity must be non-negative. Check opening + received - consumed + returned.", path: ["consumed"] },
);

export const updateDailyReportMaterialSchema = insertDailyReportMaterialSchema.partial().omit({
  dailyReportId: true,
  projectId: true,
});

export type InsertDailyReportMaterial = z.infer<typeof insertDailyReportMaterialSchema>;
export type UpdateDailyReportMaterial = z.infer<typeof updateDailyReportMaterialSchema>;
export type DailyReportMaterial = typeof dailyReportMaterialsTable.$inferSelect;

// ─── Daily Report Equipment ──────────────────────────────────────────────────
// VETRA-DR-05: Daily report equipment entries linking equipment to daily reports.
// Each entry records equipment usage, operator, operating/idle hours, and status
// for a given day. Authorization is enforced at the route level: tenant isolation,
// project ownership, and daily report ownership are verified before access.

export const dailyReportEquipmentTable = pgTable("daily_report_equipment", {
  id: serial("id").primaryKey(),
  dailyReportId: integer("daily_report_id").notNull().references(() => dailyReportsTable.id, { onDelete: "cascade" }),
  equipmentId: integer("equipment_id").notNull().references(() => equipmentTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  operatorId: integer("operator_id").references(() => employeesTable.id),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  operatingHours: numeric("operating_hours", { precision: 5, scale: 1 }).notNull().default("0"),
  idleHours: numeric("idle_hours", { precision: 5, scale: 1 }).notNull().default("0"),
  status: text("status").notNull().default("operating"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Parses a time string (HH:mm or HH:mm:ss) into total minutes since midnight.
 * Returns null if the format is invalid.
 */
function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export const insertDailyReportEquipmentSchema = z.object({
  dailyReportId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  equipmentId: z.number().int().positive(),
  operatorId: z.number().int().positive().nullable().optional(),
  startTime: z.string().trim().min(1).max(8).refine(
    (val) => parseTimeToMinutes(val) !== null,
    { message: "startTime must be in HH:mm format (00:00-23:59)" },
  ),
  endTime: z.string().trim().min(1).max(8).refine(
    (val) => parseTimeToMinutes(val) !== null,
    { message: "endTime must be in HH:mm format (00:00-23:59)" },
  ),
  operatingHours: z.number().min(0).max(24),
  idleHours: z.number().min(0).max(24),
  status: z.enum(["operating", "idle", "maintenance", "standby", "breakdown"]),
  notes: z.string().trim().max(2000).nullable().optional(),
}).refine(
  (data) => {
    const startMin = parseTimeToMinutes(data.startTime);
    const endMin = parseTimeToMinutes(data.endTime);
    if (startMin === null || endMin === null) return false;
    return endMin > startMin;
  },
  { message: "endTime must be after startTime", path: ["endTime"] },
).refine(
  (data) => {
    const totalHours = data.operatingHours + data.idleHours;
    const startMin = parseTimeToMinutes(data.startTime);
    const endMin = parseTimeToMinutes(data.endTime);
    if (startMin === null || endMin === null) return false;
    const durationHours = (endMin - startMin) / 60;
    return totalHours <= durationHours + 0.1;
  },
  { message: "operatingHours + idleHours must not exceed the time window (endTime - startTime)", path: ["operatingHours"] },
);

export const updateDailyReportEquipmentSchema = insertDailyReportEquipmentSchema.partial().omit({ dailyReportId: true, projectId: true });
export type InsertDailyReportEquipment = z.infer<typeof insertDailyReportEquipmentSchema>;
export type UpdateDailyReportEquipment = z.infer<typeof updateDailyReportEquipmentSchema>;
export type DailyReportEquipment = typeof dailyReportEquipmentTable.$inferSelect;
