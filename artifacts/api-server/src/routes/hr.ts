import { Router } from "express";
import { and, eq, desc, isNull, sql, sum } from "drizzle-orm";
import { db, employeesTable, attendanceTable, payrollTable, projectsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/permissions";
import { audit } from "../lib/audit";
import { createNotification } from "../lib/notifications";
import { ownedProject, tenantId } from "../middlewares/tenant";

const router = Router();
router.use(requireAuth);

// ─── Employees ───────────────────────────────────────────────────────────────

router.get("/employees", requirePermission("hr.read"), async (req, res): Promise<void> => {
  const { projectId, status, department } = req.query as { projectId?: string; status?: string; department?: string };
  const filters = [eq(employeesTable.organizationId, tenantId(req)), isNull(employeesTable.deletedAt)];
  if (projectId) filters.push(eq(employeesTable.projectId, Number(projectId)));
  if (status) filters.push(eq(employeesTable.status, status));
  if (department) filters.push(eq(employeesTable.department, department));
  const rows = await db.select().from(employeesTable).where(and(...filters)).orderBy(desc(employeesTable.createdAt));
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.organizationId, tenantId(req)));
  const projMap = new Map(projects.map(p => [p.id, p.name]));
  res.json(rows.map(r => ({ ...r, salary: Number(r.salary), dailyWage: Number(r.dailyWage), projectName: r.projectId ? (projMap.get(r.projectId) ?? null) : null })));
});

router.post("/employees", requirePermission("hr.create"), async (req, res): Promise<void> => {
  const { code, firstName, lastName, nationalId, phone, email, position, department, projectId, userId, hireDate, salary, dailyWage, status, gender, insuranceNumber, bankAccount, address, notes } = req.body;
  if (!code || !firstName || !lastName || !phone || !position || !hireDate) { res.status(400).json({ error: "code, firstName, lastName, phone, position, hireDate are required" }); return; }
  if (projectId && !(await ownedProject(req, projectId))) { res.status(404).json({ error: "Project not found" }); return; }
  const [row] = await db.insert(employeesTable).values({
    organizationId: tenantId(req), code, firstName, lastName, nationalId, phone, email, position, department,
    projectId: projectId ?? null, userId: userId ?? null, hireDate, salary: (salary ?? "0").toString(),
    dailyWage: (dailyWage ?? "0").toString(), status: status ?? "active", gender, insuranceNumber, bankAccount, address, notes, createdBy: req.vetraUser!.id,
  }).returning();
  res.status(201).json({ ...row, salary: Number(row.salary), dailyWage: Number(row.dailyWage) });
  audit(req, "employee.created", "employee", { resourceId: row.id, newValues: { code, firstName, lastName, position } });
});

router.get("/employees/:id", requirePermission("hr.read"), async (req, res): Promise<void> => {
  const [row] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, Number(req.params.id)), eq(employeesTable.organizationId, tenantId(req)), isNull(employeesTable.deletedAt)));
  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json({ ...row, salary: Number(row.salary), dailyWage: Number(row.dailyWage) });
});

router.patch("/employees/:id", requirePermission("hr.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, id), eq(employeesTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Employee not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["firstName", "lastName", "nationalId", "phone", "email", "position", "department", "status", "gender", "insuranceNumber", "bankAccount", "address", "notes"] as const) {
    if (req.body[k] !== undefined) upd[k] = req.body[k];
  }
  if (req.body.projectId !== undefined) upd.projectId = req.body.projectId;
  if (req.body.userId !== undefined) upd.userId = req.body.userId;
  if (req.body.hireDate !== undefined) upd.hireDate = req.body.hireDate;
  if (req.body.salary !== undefined) upd.salary = req.body.salary.toString();
  if (req.body.dailyWage !== undefined) upd.dailyWage = req.body.dailyWage.toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(employeesTable).set(upd).where(and(eq(employeesTable.id, id), eq(employeesTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, salary: Number(row.salary), dailyWage: Number(row.dailyWage) });
  audit(req, "employee.updated", "employee", { resourceId: id, oldValues: { firstName: current.firstName }, newValues: { firstName: row.firstName } });
});

