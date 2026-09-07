-- ============================================================================
-- VETRA-DR-03: Daily Report Workforce Integration
-- ============================================================================
-- 1. Creates the daily_report_workforce table linking employees to daily reports
-- 2. Adds indexes for fast lookup by daily report, employee, and organization
-- 3. Seeds daily report workforce permissions
-- 4. Enables RLS for tenant isolation
-- ============================================================================

-- Create the daily_report_workforce table
CREATE TABLE IF NOT EXISTS daily_report_workforce (
  id SERIAL PRIMARY KEY,
  daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  employee_id INTEGER REFERENCES employees(id),
  group_name TEXT,
  role TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1 CHECK (count > 0),
  attendance_status TEXT NOT NULL DEFAULT ''present'' CHECK (attendance_status IN (''present'', ''absent'', ''late'', ''on_leave'', ''half_day'')),
  hours_worked NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (hours_worked >= 0 AND hours_worked <= 24),
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing workforce by daily report
CREATE INDEX IF NOT EXISTS daily_report_workforce_daily_report_id_idx
  ON daily_report_workforce (daily_report_id);

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_workforce_organization_id_idx
  ON daily_report_workforce (organization_id);

-- Index for project-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_workforce_project_id_idx
  ON daily_report_workforce (project_id);

-- Index for employee-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_workforce_employee_id_idx
  ON daily_report_workforce (employee_id);

-- Enable RLS on the new table
ALTER TABLE daily_report_workforce ENABLE ROW LEVEL SECURITY;

-- RLS policy: only allow access to workforce entries belonging to the user''s organization
CREATE POLICY daily_report_workforce_tenant_isolation
  ON daily_report_workforce
  FOR ALL
  USING (organization_id = current_setting(''vetra.organization_id'', TRUE)::INTEGER);

-- Seed daily report workforce permissions
INSERT INTO permissions (key, description) VALUES
  (''daily-reports.workforce.read'', ''Read daily report workforce entries''),
  (''daily-reports.workforce.create'', ''Create daily report workforce entries''),
  (''daily-reports.workforce.update'', ''Update daily report workforce entries''),
  (''daily-reports.workforce.delete'', ''Delete daily report workforce entries'')
ON CONFLICT (key) DO NOTHING;

-- Map workforce permissions to existing roles
-- ADMIN gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''ADMIN''
  AND p.key IN (''daily-reports.workforce.read'', ''daily-reports.workforce.create'', ''daily-reports.workforce.update'', ''daily-reports.workforce.delete'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''MANAGER''
  AND p.key IN (''daily-reports.workforce.read'', ''daily-reports.workforce.create'', ''daily-reports.workforce.update'', ''daily-reports.workforce.delete'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- PROJECT_MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''PROJECT_MANAGER''
  AND p.key IN (''daily-reports.workforce.read'', ''daily-reports.workforce.create'', ''daily-reports.workforce.update'', ''daily-reports.workforce.delete'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- SUPERVISOR gets read, create, update
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''SUPERVISOR''
  AND p.key IN (''daily-reports.workforce.read'', ''daily-reports.workforce.create'', ''daily-reports.workforce.update'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ENGINEER gets read, create
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''ENGINEER''
  AND p.key IN (''daily-reports.workforce.read'', ''daily-reports.workforce.create'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- SITE_ENGINEER gets read, create, update
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''SITE_ENGINEER''
  AND p.key IN (''daily-reports.workforce.read'', ''daily-reports.workforce.create'', ''daily-reports.workforce.update'')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- EMPLOYEE gets read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = ''EMPLOYEE''
  AND p.key = ''daily-reports.workforce.read''
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
