 -- ============================================================================
 -- VETRA-INFRA-01: Non-Owner Database Role Architecture
 -- ============================================================================
 -- Creates separate roles for application, migration, and read-only workloads.
 -- Table-level privileges are granted by migration 0005_db_roles.sql.
 --
 -- This script runs at container init, BEFORE migrations.
 -- It only creates roles and grants schema-level access.
 -- ============================================================================
 
 -- ─── Application Role (non-owner, RLS-enforced) ──────────────────────────
 -- Used by the API server for all CRUD. Cannot bypass RLS or modify schema.
 DO $$
 BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetra_app') THEN
     CREATE ROLE vetra_app WITH LOGIN;
   END IF;
 END $$;
 
 -- ─── Migration Role (DDL-capable) ─────────────────────────────────────────
 -- Used ONLY for running Drizzle migrations. Never used by the application.
 DO $$
 BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetra_migration') THEN
     CREATE ROLE vetra_migration WITH LOGIN;
   END IF;
 END $$;
 
 -- ─── Read-Only Role (reporting, analytics) ────────────────────────────────
 DO $$
 BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetra_readonly') THEN
     CREATE ROLE vetra_readonly WITH LOGIN;
   END IF;
 END $$;
 
 -- ─── Schema access ────────────────────────────────────────────────────────
 GRANT USAGE ON SCHEMA public TO vetra_app;
 GRANT USAGE ON SCHEMA public TO vetra_readonly;
 GRANT USAGE, CREATE ON SCHEMA public TO vetra_migration;
 
 -- ─── Sequence access (needed for SERIAL columns) ──────────────────────────
 GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vetra_app;
 GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vetra_readonly;
 GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vetra_migration;
 
 -- ─── Verify ────────────────────────────────────────────────────────────────
 DO $$
 DECLARE
   r record;
 BEGIN
   FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'vetra_%' LOOP
     RAISE NOTICE 'VETRA-INFRA-01: Role created — %', r.rolname;
   END LOOP;
 END $$;
