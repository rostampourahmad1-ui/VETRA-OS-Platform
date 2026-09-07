-- ============================================================================
-- VETRA-SEC-07: RBAC & Project Membership Hardening
-- ============================================================================
-- 1. Seeds all missing permissions used by existing route middleware
-- 2. Creates project_members table for project-level access control
-- 3. Adds role-permission mappings for all known roles and permissions
-- ============================================================================

-- Seed missing permissions
INSERT INTO permissions (key, description) VALUES
  ('users.read','View users'),
  ('users.create','Create users'),
  ('users.update','Update users'),
  ('users.manage_roles','Manage user role assignments'),
  ('documents.update','Update document metadata'),
  ('documents.download','Download documents'),
  ('contracts.read','View contracts'),
  ('contracts.create','Create contracts'),
  ('contracts.update','Update contracts'),
  ('contracts.delete','Delete contracts'),
  ('dashboard.read','View dashboard'),
  ('daily-reports.read','View daily reports'),
  ('daily-reports.create','Create daily reports'),
  ('daily-reports.update','Update daily reports'),
  ('daily-reports.delete','Delete daily reports'),
  ('meetings.read','View meetings'),
  ('meetings.create','Create meetings'),
  ('meetings.update','Update meetings'),
  ('meetings.delete','Delete meetings'),
  ('equipment.read','View equipment'),
  ('equipment.create','Create equipment'),
  ('equipment.update','Update equipment'),
  ('inventory.read','View inventory'),
  ('inventory.create','Create inventory'),
  ('inventory.update','Update inventory'),
  ('inventory.delete','Delete inventory'),
  ('procurement.read','View procurement'),
  ('procurement.create','Create procurement'),
  ('procurement.update','Update procurement'),
  ('hr.read','View HR records'),
  ('hr.create','Create HR records'),
  ('hr.update','Update HR records'),
  ('hr.delete','Delete HR records'),
  ('crm.read','View CRM clients'),
  ('crm.create','Create CRM clients'),
  ('crm.update','Update CRM clients'),
  ('crm.delete','Delete CRM clients'),
  ('search.read','Use global search'),
  ('phase2.read','View phase2 workspace'),
  ('phase2.update','Update phase2 settings'),
  ('forms.read','View forms'),
  ('forms.manage','Manage form templates'),
  ('forms.submit','Submit forms'),
  ('notifications.read','View notifications'),
  ('notifications.update','Update notification state'),
  ('organizations.manage','Manage organization settings')
ON CONFLICT (key) DO NOTHING;

-- Ensure roles exist for every organization
INSERT INTO roles (name, organization_id)
SELECT r.name, o.id
FROM organizations o
CROSS JOIN (
  VALUES ('CEO'),('ProjectDirector'),('ProjectManager'),('PlanningEngineer'),
         ('SiteEngineer'),('Supervisor'),('HR'),('Accountant'),
         ('WarehouseManager'),('ProcurementOfficer'),('Worker')
) r(name)
WHERE NOT EXISTS (
  SELECT 1 FROM roles x
  WHERE x.name = r.name AND x.organization_id = o.id
);

-- CEO & ProjectDirector get ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name IN ('CEO','ProjectDirector')
ON CONFLICT DO NOTHING;

-- ProjectManager, PlanningEngineer, SiteEngineer, Supervisor
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'projects.read','projects.create','projects.update',
  'tasks.read','tasks.create','tasks.update','tasks.delete',
  'planning.read','planning.manage',
  'documents.read','documents.create','documents.update','documents.download',
  'contracts.read','contracts.create','contracts.update',
  'daily-reports.read','daily-reports.create','daily-reports.update',
  'meetings.read','meetings.create','meetings.update',
  'equipment.read','equipment.create','equipment.update',
  'inventory.read','inventory.create','inventory.update',
  'procurement.read','procurement.create','procurement.update',
  'cost-control.read',
  'quality.read','quality.create','quality.update',
  'workflows.read','workflows.execute',
  'forms.read','forms.submit',
  'search.read','phase2.read',
  'dashboard.read',
  'notifications.read','notifications.update',
  'users.read',
  'crm.read','crm.create','crm.update',
  'ai.use'
)
WHERE r.name IN ('ProjectManager','PlanningEngineer','SiteEngineer','Supervisor')
ON CONFLICT DO NOTHING;

-- Accountant
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'cost-control.read','cost-control.manage',
  'contracts.read',
  'procurement.read',
  'workflows.read','workflows.approve',
  'dashboard.read',
  'search.read','phase2.read',
  'notifications.read',
  'users.read',
  'ai.use'
)
WHERE r.name = 'Accountant'
ON CONFLICT DO NOTHING;

-- HR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'hr.read','hr.create','hr.update',
  'users.read',
  'documents.read','documents.create','documents.download',
  'tasks.read','tasks.update',
  'dashboard.read',
  'search.read','phase2.read',
  'notifications.read',
  'ai.use'
)
WHERE r.name = 'HR'
ON CONFLICT DO NOTHING;

-- WarehouseManager & ProcurementOfficer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'inventory.read','inventory.create','inventory.update','inventory.delete',
  'procurement.read','procurement.create','procurement.update',
  'equipment.read','equipment.create','equipment.update',
  'documents.read','documents.create','documents.download',
  'tasks.read','tasks.update',
  'dashboard.read',
  'search.read','phase2.read',
  'notifications.read',
  'users.read',
  'ai.use'
)
WHERE r.name IN ('WarehouseManager','ProcurementOfficer')
ON CONFLICT DO NOTHING;

-- Worker
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.key IN (
  'tasks.read','tasks.update',
  'documents.read','documents.download',
  'daily-reports.read','daily-reports.create',
  'notifications.read','notifications.update',
  'ai.use'
)
WHERE r.name = 'Worker'
ON CONFLICT DO NOTHING;

-- Sync user_roles for any users that still need it
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u
JOIN roles r ON r.organization_id = u.organization_id AND r.name = u.role
WHERE NOT EXISTS (
  SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
);

-- project_members table
CREATE TABLE IF NOT EXISTS "project_members" (
  "id" serial PRIMARY KEY,
  "project_id" integer NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "organization_id" integer NOT NULL REFERENCES "organizations"("id"),
  "role" text NOT NULL DEFAULT 'member',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "project_members_user_project_unique" UNIQUE ("project_id", "user_id")
);

-- RLS for project_members
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

DO 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_members'
      AND policyname = 'project_members_tenant_isolation'
  ) THEN
    CREATE POLICY project_members_tenant_isolation ON project_members
      FOR ALL
      USING ("organization_id" = (SELECT current_setting('vetra.organization_id')::integer));
    ALTER TABLE project_members FORCE ROW LEVEL SECURITY;
  END IF;
END ;

-- Grant vetra_app
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE project_members TO vetra_app;

-- Grant sequence
DO 
BEGIN
  GRANT USAGE, SELECT ON SEQUENCE project_members_id_seq TO vetra_app;
EXCEPTION WHEN undefined_table THEN NULL;
END ;