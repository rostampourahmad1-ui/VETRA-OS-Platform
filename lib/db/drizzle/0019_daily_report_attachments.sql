-- ============================================================================
-- VETRA-DR-02: Daily Report Attachments / Photos
-- ============================================================================
-- 1. Creates the daily_report_attachments table with tenant-scoped references
-- 2. Adds indexes for fast lookup by daily report and organization
-- 3. Seeds daily report attachment permissions (upload, download)
-- ============================================================================

-- Create the daily_report_attachments table
CREATE TABLE IF NOT EXISTS daily_report_attachments (
  id SERIAL PRIMARY KEY,
  daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing attachments by daily report
CREATE INDEX IF NOT EXISTS daily_report_attachments_daily_report_id_idx
  ON daily_report_attachments (daily_report_id);

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_attachments_organization_id_idx
  ON daily_report_attachments (organization_id);

-- Index for project-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_attachments_project_id_idx
  ON daily_report_attachments (project_id);

-- Enable RLS on the new table
ALTER TABLE daily_report_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policy: only allow access to attachments belonging to the user's organization
-- This uses the same set_request_organization_context pattern as other tables
CREATE POLICY daily_report_attachments_tenant_isolation
  ON daily_report_attachments
  FOR ALL
  USING (organization_id = current_setting(''vetra.organization_id'', TRUE)::INTEGER);

-- Seed daily report attachment permissions
INSERT INTO permissions (key, description) VALUES
  (''daily-reports.attachments.upload'', ''Upload attachments to daily reports''),
  (''daily-reports.attachments.download'', ''Download attachments from daily reports''),
  (''daily-reports.attachments.delete'', ''Delete attachments from daily reports'')
ON CONFLICT (key) DO NOTHING;

-- Map attachment permissions to existing roles
-- ADMIN gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''ADMIN''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'', ''daily-reports.attachments.delete'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''MANAGER''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'', ''daily-reports.attachments.delete'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- PROJECT_MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''PROJECT_MANAGER''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'', ''daily-reports.attachments.delete'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- SUPERVISOR gets upload and download
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''SUPERVISOR''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ENGINEER gets upload and download
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''ENGINEER''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- SITE_ENGINEER gets upload and download
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''SITE_ENGINEER''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- EMPLOYEE gets upload and download
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''EMPLOYEE''
  AND p.key IN (''daily-reports.attachments.upload'', ''daily-reports.attachments.download'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
