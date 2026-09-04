-- Link quality inspections to organization/project-scoped form templates.
ALTER TABLE "inspections"
  ADD COLUMN IF NOT EXISTS "template_id" integer REFERENCES "form_templates"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "inspections_template_id_idx"
  ON "inspections" ("template_id")
  WHERE "template_id" IS NOT NULL;
