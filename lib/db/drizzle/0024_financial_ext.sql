-- ============================================================================
-- VETRA-PH1-02: Financial Extensions (Invoices, Invoice Lines, Payment Schedules)
-- ============================================================================
-- 1. Adds approved_by/approved_at to expenses
-- 2. Creates invoices, invoice_lines, payment_schedules tables
-- 3. Enables RLS + grants + permissions for tenant isolation
-- ============================================================================

-- ─── 1. Alter existing expenses table ───────────────────────────────────────
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "approved_by" integer,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;

ALTER TABLE "expenses"
  ADD CONSTRAINT expenses_approved_by_fk
  FOREIGN KEY ("approved_by") REFERENCES "users"("id");

-- ─── 2. Create invoices table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invoices" (
  "id"              SERIAL PRIMARY KEY,
  "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
  "project_id"      INTEGER REFERENCES "projects"("id"),
  "invoice_number"  TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "client_name"     TEXT,
  "issue_date"      DATE NOT NULL,
  "due_date"        DATE,
  "subtotal"        NUMERIC(15,2) NOT NULL DEFAULT '0',
  "tax"             NUMERIC(15,2) NOT NULL DEFAULT '0',
  "total"           NUMERIC(15,2) NOT NULL DEFAULT '0',
  "status"          TEXT NOT NULL DEFAULT 'draft',
  "notes"           TEXT,
  "created_by"      INTEGER REFERENCES "users"("id"),
  "approved_by"     INTEGER REFERENCES "users"("id"),
  "approved_at"     TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at"      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invoices_org_idx      ON "invoices" ("organization_id");
CREATE INDEX IF NOT EXISTS invoices_project_idx  ON "invoices" ("project_id");

-- ─── 3. Create invoice_lines table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invoice_lines" (
  "id"              SERIAL PRIMARY KEY,
  "invoice_id"      INTEGER NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
  "description"     TEXT NOT NULL,
  "quantity"        NUMERIC(12,3) NOT NULL DEFAULT '0',
  "unit_price"      NUMERIC(15,2) NOT NULL DEFAULT '0',
  "line_total"      NUMERIC(15,2) NOT NULL DEFAULT '0',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON "invoice_lines" ("invoice_id");
CREATE INDEX IF NOT EXISTS invoice_lines_org_idx     ON "invoice_lines" ("organization_id");

-- ─── 4. Create payment_schedules table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payment_schedules" (
  "id"                 SERIAL PRIMARY KEY,
  "organization_id"    INTEGER NOT NULL REFERENCES "organizations"("id"),
  "project_id"         INTEGER REFERENCES "projects"("id"),
  "invoice_id"         INTEGER REFERENCES "invoices"("id"),
  "title"              TEXT NOT NULL,
  "installment_number" INTEGER NOT NULL DEFAULT 1,
  "amount"             NUMERIC(15,2) NOT NULL,
  "due_date"           DATE NOT NULL,
  "paid_date"          DATE,
  "status"             TEXT NOT NULL DEFAULT 'scheduled',
  "retention_release"  BOOLEAN NOT NULL DEFAULT FALSE,
  "notes"              TEXT,
  "created_by"         INTEGER REFERENCES "users"("id"),
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_schedules_org_idx     ON "payment_schedules" ("organization_id");
CREATE INDEX IF NOT EXISTS payment_schedules_project_idx ON "payment_schedules" ("project_id");
CREATE INDEX IF NOT EXISTS payment_schedules_invoice_idx ON "payment_schedules" ("invoice_id");

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoices"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoices"          FORCE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines"     FORCE ROW LEVEL SECURITY;
ALTER TABLE "payment_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_schedules" FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_tenant_isolation
  ON "invoices" FOR ALL
  USING ("organization_id" = current_setting('vetra.organization_id', TRUE)::INTEGER);

CREATE POLICY invoice_lines_tenant_isolation
  ON "invoice_lines" FOR ALL
  USING ("organization_id" = current_setting('vetra.organization_id', TRUE)::INTEGER);

CREATE POLICY payment_schedules_tenant_isolation
  ON "payment_schedules" FOR ALL
  USING ("organization_id" = current_setting('vetra.organization_id', TRUE)::INTEGER);

-- ─── 6. Permissions ─────────────────────────────────────────────────────────
INSERT INTO "permissions" ("key", "description") VALUES
  ('invoices.read', 'Read invoices'),
  ('invoices.create', 'Create invoices'),
  ('invoices.update', 'Update invoices'),
  ('invoices.approve', 'Approve invoices'),
  ('payment-schedule.read', 'Read payment schedules'),
  ('payment-schedule.create', 'Create payment schedules'),
  ('payment-schedule.update', 'Update payment schedules')
ON CONFLICT ("key") DO NOTHING;

-- ADMIN gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.key IN ('invoices.read', 'invoices.create', 'invoices.update', 'invoices.approve',
                'payment-schedule.read', 'payment-schedule.create', 'payment-schedule.update')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- MANAGER gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.key IN ('invoices.read', 'invoices.create', 'invoices.update', 'invoices.approve',
                'payment-schedule.read', 'payment-schedule.create', 'payment-schedule.update')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Accountant gets all
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Accountant'
  AND p.key IN ('invoices.read', 'invoices.create', 'invoices.update', 'invoices.approve',
                'payment-schedule.read', 'payment-schedule.create', 'payment-schedule.update')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ProjectManager gets read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ProjectManager'
  AND p.key IN ('invoices.read', 'payment-schedule.read')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─── 7. Grants ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invoices"          TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invoice_lines"     TO vetra_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_schedules" TO vetra_app;

GRANT SELECT ON TABLE "invoices"          TO vetra_readonly;
GRANT SELECT ON TABLE "invoice_lines"     TO vetra_readonly;
GRANT SELECT ON TABLE "payment_schedules" TO vetra_readonly;

GRANT USAGE, SELECT ON SEQUENCE "invoices_id_seq"          TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "invoice_lines_id_seq"     TO vetra_app;
GRANT USAGE, SELECT ON SEQUENCE "payment_schedules_id_seq" TO vetra_app;