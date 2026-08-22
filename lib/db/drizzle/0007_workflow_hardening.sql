-- VETRA-WORKFLOW-01: auditable approvals and RLS for workflow persistence
-- This migration is additive and does not rewrite or delete existing workflow data.

ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "created_by" integer REFERENCES "users"("id");
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id");
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
ALTER TABLE "workflows" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
CREATE INDEX IF NOT EXISTS "workflows_organization_id_idx" ON "workflows" ("organization_id");

ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id");
ALTER TABLE "workflow_runs" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;
CREATE INDEX IF NOT EXISTS "workflow_runs_organization_id_idx" ON "workflow_runs" ("organization_id");
CREATE INDEX IF NOT EXISTS "workflow_runs_workflow_id_idx" ON "workflow_runs" ("workflow_id");
CREATE INDEX IF NOT EXISTS "workflow_steps_workflow_order_idx" ON "workflow_steps" ("workflow_id", "step_order");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "workflow_run_events" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "workflow_run_id" integer NOT NULL REFERENCES "workflow_runs"("id") ON DELETE CASCADE,
  "workflow_step_id" integer REFERENCES "workflow_steps"("id"),
  "action" text NOT NULL CHECK ("action" IN ('submitted', 'approved', 'rejected', 'revision_requested')),
  "comment" text,
  "actor_id" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_run_events_organization_id_idx" ON "workflow_run_events" ("organization_id");
CREATE INDEX IF NOT EXISTS "workflow_run_events_run_id_idx" ON "workflow_run_events" ("workflow_run_id");

--> statement-breakpoint

-- Existing workflow data is tenant-bound as well. Enforce a fail-closed policy
-- on workflows and runs, and a parent-workflow policy on steps.
ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflows" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workflow_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workflow_run_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_run_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workflow_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workflow_steps" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('workflows', 'organization_id');
SELECT create_tenant_rls_policy('workflow_runs', 'organization_id');
SELECT create_tenant_rls_policy('workflow_run_events', 'organization_id');

CREATE POLICY "workflow_steps_tenant_isolation"
ON public."workflow_steps"
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public."workflows" w
    WHERE w."id" = "workflow_steps"."workflow_id"
      AND w."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."workflows" w
    WHERE w."id" = "workflow_steps"."workflow_id"
      AND w."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::integer
  )
);

--> statement-breakpoint

-- Decision events are append-only at the database boundary.
CREATE OR REPLACE FUNCTION prevent_workflow_event_modification()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'workflow_run_events are append-only: % is forbidden', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_run_events_no_update
  BEFORE UPDATE ON "workflow_run_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_workflow_event_modification();

CREATE TRIGGER workflow_run_events_no_delete
  BEFORE DELETE ON "workflow_run_events"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_workflow_event_modification();

--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workflows" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workflow_steps" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "workflow_runs" TO vetra_app;
GRANT SELECT, INSERT ON TABLE "workflow_run_events" TO vetra_app;

GRANT SELECT ON TABLE "workflows" TO vetra_readonly;
GRANT SELECT ON TABLE "workflow_steps" TO vetra_readonly;
GRANT SELECT ON TABLE "workflow_runs" TO vetra_readonly;
GRANT SELECT ON TABLE "workflow_run_events" TO vetra_readonly;

-- Roles are created before migrations; explicitly grant the new event sequence.
GRANT USAGE, SELECT ON SEQUENCE "workflow_run_events_id_seq" TO vetra_app;
GRANT SELECT ON SEQUENCE "workflow_run_events_id_seq" TO vetra_readonly;
