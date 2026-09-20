-- VETRA: remove the following modules and their persisted data, as approved:
--   documents, quality, contracts (+BOQ/QTO), daily reports (+attachments,
--   workforce, materials, equipment), meetings, HR (employees, attendance,
--   payroll), equipment, inventory, procurement, warehouse (suppliers,
--   materials, warehouse), CRM (clients), workspace (phase2), resources
--   (resource types/assignments).
--
-- This migration is intentionally destructive per the approved removal request.
-- Drop order follows foreign-key dependencies.

DROP TABLE IF EXISTS "daily_report_materials" CASCADE;
DROP TABLE IF EXISTS "daily_report_equipment" CASCADE;
DROP TABLE IF EXISTS "daily_report_workforce" CASCADE;
DROP TABLE IF EXISTS "daily_report_attachments" CASCADE;
DROP TABLE IF EXISTS "daily_reports" CASCADE;

DROP TABLE IF EXISTS "qto_items" CASCADE;
DROP TABLE IF EXISTS "boq_items" CASCADE;
DROP TABLE IF EXISTS "contracts" CASCADE;

DROP TABLE IF EXISTS "quality_events" CASCADE;
DROP TABLE IF EXISTS "non_conformance_reports" CASCADE;
DROP TABLE IF EXISTS "inspections" CASCADE;

DROP TABLE IF EXISTS "resource_assignments" CASCADE;
DROP TABLE IF EXISTS "resource_types" CASCADE;

DROP TABLE IF EXISTS "stock_movements" CASCADE;
DROP TABLE IF EXISTS "procurement_items" CASCADE;
DROP TABLE IF EXISTS "procurement" CASCADE;
DROP TABLE IF EXISTS "warehouse" CASCADE;
DROP TABLE IF EXISTS "materials" CASCADE;
DROP TABLE IF EXISTS "suppliers" CASCADE;
DROP TABLE IF EXISTS "inventory" CASCADE;

DROP TABLE IF EXISTS "payroll" CASCADE;
DROP TABLE IF EXISTS "attendance" CASCADE;
DROP TABLE IF EXISTS "employees" CASCADE;

DROP TABLE IF EXISTS "equipment" CASCADE;
DROP TABLE IF EXISTS "meetings" CASCADE;
DROP TABLE IF EXISTS "documents" CASCADE;
DROP TABLE IF EXISTS "clients" CASCADE;

-- Remove workflow definitions and runs that targeted the removed entities.
DELETE FROM "workflow_run_events"
WHERE "workflow_run_id" IN (
  SELECT id FROM "workflow_runs"
  WHERE "entity_type" IN ('daily_report', 'non_conformance_report', 'form_submission')
     OR "workflow_id" IN (
       SELECT id FROM "workflows"
       WHERE "entity_type" IN ('daily_report', 'non_conformance_report', 'form_submission')
     )
);

DELETE FROM "workflow_runs"
WHERE "entity_type" IN ('daily_report', 'non_conformance_report', 'form_submission')
   OR "workflow_id" IN (
     SELECT id FROM "workflows"
     WHERE "entity_type" IN ('daily_report', 'non_conformance_report', 'form_submission')
   );

DELETE FROM "workflow_steps"
WHERE "workflow_id" IN (
  SELECT id FROM "workflows"
  WHERE "entity_type" IN ('daily_report', 'non_conformance_report', 'form_submission')
);

DELETE FROM "workflows"
WHERE "entity_type" IN ('daily_report', 'non_conformance_report', 'form_submission');

-- Drop permissions owned by the removed modules (role mappings first).
DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT id FROM "permissions"
  WHERE key LIKE 'documents.%'
     OR key LIKE 'contracts.%'
     OR key LIKE 'daily-reports.%'
     OR key LIKE 'meetings.%'
     OR key LIKE 'equipment.%'
     OR key LIKE 'inventory.%'
     OR key LIKE 'procurement.%'
     OR key LIKE 'hr.%'
     OR key LIKE 'crm.%'
     OR key LIKE 'quality.%'
     OR key LIKE 'stock.%'
     OR key LIKE 'boq.%'
     OR key LIKE 'qto.%'
     OR key LIKE 'materials.%'
     OR key LIKE 'suppliers.%'
     OR key LIKE 'warehouse.%'
);

DELETE FROM "permissions"
WHERE key LIKE 'documents.%'
   OR key LIKE 'contracts.%'
   OR key LIKE 'daily-reports.%'
   OR key LIKE 'meetings.%'
   OR key LIKE 'equipment.%'
   OR key LIKE 'inventory.%'
   OR key LIKE 'procurement.%'
   OR key LIKE 'hr.%'
   OR key LIKE 'crm.%'
   OR key LIKE 'quality.%'
   OR key LIKE 'stock.%'
   OR key LIKE 'boq.%'
   OR key LIKE 'qto.%'
   OR key LIKE 'materials.%'
   OR key LIKE 'suppliers.%'
   OR key LIKE 'warehouse.%';

-- Remove notifications that referenced the removed modules.
DELETE FROM "notifications"
WHERE "type" IN ('document_uploaded', 'payroll_paid', 'low_stock');