router.delete("/employees/:id", requirePermission("hr.delete"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, id), eq(employeesTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Employee not found" }); return; }
  await db.update(employeesTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(employeesTable.id, id), eq(employeesTable.organizationId, tenantId(req))));
  res.status(204).end();
  audit(req, "employee.deleted", "employee", { resourceId: id, oldValues: { code: current.code } });
});

// ─── Attendance ──────────────────────────────────────────────────────────────

router.get("/attendance", requirePermission("hr.read"), async (req, res): Promise<void> => {
  const { employeeId, dateFrom, dateTo, status } = req.query as { employeeId?: string; dateFrom?: string; dateTo?: string; status?: string };
  const filters = [eq(attendanceTable.organizationId, tenantId(req))];
  if (employeeId) filters.push(eq(attendanceTable.employeeId, Number(employeeId)));
  if (status) filters.push(eq(attendanceTable.status, status));
  if (dateFrom) filters.push(eq(attendanceTable.date, dateFrom));
  if (dateTo) filters.push(eq(attendanceTable.date, dateTo));
  const rows = await db.select().from(attendanceTable).where(and(...filters)).orderBy(desc(attendanceTable.date));
  res.json(rows.map(r => ({ ...r, hoursWorked: r.hoursWorked ? Number(r.hoursWorked) : null, overtimeHours: r.overtimeHours ? Number(r.overtimeHours) : null })));
});

router.post("/attendance", requirePermission("hr.create"), async (req, res): Promise<void> => {
  const { employeeId, date, checkIn, checkOut, status, hoursWorked, overtimeHours, notes } = req.body;
  if (!employeeId || !date) { res.status(400).json({ error: "employeeId and date are required" }); return; }
  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, employeeId), eq(employeesTable.organizationId, tenantId(req))));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
  const [row] = await db.insert(attendanceTable).values({
    employeeId, organizationId: tenantId(req), date, checkIn, checkOut, status: status ?? "present",
    hoursWorked: hoursWorked?.toString(), overtimeHours: overtimeHours?.toString(), notes, recordedBy: req.vetraUser!.id,
  }).returning();
  res.status(201).json({ ...row, hoursWorked: row.hoursWorked ? Number(row.hoursWorked) : null, overtimeHours: row.overtimeHours ? Number(row.overtimeHours) : null });
  audit(req, "attendance.created", "attendance", { resourceId: row.id, newValues: { employeeId, date, status: row.status } });
});

router.patch("/attendance/:id", requirePermission("hr.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(attendanceTable).where(and(eq(attendanceTable.id, id), eq(attendanceTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Attendance record not found" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["checkIn", "checkOut", "status", "notes"] as const) if (req.body[k] !== undefined) upd[k] = req.body[k];
  if (req.body.hoursWorked !== undefined) upd.hoursWorked = req.body.hoursWorked.toString();
  if (req.body.overtimeHours !== undefined) upd.overtimeHours = req.body.overtimeHours.toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(attendanceTable).set(upd).where(and(eq(attendanceTable.id, id), eq(attendanceTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, hoursWorked: row.hoursWorked ? Number(row.hoursWorked) : null, overtimeHours: row.overtimeHours ? Number(row.overtimeHours) : null });
  audit(req, "attendance.updated", "attendance", { resourceId: id, oldValues: { status: current.status }, newValues: { status: row.status } });
});

// ─── Payroll ─────────────────────────────────────────────────────────────────

router.get("/payroll", requirePermission("hr.read"), async (req, res): Promise<void> => {
  const { employeeId, status } = req.query as { employeeId?: string; status?: string };
  const filters = [eq(payrollTable.organizationId, tenantId(req)), isNull(payrollTable.deletedAt)];
  if (employeeId) filters.push(eq(payrollTable.employeeId, Number(employeeId)));
  if (status) filters.push(eq(payrollTable.status, status));
  const rows = await db.select().from(payrollTable).where(and(...filters)).orderBy(desc(payrollTable.createdAt));
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.organizationId, tenantId(req)));
  const empMap = new Map(employees.map(e => [e.id, e.firstName + " " + e.lastName]));
  res.json(rows.map(r => ({ ...r, baseSalary: Number(r.baseSalary), overtime: Number(r.overtime), bonuses: Number(r.bonuses), deductions: Number(r.deductions), insurance: Number(r.insurance), tax: Number(r.tax), netPay: Number(r.netPay), employeeName: empMap.get(r.employeeId) ?? null })));
});

