-- ============================================================================
-- VETRA-DR-04: Daily Report Materials Integration
-- ============================================================================
-- 1. Creates the daily_report_materials table linking materials to daily reports
-- 2. Adds indexes for fast lookup by daily report, material, and organization
-- 3. Seeds daily report materials permissions
-- 4. Enables RLS for tenant isolation
-- ============================================================================

-- Create the daily_report_materials table
CREATE TABLE IF NOT EXISTS daily_report_materials (
  id SERIAL PRIMARY KEY,
  daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  opening_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (opening_quantity >= 0),
  received NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (received >= 0),
  consumed NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (consumed >= 0),
  returned NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (returned >= 0),
  closing_quantity NUMERIC(12,3) NOT NULL DEFAULT 0 CHECK (closing_quantity >= 0),
  unit TEXT NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing materials by daily report
CREATE INDEX IF NOT EXISTS daily_report_materials_daily_report_id_idx
  ON daily_report_materials (daily_report_id);

-- Index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_materials_organization_id_idx
  ON daily_report_materials (organization_id);

-- Index for project-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_materials_project_id_idx
  ON daily_report_materials (project_id);

-- Index for material-scoped queries
CREATE INDEX IF NOT EXISTS daily_report_materials_material_id_idx
  ON daily_report_materials (material_id);

-- Enable RLS on the new table
ALTER TABLE daily_report_materials ENABLE ROW LEVEL SECURITY;

-- RLS policy: only allow access to material entries belonging to the user's organization
CREATE POLICY daily_report_materials_tenant_isolation
  ON daily_report_materials
  FOR ALL
  USING (organization_id = current_setting('vetra.organization_id', TRUE)::INTEGER);

-- Seed daily report materials permissions
INSERT INTO permissions (key, description) VALUES
  ('daily-reports.materials.read', 'Read daily report material entries'),
  ('daily-reports.materials.create', 'Create daily report material entries'),
  ('daily-reports.materials.update', 'Update daily report material entries'),
  ('daily-reports.materials.delete', 'Delete daily report material entries')
ON CONFLICT (key) DO NOTHING;

-- Map materials permissions to existing roles
-- ADMIN gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.key IN ('daily-reports.materials.read', 'daily-reports.materials.create', 'daily-reports.materials.update', 'daily-reports.materials.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.key IN ('daily-reports.materials.read', 'daily-reports.materials.create', 'daily-reports.materials.update', 'daily-reports.materials.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- PROJECT_MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'PROJECT_MANAGER'
  AND p.key IN ('daily-reports.materials.read', 'daily-reports.materials.create', 'daily-reports.materials.update', 'daily-reports.materials.delete')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
