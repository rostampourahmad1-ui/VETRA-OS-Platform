-- VETRA-SEC-07: Tenant-scoped RLS for HR, Procurement-Ext, Scheduling, Phase2, BOQ, Planning, and RBAC tables
-- =========================================================================================================
-- Adds RLS (ENABLE + FORCE) and tenant isolation policies to all tables that have organization_id

-- ─── 0. Schema prerequisites ────────────────────────────────────────────────
-- These tables are part of the Drizzle schema but were previously absent from
-- the replayable SQL history. Keep creation additive so existing databases
-- retain their data while fresh CI databases can apply the full history.

CREATE TABLE IF NOT EXISTS "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"category_id" integer,
	"name" text NOT NULL,
	"amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"period" text DEFAULT 'annual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text,
	"phone" text,
	"type" text DEFAULT 'client' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"category_id" integer,
	"submitted_by" integer,
	"description" text NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"phase_id" integer,
	"name" text NOT NULL,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"color" text DEFAULT '#2563eb' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "boq_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" numeric(15, 3) DEFAULT '0' NOT NULL,
	"unit_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"parent_id" integer,
	"level" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "payment_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"title" text NOT NULL,
	"certificate_number" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"previous_cumulative" numeric(15, 2) DEFAULT '0' NOT NULL,
	"this_period" numeric(15, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(15, 2) DEFAULT '0' NOT NULL,
	"retention" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cumulative_to_date" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "qto_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"boq_item_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"design_quantity" numeric(15, 3) DEFAULT '0' NOT NULL,
	"field_quantity" numeric(15, 3) DEFAULT '0' NOT NULL,
	"waste_factor" numeric(5, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"date" date NOT NULL,
	"check_in" text,
	"check_out" text,
	"status" text DEFAULT 'present' NOT NULL,
	"hours_worked" numeric(5, 1),
	"overtime_hours" numeric(5, 1),
	"notes" text,
	"recorded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"code" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"national_id" text,
	"phone" text NOT NULL,
	"email" text,
	"position" text NOT NULL,
	"department" text,
	"project_id" integer,
	"user_id" integer,
	"hire_date" date NOT NULL,
	"salary" numeric(15, 2) DEFAULT '0' NOT NULL,
	"daily_wage" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"gender" text,
	"insurance_number" text,
	"bank_account" text,
	"address" text,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"base_salary" numeric(15, 2) DEFAULT '0' NOT NULL,
	"overtime" numeric(15, 2) DEFAULT '0' NOT NULL,
	"bonuses" numeric(15, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(15, 2) DEFAULT '0' NOT NULL,
	"insurance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_pay" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"min_stock" numeric(12, 2),
	"current_stock" numeric(12, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"supplier_id" integer,
	"project_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "procurement_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"procurement_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"material_id" integer,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"received_quantity" numeric(12, 3) DEFAULT '0' NOT NULL,
	"warehouse_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"tax_id" text,
	"category" text,
	"rating" integer DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "warehouse" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"manager" text,
	"project_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "activity_dependencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"predecessor_id" integer NOT NULL,
	"successor_id" integer NOT NULL,
	"dependency_type" text DEFAULT 'FS' NOT NULL,
	"lag_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "actual_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"actual_start" date,
	"actual_finish" date,
	"actual_cost" numeric(15, 2),
	"actual_labor_hours" numeric(10, 1),
	"physical_progress" integer DEFAULT 0,
	"status" text DEFAULT 'not_started' NOT NULL,
	"notes" text,
	"recorded_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "baseline_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"baseline_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"planned_start" date NOT NULL,
	"planned_finish" date NOT NULL,
	"duration_days" integer NOT NULL,
	"planned_cost" numeric(15, 2) DEFAULT '0' NOT NULL,
	"planned_labor_hours" numeric(10, 1) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "baselines" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"is_active" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "calendar_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"calendar_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"exception_date" date NOT NULL,
	"is_working_day" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "evm_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"baseline_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"planned_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"earned_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	"actual_cost" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cost_variance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"schedule_variance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"cost_performance_index" numeric(5, 2) DEFAULT '1' NOT NULL,
	"schedule_performance_index" numeric(5, 2) DEFAULT '1' NOT NULL,
	"estimate_at_completion" numeric(15, 2),
	"estimate_to_complete" numeric(15, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "project_calendars" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" integer DEFAULT 0 NOT NULL,
	"work_days" text DEFAULT '1,2,3,4,5,6' NOT NULL,
	"work_start_hour" text DEFAULT '08:00' NOT NULL,
	"work_end_hour" text DEFAULT '17:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"activity_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"resource_type_id" integer NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '1' NOT NULL,
	"cost_per_unit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_cost" numeric(15, 2) DEFAULT '0' NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "resource_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"default_cost_per_unit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);


-- but were created without RLS coverage. Also handles user_roles via parent-based RLS through roles.
-- This migration is additive and idempotent (IF NOT EXISTS guards throughout).

-- ─── 1. HR Domain: employees, attendance, payroll ──────────────────────────

ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payroll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('employees', 'organization_id');
SELECT create_tenant_rls_policy('attendance', 'organization_id');
SELECT create_tenant_rls_policy('payroll', 'organization_id');

--> statement-breakpoint

-- ─── 2. Procurement-Ext Domain: suppliers, materials, warehouse, procurement_items ──

ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppliers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "materials" FORCE ROW LEVEL SECURITY;
ALTER TABLE "warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouse" FORCE ROW LEVEL SECURITY;
ALTER TABLE "procurement_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement_items" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('suppliers', 'organization_id');
SELECT create_tenant_rls_policy('materials', 'organization_id');
SELECT create_tenant_rls_policy('warehouse', 'organization_id');
SELECT create_tenant_rls_policy('procurement_items', 'organization_id');

--> statement-breakpoint

-- ─── 3. Scheduling & Gantt Domain: project_calendars, calendar_exceptions, activity_dependencies ──

ALTER TABLE "project_calendars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_calendars" FORCE ROW LEVEL SECURITY;
ALTER TABLE "calendar_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_exceptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "activity_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_dependencies" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('project_calendars', 'organization_id');
SELECT create_tenant_rls_policy('calendar_exceptions', 'organization_id');
SELECT create_tenant_rls_policy('activity_dependencies', 'organization_id');

--> statement-breakpoint

-- ─── 4. Scheduling: Baselines, Baseline Activities, Actual Progress, EVM ─────

ALTER TABLE "baselines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "baselines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "baseline_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "baseline_activities" FORCE ROW LEVEL SECURITY;
ALTER TABLE "actual_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "actual_progress" FORCE ROW LEVEL SECURITY;
ALTER TABLE "evm_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evm_metrics" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('baselines', 'organization_id');
SELECT create_tenant_rls_policy('baseline_activities', 'organization_id');
SELECT create_tenant_rls_policy('actual_progress', 'organization_id');
SELECT create_tenant_rls_policy('evm_metrics', 'organization_id');

--> statement-breakpoint

-- ─── 5. Scheduling: Resource Types & Resource Assignments ────────────────────

ALTER TABLE "resource_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_types" FORCE ROW LEVEL SECURITY;
ALTER TABLE "resource_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_assignments" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('resource_types', 'organization_id');
SELECT create_tenant_rls_policy('resource_assignments', 'organization_id');

--> statement-breakpoint

-- ─── 6. Phase2 Domain: expense_categories, budgets, expenses, clients ────────

ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "budgets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" FORCE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('expense_categories', 'organization_id');
SELECT create_tenant_rls_policy('budgets', 'organization_id');
SELECT create_tenant_rls_policy('expenses', 'organization_id');
SELECT create_tenant_rls_policy('clients', 'organization_id');

--> statement-breakpoint

-- ─── 7. BOQ Domain: boq_items, qto_items, payment_certificates ──────────────

ALTER TABLE "boq_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "boq_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "qto_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qto_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_certificates" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('boq_items', 'organization_id');
SELECT create_tenant_rls_policy('qto_items', 'organization_id');
SELECT create_tenant_rls_policy('payment_certificates', 'organization_id');

--> statement-breakpoint

-- ─── 8. Planning Domain: project_phases, milestones ─────────────────────────

ALTER TABLE "project_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project_phases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "milestones" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('project_phases', 'organization_id');
SELECT create_tenant_rls_policy('milestones', 'organization_id');

--> statement-breakpoint

-- ─── 9. RBAC: user_roles (parent-based RLS through roles table) ─────────────
-- user_roles does not have an organization_id column. Its tenant is inferred
-- from the parent roles table, following the same pattern as workflow_steps.

ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_tenant_isolation_select" ON "user_roles"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."role_id"
        AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
    )
  );

CREATE POLICY "user_roles_tenant_isolation_insert" ON "user_roles"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."role_id"
        AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
    )
  );