router.post("/payroll", requirePermission("hr.create"), async (req, res): Promise<void> => {
  const { employeeId, periodStart, periodEnd, baseSalary, overtime, bonuses, deductions, insurance, tax, notes } = req.body;
  if (!employeeId || !periodStart || !periodEnd) { res.status(400).json({ error: "employeeId, periodStart, periodEnd are required" }); return; }
  const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, employeeId), eq(employeesTable.organizationId, tenantId(req))));
  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }
  const bs = Number(baseSalary) || 0;
  const ot = Number(overtime) || 0;
  const bn = Number(bonuses) || 0;
  const dd = Number(deductions) || 0;
  const ins = Number(insurance) || 0;
  const tx = Number(tax) || 0;
  const netPay = bs + ot + bn - dd - ins - tx;
  const [row] = await db.insert(payrollTable).values({
    employeeId, organizationId: tenantId(req), periodStart, periodEnd,
    baseSalary: bs.toString(), overtime: ot.toString(), bonuses: bn.toString(),
    deductions: dd.toString(), insurance: ins.toString(), tax: tx.toString(),
    netPay: netPay.toString(), notes, createdBy: req.vetraUser!.id,
  }).returning();
  res.status(201).json({ ...row, baseSalary: Number(row.baseSalary), overtime: Number(row.overtime), bonuses: Number(row.bonuses), deductions: Number(row.deductions), insurance: Number(row.insurance), tax: Number(row.tax), netPay: Number(row.netPay) });
  audit(req, "payroll.created", "payroll", { resourceId: row.id, newValues: { employeeId, periodStart, periodEnd, netPay: row.netPay } });
});

router.patch("/payroll/:id", requirePermission("hr.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(payrollTable).where(and(eq(payrollTable.id, id), eq(payrollTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Payroll record not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Only draft payroll can be edited" }); return; }
  const upd: Record<string, unknown> = {};
  for (const k of ["notes"] as const) if (req.body[k] !== undefined) upd[k] = req.body[k];
  if (req.body.baseSalary !== undefined) upd.baseSalary = req.body.baseSalary.toString();
  if (req.body.overtime !== undefined) upd.overtime = req.body.overtime.toString();
  if (req.body.bonuses !== undefined) upd.bonuses = req.body.bonuses.toString();
  if (req.body.deductions !== undefined) upd.deductions = req.body.deductions.toString();
  if (req.body.insurance !== undefined) upd.insurance = req.body.insurance.toString();
  if (req.body.tax !== undefined) upd.tax = req.body.tax.toString();
  const bs = Number(upd.baseSalary ?? current.baseSalary);
  const ot = Number(upd.overtime ?? current.overtime);
  const bn = Number(upd.bonuses ?? current.bonuses);
  const dd = Number(upd.deductions ?? current.deductions);
  const ins = Number(upd.insurance ?? current.insurance);
  const tx = Number(upd.tax ?? current.tax);
  upd.netPay = (bs + ot + bn - dd - ins - tx).toString();
  upd.updatedAt = new Date();
  const [row] = await db.update(payrollTable).set(upd).where(and(eq(payrollTable.id, id), eq(payrollTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, baseSalary: Number(row.baseSalary), overtime: Number(row.overtime), bonuses: Number(row.bonuses), deductions: Number(row.deductions), insurance: Number(row.insurance), tax: Number(row.tax), netPay: Number(row.netPay) });
  audit(req, "payroll.updated", "payroll", { resourceId: id, oldValues: { status: current.status }, newValues: { status: row.status } });
});

