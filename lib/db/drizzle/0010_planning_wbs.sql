-- VETRA-PLAN-01: Server-side WBS and activity baseline

CREATE TABLE IF NOT EXISTS "work_breakdown_structures" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id"),
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "parent_id" integer,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0 CHECK ("sort_order" >= 0),
  "created_by" integer REFERENCES "users"("id"),
  "updated_by" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  CONSTRAINT work_breakdown_structures_parent_id_fkey FOREIGN KEY ("parent_id") REFERENCES "work_breakdown_structures"("id") ON DELETE RESTRICT,
  CONSTRAINT work_breakdown_structures_project_code_unique UNIQUE ("project_id", "code")
);

CREATE TABLE IF NOT EXISTS "planning_activities" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id"),
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "wbs_id" integer NOT NULL REFERENCES "work_breakdown_structures"("id") ON DELETE RESTRICT,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "activity_type" text NOT NULL DEFAULT 'task' CHECK ("activity_type" IN ('task', 'milestone')),
  "planned_start" date NOT NULL,
  "planned_finish" date NOT NULL,
  "duration_days" integer NOT NULL CHECK ("duration_days" >= 0),
  "status" text NOT NULL DEFAULT 'not_started' CHECK ("status" IN ('not_started', 'in_progress', 'completed')),
  "created_by" integer REFERENCES "users"("id"),
  "updated_by" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  CONSTRAINT planning_activities_date_range_check CHECK ("planned_finish" >= "planned_start"),
  CONSTRAINT planning_activities_milestone_duration_check CHECK (("activity_type" <> 'milestone') OR "duration_days" = 0),
  CONSTRAINT planning_activities_project_code_unique UNIQUE ("project_id", "code")
);

CREATE INDEX IF NOT EXISTS "wbs_active_project_parent_idx" ON "work_breakdown_structures" ("organization_id", "project_id", "parent_id", "sort_order") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS "planning_activities_active_project_wbs_idx" ON "planning_activities" ("organization_id", "project_id", "wbs_id", "planned_start") WHERE "deleted_at" IS NULL;

ALTER TABLE "work_breakdown_structures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "work_breakdown_structures" FORCE ROW LEVEL SECURITY;
ALTER TABLE "planning_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planning_activities" FORCE ROW LEVEL SECURITY;
SELECT create_tenant_rls_policy('work_breakdown_structures', 'organization_id');
SELECT create_tenant_rls_policy('planning_activities', 'organization_id');

GRANT SELECT, INSERT, UPDATE ON "work_breakdown_structures", "planning_activities" TO vetra_app;
GRANT SELECT ON "work_breakdown_structures", "planning_activities" TO vetra_readonly;
GRANT USAGE, SELECT ON SEQUENCE "work_breakdown_structures_id_seq", "planning_activities_id_seq" TO vetra_app, vetra_readonly;
