-- VETRA: remove the financial and accounting modules and their persisted data.
-- This migration is intentionally destructive per the approved removal request.

DROP TABLE IF EXISTS "payment_schedules" CASCADE;
DROP TABLE IF EXISTS "invoice_lines" CASCADE;
DROP TABLE IF EXISTS "invoices" CASCADE;
DROP TABLE IF EXISTS "expenses" CASCADE;
DROP TABLE IF EXISTS "budgets" CASCADE;
DROP TABLE IF EXISTS "expense_categories" CASCADE;
DROP TABLE IF EXISTS "payment_certificates" CASCADE;

ALTER TABLE "projects" DROP COLUMN IF EXISTS "budget";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "spent";

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT id FROM "permissions"
  WHERE key LIKE 'cost-control.%'
     OR key LIKE 'invoices.%'
     OR key LIKE 'payment-schedule.%'
);

DELETE FROM "permissions"
WHERE key LIKE 'cost-control.%'
   OR key LIKE 'invoices.%'
   OR key LIKE 'payment-schedule.%';
