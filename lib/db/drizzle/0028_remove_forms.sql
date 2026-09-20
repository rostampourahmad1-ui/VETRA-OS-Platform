-- VETRA: remove the in-product forms builder, submissions, and analytics.
-- External form-builder integration can be added later through an API boundary.

ALTER TABLE "inspections" DROP COLUMN IF EXISTS "template_id";
DROP TABLE IF EXISTS "form_submissions" CASCADE;
DROP TABLE IF EXISTS "form_template_versions" CASCADE;
DROP TABLE IF EXISTS "form_templates" CASCADE;

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT id FROM "permissions"
  WHERE key LIKE 'forms.%'
);

DELETE FROM "permissions"
WHERE key LIKE 'forms.%';
