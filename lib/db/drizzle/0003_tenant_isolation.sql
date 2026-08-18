-- Backfill and enforce organization ownership for legacy resource tables.
-- Project-owned rows inherit their tenant from the parent project. Rows that
-- cannot be mapped safely are rejected below instead of being assigned to an
-- arbitrary tenant.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "daily_reports" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "meetings" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "procurement" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "activity" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "organization_id" integer;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "storage_path" text;
--> statement-breakpoint

UPDATE "tasks" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "contracts" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "daily_reports" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "meetings" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "equipment" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "inventory" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "procurement" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS NULL;

UPDATE "documents" AS resource
SET "organization_id" = project."organization_id"
FROM "projects" AS project
WHERE resource."project_id" = project."id"
  AND resource."organization_id" IS DISTINCT FROM project."organization_id";
--> statement-breakpoint

-- Project-less equipment, inventory, procurement, and historical activity can
-- only be backfilled automatically in a strictly single-tenant deployment.
DO $$
DECLARE
  single_organization_id integer;
BEGIN
  IF (SELECT count(*) FROM "organizations") = 1 THEN
    SELECT "id" INTO single_organization_id FROM "organizations" LIMIT 1;

    UPDATE "equipment"
    SET "organization_id" = single_organization_id
    WHERE "organization_id" IS NULL;

    UPDATE "inventory"
    SET "organization_id" = single_organization_id
    WHERE "organization_id" IS NULL;

    UPDATE "procurement"
    SET "organization_id" = single_organization_id
    WHERE "organization_id" IS NULL;

    UPDATE "activity"
    SET "organization_id" = single_organization_id
    WHERE "organization_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint

-- Do not permit a multi-tenant deployment to continue with ambiguously owned
-- legacy data. Resolve these records deliberately, then rerun the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "tasks" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "contracts" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "daily_reports" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "meetings" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "equipment" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "inventory" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "procurement" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "activity" WHERE "organization_id" IS NULL
    UNION ALL SELECT 1 FROM "documents" WHERE "organization_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Tenant isolation migration found legacy records without a safe organization owner';
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "documents" ALTER COLUMN "organization_id" DROP DEFAULT;

ALTER TABLE "tasks" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "contracts" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "daily_reports" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "meetings" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "equipment" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "inventory" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "procurement" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "activity" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "documents" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_organization_id_organizations_id_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_organization_id_organizations_id_fk') THEN
    ALTER TABLE "contracts" ADD CONSTRAINT "contracts_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_reports_organization_id_organizations_id_fk') THEN
    ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_organization_id_organizations_id_fk') THEN
    ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'equipment_organization_id_organizations_id_fk') THEN
    ALTER TABLE "equipment" ADD CONSTRAINT "equipment_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_organization_id_organizations_id_fk') THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_organization_id_organizations_id_fk') THEN
    ALTER TABLE "procurement" ADD CONSTRAINT "procurement_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_organization_id_organizations_id_fk') THEN
    ALTER TABLE "activity" ADD CONSTRAINT "activity_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_organization_id_organizations_id_fk') THEN
    ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_organization_id_idx" ON "tasks" ("organization_id");
CREATE INDEX IF NOT EXISTS "contracts_organization_id_idx" ON "contracts" ("organization_id");
CREATE INDEX IF NOT EXISTS "daily_reports_organization_id_idx" ON "daily_reports" ("organization_id");
CREATE INDEX IF NOT EXISTS "meetings_organization_id_idx" ON "meetings" ("organization_id");
CREATE INDEX IF NOT EXISTS "equipment_organization_id_idx" ON "equipment" ("organization_id");
CREATE INDEX IF NOT EXISTS "inventory_organization_id_idx" ON "inventory" ("organization_id");
CREATE INDEX IF NOT EXISTS "procurement_organization_id_idx" ON "procurement" ("organization_id");
CREATE INDEX IF NOT EXISTS "activity_organization_id_idx" ON "activity" ("organization_id");
CREATE INDEX IF NOT EXISTS "documents_organization_id_idx" ON "documents" ("organization_id");