CREATE POLICY "user_roles_tenant_isolation_update" ON "user_roles"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."role_id"
        AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."role_id"
        AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
    )
  );

CREATE POLICY "user_roles_tenant_isolation_delete" ON "user_roles"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "roles" r
      WHERE r."id" = "user_roles"."role_id"
        AND r."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
    )
  );

--> statement-breakpoint

-- ─── 10. Grant table-level permissions to vetra_app ──────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "employees" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "attendance" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payroll" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "suppliers" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "materials" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "warehouse" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "procurement_items" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "project_calendars" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "calendar_exceptions" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "activity_dependencies" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "baselines" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "baseline_activities" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "actual_progress" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "evm_metrics" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "resource_types" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "resource_assignments" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "expense_categories" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "budgets" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "expenses" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "clients" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "boq_items" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "qto_items" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_certificates" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "project_phases" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "milestones" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_roles" TO vetra_app;

--> statement-breakpoint

-- ─── 11. Grant SELECT to vetra_readonly ─────────────────────────────────────

GRANT SELECT ON TABLE "employees" TO vetra_readonly;
GRANT SELECT ON TABLE "attendance" TO vetra_readonly;
GRANT SELECT ON TABLE "payroll" TO vetra_readonly;
GRANT SELECT ON TABLE "suppliers" TO vetra_readonly;
GRANT SELECT ON TABLE "materials" TO vetra_readonly;
GRANT SELECT ON TABLE "warehouse" TO vetra_readonly;
GRANT SELECT ON TABLE "procurement_items" TO vetra_readonly;
GRANT SELECT ON TABLE "project_calendars" TO vetra_readonly;
GRANT SELECT ON TABLE "calendar_exceptions" TO vetra_readonly;
GRANT SELECT ON TABLE "activity_dependencies" TO vetra_readonly;
GRANT SELECT ON TABLE "baselines" TO vetra_readonly;
GRANT SELECT ON TABLE "baseline_activities" TO vetra_readonly;
GRANT SELECT ON TABLE "actual_progress" TO vetra_readonly;
GRANT SELECT ON TABLE "evm_metrics" TO vetra_readonly;
GRANT SELECT ON TABLE "resource_types" TO vetra_readonly;
GRANT SELECT ON TABLE "resource_assignments" TO vetra_readonly;
GRANT SELECT ON TABLE "expense_categories" TO vetra_readonly;
GRANT SELECT ON TABLE "budgets" TO vetra_readonly;
GRANT SELECT ON TABLE "expenses" TO vetra_readonly;
GRANT SELECT ON TABLE "clients" TO vetra_readonly;
GRANT SELECT ON TABLE "boq_items" TO vetra_readonly;
GRANT SELECT ON TABLE "qto_items" TO vetra_readonly;
GRANT SELECT ON TABLE "payment_certificates" TO vetra_readonly;
GRANT SELECT ON TABLE "project_phases" TO vetra_readonly;
GRANT SELECT ON TABLE "milestones" TO vetra_readonly;
GRANT SELECT ON TABLE "user_roles" TO vetra_readonly;

