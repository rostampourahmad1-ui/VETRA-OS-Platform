 -- ============================================================================
 -- VETRA-INFRA-01: Table-Level Privileges for Non-Owner Roles
 -- ============================================================================
 -- Grants explicit, table-by-table privileges for vetra_app, vetra_readonly,
 -- and vetra_migration roles.
 --
 -- vetra_app: CRUD on business tables, INSERT-only on audit_logs
 -- vetra_readonly: SELECT on all tables
 -- vetra_migration: DDL owner (ALL PRIVILEGES)
 --
 -- IMPORTANT: RLS policies (migration 0004) enforce tenant isolation.
 -- vetra_app cannot bypass RLS. FORCE ROW LEVEL SECURITY ensures fail-closed.
 -- ============================================================================
 
 -- ─── Business tables: CRUD for vetra_app ─────────────────────────────────
 -- RLS policies enforce tenant isolation at the row level.
 -- These grants are safe because RLS is FORCEd and fail-closed.
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tasks TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contracts TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE daily_reports TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE meetings TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE equipment TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE inventory TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE procurement TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE activity TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE documents TO vetra_app;
 GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE roles TO vetra_app;
 
 --> statement-breakpoint
 
 -- ─── Shared reference tables: SELECT only for vetra_app ──────────────────
 GRANT SELECT ON TABLE organizations TO vetra_app;
 GRANT SELECT ON TABLE permissions TO vetra_app;
 GRANT SELECT ON TABLE role_permissions TO vetra_app;
 
 --> statement-breakpoint
 
 -- ─── audit_logs: INSERT-only for vetra_app (append-only) ─────────────────
 -- UPDATE/DELETE are blocked by triggers at the DB level.
 GRANT INSERT ON TABLE audit_logs TO vetra_app;
 
 --> statement-breakpoint
 
 -- ─── Read-only role: SELECT on all tables ─────────────────────────────────
 GRANT SELECT ON TABLE users TO vetra_readonly;
 GRANT SELECT ON TABLE projects TO vetra_readonly;
 GRANT SELECT ON TABLE tasks TO vetra_readonly;
 GRANT SELECT ON TABLE contracts TO vetra_readonly;
 GRANT SELECT ON TABLE daily_reports TO vetra_readonly;
 GRANT SELECT ON TABLE meetings TO vetra_readonly;
 GRANT SELECT ON TABLE equipment TO vetra_readonly;
 GRANT SELECT ON TABLE inventory TO vetra_readonly;
 GRANT SELECT ON TABLE procurement TO vetra_readonly;
 GRANT SELECT ON TABLE activity TO vetra_readonly;
 GRANT SELECT ON TABLE documents TO vetra_readonly;
 GRANT SELECT ON TABLE roles TO vetra_readonly;
 GRANT SELECT ON TABLE organizations TO vetra_readonly;
 GRANT SELECT ON TABLE permissions TO vetra_readonly;
 GRANT SELECT ON TABLE role_permissions TO vetra_readonly;
 GRANT SELECT ON TABLE audit_logs TO vetra_readonly;
 
 --> statement-breakpoint
 
 -- ─── Migration role: full DDL owner ───────────────────────────────────────
 GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vetra_migration;
 GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO vetra_migration;
 GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vetra_migration;
 
 --> statement-breakpoint
 
 -- ─── Function access for vetra_app ────────────────────────────────────────
 -- Only the RLS context setter function. SECURITY DEFINER functions
 -- (create_tenant_rls_policy, prevent_audit_log_modification) are NOT
 -- granted to the application role.
 GRANT EXECUTE ON FUNCTION set_organization_context(integer) TO vetra_app;
 GRANT EXECUTE ON FUNCTION set_organization_context(integer) TO vetra_readonly;
 
 --> statement-breakpoint
 
 -- ─── Verify ────────────────────────────────────────────────────────────────
 DO $$
 DECLARE
   app_count integer;
   ro_count integer;
 BEGIN
   SELECT count(*) INTO app_count FROM information_schema.role_table_grants
   WHERE grantee = 'vetra_app' AND table_schema = 'public';
   SELECT count(*) INTO ro_count FROM information_schema.role_table_grants
   WHERE grantee = 'vetra_readonly' AND table_schema = 'public';
   RAISE NOTICE 'VETRA-INFRA-01: Table grants — app: %, readonly: %', app_count, ro_count;
 END $$;
