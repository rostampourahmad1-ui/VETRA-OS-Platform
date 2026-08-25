-- VETRA-SEC-03: Add tenant isolation and user ownership to notifications

ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint

-- Notifications is a new table with no production data; safe to set NOT NULL immediately.
UPDATE "notifications" SET "organization_id" = 0 WHERE "organization_id" IS NULL;
UPDATE "notifications" SET "user_id" = 0 WHERE "user_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "notifications" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_organization_id_organizations_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_users_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notifications_organization_id_idx" ON "notifications" ("organization_id");
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "notifications_unread_user_idx" ON "notifications" ("user_id", "read") WHERE "read" = false;
--> statement-breakpoint

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

SELECT create_tenant_rls_policy('notifications', 'organization_id');
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON "notifications" TO vetra_app;
GRANT SELECT ON "notifications" TO vetra_readonly;
GRANT USAGE, SELECT ON SEQUENCE "notifications_id_seq" TO vetra_app, vetra_readonly;