router.post("/payroll/:id/pay", requirePermission("hr.update"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(payrollTable).where(and(eq(payrollTable.id, id), eq(payrollTable.organizationId, tenantId(req))));
  if (!current) { res.status(404).json({ error: "Payroll record not found" }); return; }
  if (current.status !== "draft") { res.status(409).json({ error: "Only draft payroll can be paid" }); return; }
  const [row] = await db.update(payrollTable).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(payrollTable.id, id), eq(payrollTable.organizationId, tenantId(req)))).returning();
  res.json({ ...row, baseSalary: Number(row.baseSalary), overtime: Number(row.overtime), bonuses: Number(row.bonuses), deductions: Number(row.deductions), insurance: Number(row.insurance), tax: Number(row.tax), netPay: Number(row.netPay) });
  audit(req, "payroll.paid", "payroll", { resourceId: id, newValues: { status: "paid" } });
  // Notify the linked user for this payroll
  if (row.employeeId) {
    const [emp] = await db.select({ userId: employeesTable.userId }).from(employeesTable)
      .where(and(eq(employeesTable.id, row.employeeId), eq(employeesTable.organizationId, tenantId(req))));
    if (emp?.userId) createNotification({ organizationId: tenantId(req), userId: emp.userId, title: "حقوق پرداخت شد", message: `حقوق دوره ${row.periodStart} تا ${row.periodEnd} پرداخت شد`, type: "payroll_paid", link: `/hr/payroll/${row.id}` });
  }
});

