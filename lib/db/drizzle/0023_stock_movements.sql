-- ============================================================================
-- VETRA-PH1-01: Stock Movements Ledger + Materials Warehouse/Barcode Columns
-- ============================================================================
-- 1. Adds barcode, sku, warehouse_id columns to existing materials table
-- 2. Creates stock_movements table for full in/out/adjust/transfer audit trail
-- 3. Enables RLS + grants for tenant isolation
-- ============================================================================

-- ─── 1. Alter existing materials table ──────────────────────────────────────
ALTER TABLE "materials"
  ADD COLUMN IF NOT EXISTS "sku" text,
  ADD COLUMN IF NOT EXISTS "barcode" text,
  ADD COLUMN IF NOT EXISTS "warehouse_id" integer;

ALTER TABLE "materials"
  ADD CONSTRAINT materials_warehouse_id_fk
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouse"("id");

-- ─── 2. Create stock_movements table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id"              SERIAL PRIMARY KEY,
  "organization_id" INTEGER NOT NULL REFERENCES "organizations"("id"),
  "material_id"     INTEGER NOT NULL REFERENCES "materials"("id"),
  "warehouse_id"    INTEGER NOT NULL REFERENCES "warehouse"("id"),
  "type"            TEXT NOT NULL CHECK ("type" IN ('in', 'out', 'adjust', 'transfer')),
  "quantity"        NUMERIC(12,3) NOT NULL,
  "ref_type"        TEXT,
  "ref_id"          INTEGER,
  "barcode"         TEXT,
  "notes"           TEXT,
  "created_by"      INTEGER NOT NULL,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS stock_movements_org_idx        ON "stock_movements" ("organization_id");
CREATE INDEX IF NOT EXISTS stock_movements_material_idx   ON "stock_movements" ("material_id");
CREATE INDEX IF NOT EXISTS stock_movements_warehouse_idx  ON "stock_movements" ("warehouse_id");
CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx ON "stock_movements" ("created_at");

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_tenant_isolation
  ON "stock_movements"
  FOR ALL
  USING ("organization_id" = current_setting('vetra.organization_id', TRUE)::INTEGER);

-- ─── 4. Permissions ─────────────────────────────────────────────────────────
INSERT INTO "permissions" ("key", "description") VALUES
  ('stock.read', 'Read stock movements'),
  ('stock.create', 'Create stock movements'),
  ('stock.receive', 'Receive stock into warehouse')
ON CONFLICT ("key") DO NOTHING;

-- Map to ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.key IN ('stock.read', 'stock.create', 'stock.receive')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Map to MANAGER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.key IN ('stock.read', 'stock.create', 'stock.receive')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Map to WarehouseManager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'WarehouseManager'
  AND p.key IN ('stock.read', 'stock.create', 'stock.receive')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- Map to ProjectManager (read + receive)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ProjectManager'
  AND p.key IN ('stock.read', 'stock.receive')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─── 5. Grants ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "stock_movements" TO vetra_app;
GRANT SELECT ON TABLE "stock_movements" TO vetra_readonly;
GRANT USAGE, SELECT ON SEQUENCE "stock_movements_id_seq" TO vetra_app;

-- One-time data migration: distinct inventory rows → materials (skip conflicts by org+lower(name))
INSERT INTO materials ("organization_id", "code", "name", "category", "unit", "unit_price", "min_stock", "current_stock", "description", "project_id", "created_at", "updated_at")
SELECT DISTINCT ON (i."organization_id", lower(i."name"))
  i."organization_id",
  'INV-' || i."id",
  i."name",
  i."category",
  i."unit",
  COALESCE(i."unit_cost", '0'),
  i."min_stock",
  i."quantity",
  i."supplier",
  i."project_id",
  i."created_at",
  NOW()
FROM inventory i
WHERE NOT EXISTS (
  SELECT 1 FROM materials m
  WHERE m."organization_id" = i."organization_id"
    AND lower(m."name") = lower(i."name")
)
ON CONFLICT DO NOTHING;
