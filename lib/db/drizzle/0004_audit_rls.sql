-- VETRA-SEC-04 & VETRA-SEC-05: Audit Logging & Row-Level Security
-- ================================================================
-- Adds:
--   1. audit_logs table for immutable audit trail
--   2. RLS policies on all tenant-scoped tables (FAIL-CLOSED)
--   3. FORCE ROW LEVEL SECURITY on all tables (no owner bypass)
--   4. Append-only trigger on audit_logs
--   5. Helper function for setting organization context

-- ─── Audit Logs Table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "actor_id" integer REFERENCES "users"("id"),
  "actor_clerk_id" text,
  "action" text NOT NULL,
  "resource" text NOT NULL,
  "resource_id" text,
  "old_values" jsonb,
  "new_values" jsonb,
  "metadata" jsonb,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_logs_organization_id_idx" ON "audit_logs" ("organization_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_resource_idx" ON "audit_logs" ("resource");
CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_idx" ON "audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");

--> statement-breakpoint

-- ─── RLS: Organization Context Helper ──────────────────────────────────────

-- Sets the current organization context for the session.
-- The application MUST call this inside a transaction/connection
-- before any query on tenant-scoped tables.
-- SECURITY DEFINER + search_path hardening prevents function hijacking.
CREATE OR REPLACE FUNCTION set_organization_context(org_id integer)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_organization_id', org_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp;

--> statement-breakpoint

-- ─── RLS: Enable + FORCE on all tenant-scoped tables ───────────────────────
-- FORCE ROW LEVEL SECURITY prevents even the table owner from bypassing RLS.
-- This is critical: the DB owner role used by the app must not see
-- cross-tenant data even if RLS context is not set.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "daily_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_reports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment" FORCE ROW LEVEL SECURITY;
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory" FORCE ROW LEVEL SECURITY;
ALTER TABLE "procurement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity" FORCE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;

-- NOTE: "notifications" table excluded because it currently lacks
-- an organization_id column. Add it in a future migration.

--> statement-breakpoint

-- ─── RLS: Tenant Isolation Policy Creator ──────────────────────────────────

-- Creates a tenant isolation policy on a table.
-- FAIL-CLOSED: when app.current_organization_id is not set, the
-- NULLIF returns NULL, and the comparison evaluates to NULL (= false),
-- so ZERO rows are visible. This is the secure default.
CREATE OR REPLACE FUNCTION create_tenant_rls_policy(
  target_table text,
  target_column text DEFAULT 'organization_id'
)
RETURNS void AS $$
DECLARE
  policy_name text;
BEGIN
  -- SELECT policy
  policy_name := target_table || '_tenant_isolation_select';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = policy_name AND tablename = target_table
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (
        %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::integer
      )',
      policy_name, target_table, target_column
    );
  END IF;

  -- INSERT policy
  policy_name := target_table || '_tenant_isolation_insert';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = policy_name AND tablename = target_table
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
        %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::integer
      )',
      policy_name, target_table, target_column
    );
  END IF;

  -- UPDATE policy
  policy_name := target_table || '_tenant_isolation_update';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = policy_name AND tablename = target_table
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE USING (
        %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::integer
      ) WITH CHECK (
        %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::integer
      )',
      policy_name, target_table, target_column, target_column
    );
  END IF;

  -- DELETE policy
  policy_name := target_table || '_tenant_isolation_delete';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = policy_name AND tablename = target_table
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE USING (
        %I = NULLIF(current_setting(''app.current_organization_id'', true), '''')::integer
      )',
      policy_name, target_table, target_column
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp;

--> statement-breakpoint

-- ─── RLS: Apply Policies to All Tenant Tables ──────────────────────────────

SELECT create_tenant_rls_policy('users', 'organization_id');
SELECT create_tenant_rls_policy('projects', 'organization_id');
SELECT create_tenant_rls_policy('tasks', 'organization_id');
SELECT create_tenant_rls_policy('contracts', 'organization_id');
SELECT create_tenant_rls_policy('daily_reports', 'organization_id');
SELECT create_tenant_rls_policy('meetings', 'organization_id');
SELECT create_tenant_rls_policy('equipment', 'organization_id');
SELECT create_tenant_rls_policy('inventory', 'organization_id');
SELECT create_tenant_rls_policy('procurement', 'organization_id');
SELECT create_tenant_rls_policy('activity', 'organization_id');
SELECT create_tenant_rls_policy('documents', 'organization_id');
SELECT create_tenant_rls_policy('audit_logs', 'organization_id');
SELECT create_tenant_rls_policy('roles', 'organization_id');

--> statement-breakpoint

-- ─── Audit Logs: Append-Only Protection ─────────────────────────────────────

-- Prevents any UPDATE or DELETE on audit_logs at the database level.
-- This is a critical security control: audit trails must be immutable.
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs table is append-only: % is forbidden', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_modification();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_modification();

--> statement-breakpoint

-- ─── RLS: Bypass for organizations table (shared metadata) ─────────────────

-- organizations table is read by all tenants for name resolution.
-- RLS is NOT enabled on organizations, permissions, or role_permissions
-- as these are shared reference tables.

--> statement-breakpoint

-- ─── Verify: Count RLS policies created ────────────────────────────────────

DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE policyname LIKE '%_tenant_isolation_%';
  RAISE NOTICE 'VETRA-SEC-05: % tenant isolation RLS policies created', policy_count;
END $$;