// ─── Payroll Auto-Calculation ──────────────────────────────────────────────

 /**
  * Auto-calculate payroll for an employee in a given period.
  *
  * Overtime is computed from attendance records (hours worked beyond 8h/day).
  * Insurance is calculated as 7% of base salary (standard Iranian rate).
  * Tax is calculated using a simplified progressive bracket.
  * Net pay = baseSalary + overtime + bonuses - deductions - insurance - tax.
  */
 router.post("/payroll/calculate", requirePermission("hr.create"), async (req, res): Promise<void> => {
   const { employeeId, periodStart, periodEnd, baseSalary, bonuses, deductions, notes } = req.body;
   if (!employeeId || !periodStart || !periodEnd) {
     res.status(400).json({ error: "employeeId, periodStart, periodEnd are required" });
     return;
   }
   const [emp] = await db.select().from(employeesTable).where(
     and(eq(employeesTable.id, employeeId), eq(employeesTable.organizationId, tenantId(req)))
   );
   if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

   // Calculate overtime from attendance records in the period
   const attendanceAgg = await db
     .select({
       totalHours: sum(attendanceTable.hoursWorked).mapWith(Number),
       totalOvertime: sum(attendanceTable.overtimeHours).mapWith(Number),
       totalDays: sql<number>`count(*)`,
     })
     .from(attendanceTable)
     .where(
       and(
         eq(attendanceTable.employeeId, employeeId),
         eq(attendanceTable.organizationId, tenantId(req)),
         sql`${attendanceTable.date} >= ${periodStart}`,
         sql`${attendanceTable.date} <= ${periodEnd}`,
       )
     );

   const totalHours = Number(attendanceAgg[0]?.totalHours ?? 0);
   const totalOvertime = Number(attendanceAgg[0]?.totalOvertime ?? 0);
   const totalDays = Number(attendanceAgg[0]?.totalDays ?? 0);

   // Use the employee's daily wage or compute from monthly salary
   const empDailyWage = Number(emp.dailyWage) || (Number(emp.salary) / 30) || 0;
   const empMonthlySalary = Number(emp.salary) || (empDailyWage * 30) || 0;

   // Base salary for the period (pro-rated to actual working days)
   const bs = Number(baseSalary) || empMonthlySalary;
   const bn = Number(bonuses) || 0;
   const dd = Number(deductions) || 0;

   // Overtime: 1.4x of daily wage per overtime hour
   const hourlyWage = empDailyWage / 8;
   const ot = Math.round(totalOvertime * hourlyWage * 1.4 * 100) / 100;

   // Insurance: 7% of (base salary + overtime + bonuses)
   const grossForInsurance = bs + ot + bn;
   const ins = Math.round(grossForInsurance * 0.07 * 100) / 100;

   // Tax: simplified progressive brackets (monthly)
   const taxable = grossForInsurance - ins - dd;
   let tx = 0;
   if (taxable > 0) {
     if (taxable <= 5000000) tx = 0; // exempt up to 5M IRR
     else if (taxable <= 15000000) tx = (taxable - 5000000) * 0.10;
     else if (taxable <= 30000000) tx = 1000000 + (taxable - 15000000) * 0.15;
     else tx = 3250000 + (taxable - 30000000) * 0.20;
   }
   tx = Math.round(tx * 100) / 100;

   const netPay = Math.round((bs + ot + bn - dd - ins - tx) * 100) / 100;

   res.json({
     employeeId,
     employeeName: `${emp.firstName} ${emp.lastName}`,
     periodStart,
     periodEnd,
     baseSalary: bs,
     overtime: ot,
     bonuses: bn,
     deductions: dd,
     insurance: ins,
     tax: tx,
     netPay,
     calculationDetails: {
       totalDaysPresent: totalDays,
       totalHoursWorked: Math.round(totalHours * 10) / 10,
       totalOvertimeHours: Math.round(totalOvertime * 10) / 10,
       hourlyWage: Math.round(hourlyWage * 100) / 100,
       dailyWage: empDailyWage,
       monthlySalary: empMonthlySalary,
       insuranceRate: "7%",
     },
   });
 });

 // ─── Personnel Dashboard ────────────────────────────────────────────────────

 router.get("/dashboard/personnel", requirePermission("hr.read"), async (req, res): Promise<void> => {
   const organizationId = tenantId(req);

   const [employees, attendanceToday, payrollSummary] = await Promise.all([
     db.select().from(employeesTable).where(
       and(eq(employeesTable.organizationId, organizationId), isNull(employeesTable.deletedAt))
     ),
     db.select({
       total: sql<number>`count(*)`,
       present: sql<number>`count(*) filter (where ${attendanceTable.status} = 'present')`,
       absent: sql<number>`count(*) filter (where ${attendanceTable.status} = 'absent')`,
       late: sql<number>`count(*) filter (where ${attendanceTable.status} = 'late')`,
       onLeave: sql<number>`count(*) filter (where ${attendanceTable.status} = 'on_leave')`,
     }).from(attendanceTable).where(
       and(
         eq(attendanceTable.organizationId, organizationId),
         sql`${attendanceTable.date} = CURRENT_DATE`,
       )
     ),
     db.select({
       totalDraft: sql<number>`count(*) filter (where ${payrollTable.status} = 'draft')`,
       totalPaid: sql<number>`count(*) filter (where ${payrollTable.status} = 'paid')`,
       totalPayrollAmount: sum(payrollTable.netPay).mapWith(Number),
       thisMonthPayroll: sum(payrollTable.netPay)
         .mapWith(Number)
         .as("this_month"),
     }).from(payrollTable).where(
       and(
         eq(payrollTable.organizationId, organizationId),
         sql`${payrollTable.periodStart} >= date_trunc('month', CURRENT_DATE)`,
       )
     ),
   ]);

   // Department breakdown
   const deptMap = new Map<string, number>();
   employees.forEach((e) => {
     const dept = e.department || "General";
     deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
   });
   const departmentBreakdown = Array.from(deptMap.entries()).map(([department, count]) => ({
     department,
     count,
   }));

   const activeCount = employees.filter((e) => e.status === "active").length;
   const inactiveCount = employees.filter((e) => e.status !== "active").length;

   res.json({
     totalEmployees: employees.length,
     activeEmployees: activeCount,
     inactiveEmployees: inactiveCount,
     departmentBreakdown,
     attendanceToday: {
       total: Number(attendanceToday[0]?.total ?? 0),
       present: Number(attendanceToday[0]?.present ?? 0),
       absent: Number(attendanceToday[0]?.absent ?? 0),
       late: Number(attendanceToday[0]?.late ?? 0),
       onLeave: Number(attendanceToday[0]?.onLeave ?? 0),
     },
     payrollSummary: {
       draftCount: Number(payrollSummary[0]?.totalDraft ?? 0),
       paidCount: Number(payrollSummary[0]?.totalPaid ?? 0),
       totalPayrollAmount: Number(payrollSummary[0]?.totalPayrollAmount ?? 0),
       thisMonthPayroll: Number(payrollSummary[0]?.thisMonthPayroll ?? 0),
     },
   });
 });

 export default router;
