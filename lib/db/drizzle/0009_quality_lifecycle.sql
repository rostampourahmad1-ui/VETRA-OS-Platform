-- VETRA-QUALITY-01: Auditable Quality/NCR lifecycle
-- ====================================================
-- Adds standard audit metadata, soft delete, immutable lifecycle events, RLS,
-- and a constrained workflow linkage for NCR approval.

-- ─── Extend existing records without deleting or rewriting business data ─────

ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "created_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

ALTER TABLE "non_conformance_reports"
  ADD COLUMN IF NOT EXISTS "workflow_run_id" integer,
  ADD COLUMN IF NOT EXISTS "created_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "deleted_by" integer REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'non_conformance_reports_workflow_run_id_fkey'
  ) THEN
    ALTER TABLE "non_conformance_reports"
      ADD CONSTRAINT non_conformance_reports_workflow_run_id_fkey
      FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE "inspections"
  DROP CONSTRAINT IF EXISTS inspections_status_check,
  ADD CONSTRAINT inspections_status_check CHECK ("status" IN ('planned', 'in_progress', 'completed', 'cancelled'));

ALTER TABLE "non_conformance_reports"
  DROP CONSTRAINT IF EXISTS non_conformance_reports_status_check,
  ADD CONSTRAINT non_conformance_reports_status_check CHECK ("status" IN ('open', 'in_progress', 'resolved', 'awaiting_approval', 'closed'));

--> statement-breakpoint

-- ─── Immutable lifecycle events ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "quality_events" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "project_id" integer NOT NULL REFERENCES "projects"("id"),
  "entity_type" text NOT NULL CHECK ("entity_type" IN ('inspection', 'non_conformance_report')),
  "entity_id" integer NOT NULL,
  "event_type" text NOT NULL CHECK ("event_type" IN (
    'created', 'updated', 'transitioned', 'workflow_submitted',
    'workflow_approved', 'workflow_rejected', 'workflow_revision_requested', 'deleted'
  )),
  "previous_status" text,
  "next_status" text,
  "reason" text,
  "snapshot" jsonb,
  "actor_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inspections_active_tenant_project_idx"
  ON "inspections" ("organization_id", "project_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "ncr_active_tenant_project_idx"
  ON "non_conformance_reports" ("organization_id", "project_id", "status") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ncr_active_workflow_run_idx"
  ON "non_conformance_reports" ("workflow_run_id") WHERE "workflow_run_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "quality_events_tenant_entity_idx"
  ON "quality_events" ("organization_id", "entity_type", "entity_id", "created_at");

--> statement-breakpoint

-- ─── RLS and immutable event protection ──────────────────────────────────────

ALTER TABLE "inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inspections" FORCE ROW LEVEL SECURITY;
ALTER TABLE "non_conformance_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "non_conformance_reports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "quality_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quality_events" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('inspections', 'organization_id');
SELECT create_tenant_rls_policy('non_conformance_reports', 'organization_id');
SELECT create_tenant_rls_policy('quality_events', 'organization_id');

CREATE OR REPLACE FUNCTION prevent_quality_event_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'quality_events table is append-only: % is forbidden', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quality_events_no_update ON "quality_events";
CREATE TRIGGER quality_events_no_update
  BEFORE UPDATE ON "quality_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_quality_event_modification();

DROP TRIGGER IF EXISTS quality_events_no_delete ON "quality_events";
CREATE TRIGGER quality_events_no_delete
  BEFORE DELETE ON "quality_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_quality_event_modification();

--> statement-breakpoint

-- ─── Least-privilege application access ─────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON "inspections", "non_conformance_reports" TO vetra_app;
GRANT SELECT, INSERT ON "quality_events" TO vetra_app;
GRANT SELECT ON "inspections", "non_conformance_reports", "quality_events" TO vetra_readonly;
GRANT USAGE, SELECT ON SEQUENCE "quality_events_id_seq" TO vetra_app, vetra_readonly;
