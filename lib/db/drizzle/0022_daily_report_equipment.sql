-- ============================================================================
-- VETRA-DR-05: Daily Report Equipment Integration
-- ============================================================================
-- 1. Creates the daily_report_equipment table linking equipment to daily reports
-- 2. Adds indexes for fast lookup by daily report, equipment, and organization
-- 3. Seeds daily report equipment permissions
-- 4. Enables RLS for tenant isolation
-- ============================================================================

-- Create the daily_report_equipment table
CREATE TABLE IF NOT EXISTS daily_report_equipment (
  id SERIAL PRIMARY KEY,
  daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  operator_id INTEGER REFERENCES employees(id),
  start_time TEXT NOT NULL CHECK (start_time ~ '^\d{1,2}:\d{2}(:\d{2})?$'),
  end_time TEXT NOT NULL CHECK (end_time ~ '^\d{1,2}:\d{2}(:\d{2})?$'),
  operating_hours NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (operating_hours >= 0 AND operating_hours <= 24),
  idle_hours NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (idle_hours >= 0 AND idle_hours <= 24),
  status TEXT NOT NULL DEFAULT 'operating' CHECK (status IN ('operating', 'idle', 'maintenance', 'standby', 'breakdown')),
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing equipment entries by daily report
CREATE INDEX IF NOT EXISTS daily_report_equipment_daily_report_id_idx
  ON daily_report_equipment (daily_report_id);

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_equipment_organization_id_idx
  ON daily_report_equipment (organization_id);

-- Index for project-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_equipment_project_id_idx
  ON daily_report_equipment (project_id);

-- Index for equipment-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_equipment_equipment_id_idx
  ON daily_report_equipment (equipment_id);

-- Enable RLS on the new table
ALTER TABLE daily_report_equipment ENABLE ROW LEVEL SECURITY;

-- RLS policy: only allow access to equipment entries belonging to the user's organization
CREATE POLICY daily_report_equipment_tenant_isolation
  ON daily_report_equipment
  FOR ALL
  USING (organization_id = current_setting('vetra.organization_id', TRUE)::INTEGER);

-- Seed daily report equipment permissions
INSERT INTO permissions (key, description) VALUES
  ('daily-reports.equipment.read', 'Read daily report equipment entries'),
  ('daily-reports.equipment.create', 'Create daily report equipment entries'),
  ('daily-reports.equipment.update', 'Update daily report equipment entries'),
  ('daily-reports.equipment.delete', 'Delete daily report equipment entries')
ON CONFLICT (key) DO NOTHING;

-- Map equipment permissions to existing roles
-- ADMIN gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.key IN ('daily-reports.equipment.read', 'daily-reports.equipment.create', 'daily-reports.equipment.update', 'daily-reports.equipment.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.key IN ('daily-reports.equipment.read', 'daily-reports.equipment.create', 'daily-reports.equipment.update', 'daily-reports.equipment.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- PROJECT_MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'PROJECT_MANAGER'
  AND p.key IN ('daily-reports.equipment.read', 'daily-reports.equipment.create', 'daily-reports.equipment.update', 'daily-reports.equipment.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
