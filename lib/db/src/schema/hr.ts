import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  code: text("code").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  nationalId: text("national_id"),
  phone: text("phone").notNull(),
  email: text("email"),
  position: text("position").notNull(),
  department: text("department"),
  projectId: integer("project_id").references(() => projectsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  hireDate: date("hire_date", { mode: "string" }).notNull(),
  salary: numeric("salary", { precision: 15, scale: 2 }).notNull().default("0"),
  dailyWage: numeric("daily_wage", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),
  gender: text("gender"),
  insuranceNumber: text("insurance_number"),
  bankAccount: text("bank_account"),
  address: text("address"),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  date: date("date", { mode: "string" }).notNull(),
  checkIn: text("check_in"),
  checkOut: text("check_out"),
  status: text("status").notNull().default("present"),
  hoursWorked: numeric("hours_worked", { precision: 5, scale: 1 }),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 1 }),
  notes: text("notes"),
  recordedBy: integer("recorded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  organizationId: integer("organization_id").notNull().references(() => organizationsTable.id),
  periodStart: date("period_start", { mode: "string" }).notNull(),
  periodEnd: date("period_end", { mode: "string" }).notNull(),
  baseSalary: numeric("base_salary", { precision: 15, scale: 2 }).notNull().default("0"),
  overtime: numeric("overtime", { precision: 15, scale: 2 }).notNull().default("0"),
  bonuses: numeric("bonuses", { precision: 15, scale: 2 }).notNull().default("0"),
  deductions: numeric("deductions", { precision: 15, scale: 2 }).notNull().default("0"),
  insurance: numeric("insurance", { precision: 15, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 15, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({ id: true, createdAt: true, updatedAt: true, organizationId: true });
export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrollTable.$inferSelect;
