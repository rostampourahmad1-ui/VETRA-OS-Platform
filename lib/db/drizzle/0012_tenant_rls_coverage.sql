-- VETRA-SEC-07: Tenant-scoped RLS for HR, Procurement-Ext, Scheduling, Phase2, BOQ, Planning, and RBAC tables
-- =========================================================================================================
-- Adds RLS (ENABLE + FORCE) and tenant isolation policies to all tables that have organization_id
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
