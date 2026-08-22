-- VETRA-FORM-01: Tenant-scoped form templates, immutable versions and submissions
-- This migration is additive. No existing business data is rewritten or removed.

CREATE TABLE IF NOT EXISTS "form_templates" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "project_id" integer REFERENCES "projects"("id"),
  "workflow_id" integer REFERENCES "workflows"("id"),
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
  "definition" jsonb NOT NULL CHECK (jsonb_typeof("definition") = 'object'),
  "created_by" integer NOT NULL REFERENCES "users"("id"),
  "updated_by" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "form_templates_organization_id_idx" ON "form_templates" ("organization_id");
CREATE INDEX IF NOT EXISTS "form_templates_project_id_idx" ON "form_templates" ("project_id");
CREATE INDEX IF NOT EXISTS "form_templates_workflow_id_idx" ON "form_templates" ("workflow_id");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "form_template_versions" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "template_id" integer NOT NULL REFERENCES "form_templates"("id"),
  "version" integer NOT NULL CHECK ("version" > 0),
  "definition" jsonb NOT NULL CHECK (jsonb_typeof("definition") = 'object'),
  "published_by" integer NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "form_template_versions_template_version_unique" UNIQUE ("template_id", "version")
);

CREATE INDEX IF NOT EXISTS "form_template_versions_organization_id_idx" ON "form_template_versions" ("organization_id");

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "form_submissions" (
  "id" serial PRIMARY KEY,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "project_id" integer REFERENCES "projects"("id"),
  "template_id" integer NOT NULL REFERENCES "form_templates"("id"),
  "template_version_id" integer NOT NULL REFERENCES "form_template_versions"("id"),
  "workflow_run_id" integer REFERENCES "workflow_runs"("id"),
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'submitted', 'approved', 'rejected', 'revision_requested')),
  "answers" jsonb NOT NULL CHECK (jsonb_typeof("answers") = 'object'),
  "submitted_by" integer NOT NULL REFERENCES "users"("id"),
  "submitted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  CONSTRAINT "form_submissions_workflow_run_id_unique" UNIQUE ("workflow_run_id")
);

CREATE INDEX IF NOT EXISTS "form_submissions_organization_id_idx" ON "form_submissions" ("organization_id");
CREATE INDEX IF NOT EXISTS "form_submissions_project_id_idx" ON "form_submissions" ("project_id");
CREATE INDEX IF NOT EXISTS "form_submissions_template_id_idx" ON "form_submissions" ("template_id");

--> statement-breakpoint

-- RLS is fail-closed through the existing set_organization_context helper.
ALTER TABLE "form_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "form_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_template_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "form_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_submissions" FORCE ROW LEVEL SECURITY;

SELECT create_tenant_rls_policy('form_templates', 'organization_id');
SELECT create_tenant_rls_policy('form_template_versions', 'organization_id');
SELECT create_tenant_rls_policy('form_submissions', 'organization_id');

--> statement-breakpoint

INSERT INTO "permissions" ("key", "description") VALUES
  ('forms.read', 'View form templates and submissions'),
  ('forms.manage', 'Create, edit, publish and archive form templates'),
  ('forms.submit', 'Create and submit form responses'),
  ('forms.review', 'Review form responses')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.key IN ('forms.read', 'forms.manage', 'forms.submit', 'forms.review')
WHERE r.name IN ('CEO', 'ProjectDirector')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.key IN ('forms.read', 'forms.submit')
WHERE r.name IN ('ProjectManager', 'PlanningEngineer', 'SiteEngineer', 'Supervisor')
ON CONFLICT DO NOTHING;

--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "form_templates" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "form_template_versions" TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "form_submissions" TO vetra_app;

GRANT SELECT ON TABLE "form_templates" TO vetra_readonly;
GRANT SELECT ON TABLE "form_template_versions" TO vetra_readonly;
GRANT SELECT ON TABLE "form_submissions" TO vetra_readonly;

-- Roles are created before migrations; explicitly grant newly-created sequences.
GRANT USAGE, SELECT ON SEQUENCE "form_templates_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "form_template_versions_id_seq" TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "form_submissions_id_seq" TO vetra_app;
GRANT SELECT ON SEQUENCE "form_templates_id_seq", "form_template_versions_id_seq", "form_submissions_id_seq" TO vetra_readonly;
