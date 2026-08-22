-- VETRA-SEC-06: Request-scoped PostgreSQL RLS context
-- ======================================================
-- Replaces request-time session context with SET LOCAL semantics. The context
-- is therefore cleared automatically when the request transaction commits or
-- rolls back, before its pooled connection can serve another tenant.

-- ─── Transaction-local context helpers ──────────────────────────────────────

CREATE OR REPLACE FUNCTION set_request_organization_context(org_id integer)
RETURNS void AS $$
BEGIN
  IF org_id IS NULL OR org_id <= 0 THEN
    RAISE EXCEPTION 'organization context must be a positive integer';
  END IF;

  PERFORM set_config('app.current_organization_id', org_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION set_request_clerk_user_context(clerk_user_id text)
RETURNS void AS $$
BEGIN
  IF clerk_user_id IS NULL OR length(trim(clerk_user_id)) = 0 THEN
    RAISE EXCEPTION 'Clerk user context must be present';
  END IF;

  PERFORM set_config('app.current_clerk_user_id', clerk_user_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp;

REVOKE ALL ON FUNCTION set_request_organization_context(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_request_clerk_user_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_request_organization_context(integer) TO vetra_app, vetra_migration;
GRANT EXECUTE ON FUNCTION set_request_clerk_user_context(text) TO vetra_app, vetra_migration;

--> statement-breakpoint

-- ─── Bootstrap policy for authenticated identity resolution ──────────────────
-- `users` is tenant-scoped and normally fails closed without an organization
-- context. Before the organization is known, an authenticated Clerk identity
-- may read only its own active mapping row. clerk_user_id is unique, and the
-- setting is transaction-local, so this policy cannot enumerate other users.

DROP POLICY IF EXISTS users_clerk_identity_bootstrap_select ON "users";
CREATE POLICY users_clerk_identity_bootstrap_select ON "users"
  FOR SELECT
  USING (
    "active" = true
    AND "clerk_user_id" = NULLIF(current_setting('app.current_clerk_user_id', true), '')
  );

--> statement-breakpoint

-- ─── Verification ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_request_organization_context'
  ) THEN
    RAISE EXCEPTION 'VETRA-SEC-06 request organization context helper was not created';
  END IF;
END $$;
