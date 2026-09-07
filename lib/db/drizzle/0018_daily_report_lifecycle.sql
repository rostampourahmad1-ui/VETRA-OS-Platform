-- ============================================================================
-- VETRA-DR-01: Daily Report Lifecycle & Workflow Integration
-- ============================================================================
-- 1. Seeds daily report lifecycle permissions (submit, review, approve)
-- 2. Adds index on daily_reports.workflow_run_id for fast lookup
-- 3. Seeds a default Daily Report workflow template for each organization
-- ============================================================================

-- Seed daily report lifecycle permissions
INSERT INTO permissions (key, description) VALUES
  ('daily-reports.submit', 'Submit daily reports for review'),
  ('daily-reports.review', 'Review submitted daily reports'),
  ('daily-reports.approve', 'Approve or reject daily reports')
ON CONFLICT (key) DO NOTHING;

-- Map lifecycle permissions to existing roles
-- ADMIN gets all daily report permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.key IN ('daily-reports.submit', 'daily-reports.review', 'daily-reports.approve')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets submit, review, approve
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.key IN ('daily-reports.submit', 'daily-reports.review', 'daily-reports.approve')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- PROJECT_MANAGER gets submit, review, approve
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'PROJECT_MANAGER'
  AND p.key IN ('daily-reports.submit', 'daily-reports.review', 'daily-reports.approve')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- SUPERVISOR gets submit, review
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPERVISOR'
  AND p.key IN ('daily-reports.submit', 'daily-reports.review')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ENGINEER gets submit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ENGINEER'
  AND p.key IN ('daily-reports.submit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- SITE_ENGINEER gets submit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SITE_ENGINEER'
  AND p.key IN ('daily-reports.submit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- EMPLOYEE gets submit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'EMPLOYEE'
  AND p.key IN ('daily-reports.submit')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Add index on workflow_run_id for fast lookup
CREATE INDEX IF NOT EXISTS daily_reports_workflow_run_id_idx
  ON daily_reports (workflow_run_id);

-- Seed a default Daily Report workflow for each organization that has workflows enabled
-- Steps: 1. Review (daily-reports.review) → 2. Approve (daily-reports.approve)
INSERT INTO workflows (organization_id, name, entity_type, active, created_at, updated_at)
SELECT o.id, 'Daily Report Approval', 'daily_report', 1, NOW(), NOW()
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM workflows w
  WHERE w.organization_id = o.id AND w.entity_type = 'daily_report' AND w.deleted_at IS NULL
);

-- Add workflow steps for the default Daily Report workflow
INSERT INTO workflow_steps (workflow_id, step_order, name, required_permission, status, approval_type, required_approvals)
SELECT w.id, 1, 'Review', 'daily-reports.review', 'pending', 'single', 1
FROM workflows w
WHERE w.entity_type = 'daily_report'
  AND w.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM workflow_steps ws WHERE ws.workflow_id = w.id AND ws.step_order = 1
  );

INSERT INTO workflow_steps (workflow_id, step_order, name, required_permission, status, approval_type, required_approvals)
SELECT w.id, 2, 'Approve', 'daily-reports.approve', 'pending', 'single', 1
FROM workflows w
WHERE w.entity_type = 'daily_report'
  AND w.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM workflow_steps ws WHERE ws.workflow_id = w.id AND ws.step_order = 2
  );
