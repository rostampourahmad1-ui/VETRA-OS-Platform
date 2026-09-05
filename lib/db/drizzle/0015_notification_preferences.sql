-- VETRA-SEC-03: Add notification preferences table for opt-in/opt-out per type

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "type" text NOT NULL,
  "opt_in" boolean NOT NULL DEFAULT true,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("organization_id", "user_id", "type")
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "notification_prefs_type_idx"
  ON "notification_preferences" ("organization_id", "user_id", "type");
--> statement-breakpoint

-- Enable RLS on the new table
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Reuse the tenant RLS policy helper
SELECT create_tenant_rls_policy('notification_preferences', 'organization_id');
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "notification_preferences" TO vetra_app;
GRANT SELECT ON "notification_preferences" TO vetra_readonly;
