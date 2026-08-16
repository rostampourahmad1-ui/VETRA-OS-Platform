CREATE TABLE IF NOT EXISTS "inspections" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "type" text NOT NULL DEFAULT 'routine',
  "status" text NOT NULL DEFAULT 'planned',
  "inspector" text NOT NULL,
  "date" date NOT NULL,
  "findings" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "non_conformance_reports" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "title" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'medium',
  "status" text NOT NULL DEFAULT 'open',
  "description" text NOT NULL,
  "corrective_action" text,
  "assigned_to" text,
  "due_date" date,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inspections_organization_id_idx" ON "inspections" ("organization_id");
CREATE INDEX IF NOT EXISTS "inspections_project_id_idx" ON "inspections" ("project_id");
CREATE INDEX IF NOT EXISTS "non_conformance_reports_organization_id_idx" ON "non_conformance_reports" ("organization_id");
CREATE INDEX IF NOT EXISTS "non_conformance_reports_project_id_idx" ON "non_conformance_reports" ("project_id");

INSERT INTO permissions (key, description) VALUES
  ('quality.read', 'View quality inspections and NCRs'),
  ('quality.create', 'Create quality inspections and NCRs'),
  ('quality.update', 'Update quality inspections and NCRs'),
  ('quality.delete', 'Delete quality inspections and NCRs')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('CEO', 'ProjectDirector', 'ProjectManager', 'PlanningEngineer', 'SiteEngineer', 'Supervisor')
  AND p.key LIKE 'quality.%'
ON CONFLICT DO NOTHING;