--> statement-breakpoint

-- ─── 12. Grant sequence usage ───────────────────────────────────────────────

GRANT USAGE, SELECT ON SEQUENCE "employees_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "attendance_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "payroll_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "suppliers_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "materials_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "warehouse_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "procurement_items_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "project_calendars_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "calendar_exceptions_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "activity_dependencies_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "baselines_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "baseline_activities_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "actual_progress_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "evm_metrics_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "resource_types_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "resource_assignments_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "expense_categories_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "budgets_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "expenses_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "clients_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "boq_items_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "qto_items_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "payment_certificates_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "project_phases_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "milestones_id_seq" TO vetra_app;

GRANT SELECT ON SEQUENCE "employees_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "attendance_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "payroll_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "suppliers_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "materials_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "warehouse_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "procurement_items_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "project_calendars_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "calendar_exceptions_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "activity_dependencies_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "baselines_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "baseline_activities_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "actual_progress_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "evm_metrics_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "resource_types_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "resource_assignments_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "expense_categories_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "budgets_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "expenses_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "clients_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "boq_items_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "qto_items_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "payment_certificates_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "project_phases_id_seq" TO vetra_readonly;
GRANT SELECT ON SEQUENCE "milestones_id_seq" TO vetra_readonly;

--> statement-breakpoint

-- ─── 13. Verification ───────────────────────────────────────────────────────

DO $$ DECLARE
  total_policies integer;
  covered_tables integer;
BEGIN
  SELECT count(*) INTO total_policies
  FROM pg_policies
  WHERE policyname LIKE '%_tenant_isolation_%';

  SELECT count(DISTINCT tablename) INTO covered_tables
  FROM pg_policies
  WHERE policyname LIKE '%_tenant_isolation_%';

  RAISE NOTICE 'VETRA-SEC-07: % tenant isolation policies across % tables', total_policies, covered_tables;
END $$;
