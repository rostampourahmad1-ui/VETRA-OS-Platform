-- VETRA-SEC-08: Corrective migration for notifications organization_id=0 placeholder
-- ===================================================================================
-- Migration 0011 set organization_id=0 and user_id=0 as safety net for any
-- pre-existing NULL values before adding NOT NULL constraints. If those zero-valued
-- rows survived, they violate the FK constraints added in the same migration.
--
-- This migration:
-- 1. Removes any orphan rows with organization_id=0 or user_id=0 (no tenant owner)
-- 2. Re-asserts the FK constraints if they were silently skipped by 0011's IF NOT EXISTS

-- Step 1: Remove orphan rows that have no valid tenant or user reference
DELETE FROM "notifications" WHERE "organization_id" = 0 OR "user_id" = 0;
--> statement-breakpoint

-- Step 2: Re-assert FK constraints (idempotent via IF NOT EXISTS)
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_organization_id_organizations_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id");
  END IF;
END \$\$;
--> statement-breakpoint

-- Step 3: Verify no zero-org rows remain
DO \$\$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count FROM "notifications" WHERE "organization_id" = 0 OR "user_id" = 0;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'VETRA-SEC-08: % notification rows still have organization_id=0 or user_id=0', orphan_count;
  END IF;
  RAISE NOTICE 'VETRA-SEC-08: notifications corrective migration complete. No zero-org rows.';
END \$\$;