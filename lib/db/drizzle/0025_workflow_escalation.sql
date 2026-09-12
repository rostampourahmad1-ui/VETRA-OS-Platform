-- ============================================================================
-- VETRA-PH1-03: Workflow Escalation + Notification Email Tracking + Form Category
-- ============================================================================
-- 1. Adds escalation/delegation columns to workflow_steps
-- 2. Adds email tracking columns to notifications
-- 3. Adds category column to form_templates
-- ============================================================================

-- ─── 1. Alter workflow_steps ────────────────────────────────────────────────
ALTER TABLE "workflow_steps"
  ADD COLUMN IF NOT EXISTS "escalate_after_hours" integer,
  ADD COLUMN IF NOT EXISTS "escalate_to_permission" text,
  ADD COLUMN IF NOT EXISTS "allow_delegation" integer NOT NULL DEFAULT 0;

-- ─── 2. Alter notifications ─────────────────────────────────────────────────
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "email_sent_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "email_status" text;

-- ─── 3. Alter form_templates ────────────────────────────────────────────────
ALTER TABLE "form_templates"
  ADD COLUMN IF NOT EXISTS "category" text;

-- ─── 4. Permissions for delegation ──────────────────────────────────────────
INSERT INTO "permissions" ("key", "description") VALUES
  ('workflows.delegate', 'Delegate workflow approvals to another user')
ON CONFLICT ("key") DO NOTHING;

-- ADMIN gets delegate
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.key = 'workflows.delegate'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets delegate
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.key = 'workflows.delegate'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );