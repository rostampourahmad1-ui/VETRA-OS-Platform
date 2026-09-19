-- ============================================================================
-- 0026: Project membership uniqueness alignment
-- ============================================================================
-- Migration 0017 declares `project_members_user_project_unique` inline in the
-- `CREATE TABLE IF NOT EXISTS` statement. Databases provisioned before 0017, or
-- via `drizzle-kit push`, never received that constraint. This migration adds
-- the missing constraint idempotently, but only after proving there are no
-- duplicate (project_id, user_id) rows: it never deletes data.
--
-- Rollback:
--   ALTER TABLE project_members DROP CONSTRAINT IF EXISTS project_members_user_project_unique;
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM project_members
    GROUP BY project_id, user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'project_members has duplicate (project_id, user_id) rows; resolve duplicates before adding the unique constraint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_members_user_project_unique'
      AND conrelid = 'public.project_members'::regclass
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'project_members_user_project_unique'
      AND relkind = 'i'
  ) THEN
    ALTER TABLE project_members
      ADD CONSTRAINT project_members_user_project_unique
      UNIQUE (project_id, user_id);
  END IF;
END $$;
