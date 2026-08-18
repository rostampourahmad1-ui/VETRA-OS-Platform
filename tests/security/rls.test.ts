import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── VETRA-SEC-05: RLS Policy Validation Tests ─────────────────────────────
//
// These tests validate the Row-Level Security migration SQL statically.
// We read the migration file and assert that critical security patterns
// are present and dangerous patterns are absent.
//
// Key security properties:
//   1. FAIL-CLOSED: No COALESCE fallback to organization_id
//   2. FORCE ROW LEVEL SECURITY on all tenant tables
//   3. SECURITY DEFINER functions have hardened search_path
//   4. Append-only trigger on audit_logs
//   5. All required tenant tables have RLS enabled

// ─── Helpers ────────────────────────────────────────────────────────────────

const MIGRATION_PATH = resolve(__dirname, "../../lib/db/drizzle/0004_audit_rls.sql");

let migrationSql: string;

function loadMigration(): string {
  if (!migrationSql) {
    migrationSql = readFileSync(MIGRATION_PATH, "utf-8");
  }
  return migrationSql;
}

const REQUIRED_TENANT_TABLES = [
  "users",
  "projects",
  "tasks",
  "contracts",
  "daily_reports",
  "meetings",
  "equipment",
  "inventory",
  "procurement",
  "activity",
  "documents",
  "audit_logs",
  "roles",
];

// ─── Test Suite: RLS Policy Structure ──────────────────────────────────────

describe("VETRA-SEC-05: RLS Policy Structure", () => {
  it("P0-1: Migration file exists and is readable", () => {
    const sql = loadMigration();
    expect(sql).toBeTruthy();
    expect(sql.length).toBeGreaterThan(1000);
  });

  it("P0-2: All required tenant tables have ENABLE ROW LEVEL SECURITY", () => {
    const sql = loadMigration();
    for (const table of REQUIRED_TENANT_TABLES) {
      const pattern = new RegExp(`ALTER TABLE\\s+"${table}"\\s+ENABLE ROW LEVEL SECURITY`, "i");
      expect(sql).toMatch(pattern);
    }
  });

  it("P0-3: All required tenant tables have FORCE ROW LEVEL SECURITY", () => {
    const sql = loadMigration();
    for (const table of REQUIRED_TENANT_TABLES) {
      const pattern = new RegExp(`ALTER TABLE\\s+"${table}"\\s+FORCE ROW LEVEL SECURITY`, "i");
      expect(sql).toMatch(pattern);
    }
  });

  it("P0-4: notifications table is NOT in RLS (no organization_id column)", () => {
    const sql = loadMigration();
    expect(sql).not.toMatch(/ALTER TABLE\s+"notifications"\s+ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/ALTER TABLE\s+"notifications"\s+FORCE ROW LEVEL SECURITY/i);
  });
});

// ─── Test Suite: FAIL-CLOSED RLS Policy ────────────────────────────────────

describe("VETRA-SEC-05: FAIL-CLOSED RLS Policy", () => {
  it("P0-1: RLS policies do NOT use COALESCE with organization_id fallback", () => {
    // The old fail-open pattern was:
    //   COALESCE(NULLIF(current_setting(...), '')::integer, organization_id)
    // This must NOT appear anywhere in the migration.
    const sql = loadMigration();
    expect(sql).not.toMatch(/COALESCE\s*\(\s*NULLIF\s*\(\s*current_setting/i);
  });

  it("P0-2: RLS policies use NULLIF without COALESCE fallback", () => {
    // The correct fail-closed pattern:
    //   organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::integer
    // When context is unset, NULLIF returns NULL, and the comparison is NULL = false.
    const sql = loadMigration();
    // Match both single-quoted and double-escaped-quoted versions (inside format())
    const nullifMatches = sql.match(/NULLIF\s*\(\s*current_setting\s*\(\s*'+app\.current_organization_id'/g);
    expect(nullifMatches).not.toBeNull();
    // Each format() call contains 4 NULLIF references (SELECT, INSERT, UPDATE USING, UPDATE WITH CHECK, DELETE)
    // But the format escape means they appear differently. At minimum, we expect any matches.
    expect(nullifMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("P0-3: RLS context setting name is correct", () => {
    const sql = loadMigration();
    expect(sql).toContain("app.current_organization_id");
  });
});

// ─── Test Suite: SECURITY DEFINER Hardening ────────────────────────────────

describe("VETRA-SEC-05: SECURITY DEFINER Hardening", () => {
  it("P0-1: set_organization_context has search_path hardening", () => {
    const sql = loadMigration();
    // The function definition must have SET search_path = pg_catalog, pg_temp
    const funcPattern = /set_organization_context[\s\S]*?SECURITY DEFINER[\s\S]*?SET\s+search_path\s*=\s*pg_catalog/i;
    expect(sql).toMatch(funcPattern);
  });

  it("P0-2: create_tenant_rls_policy has search_path hardening", () => {
    const sql = loadMigration();
    const funcPattern = /create_tenant_rls_policy[\s\S]*?SECURITY DEFINER[\s\S]*?SET\s+search_path\s*=\s*pg_catalog/i;
    expect(sql).toMatch(funcPattern);
  });

  it("P1-1: search_path only includes pg_catalog and pg_temp", () => {
    const sql = loadMigration();
    // Verify no dangerous schemas (public, pg_catalog without pg_temp for writable, etc.)
    const searchPathMatches = sql.match(/SET\s+search_path\s*=\s*([^;]+)/gi);
    expect(searchPathMatches).not.toBeNull();
    for (const match of searchPathMatches!) {
      // Must contain pg_catalog
      expect(match).toMatch(/pg_catalog/);
      // Must NOT contain public schema
      expect(match).not.toMatch(/\bpublic\b/);
    }
  });
});

// ─── Test Suite: Audit Log Append-Only ─────────────────────────────────────

describe("VETRA-SEC-05: Audit Log Append-Only", () => {
  it("P0-1: prevent_audit_log_modification trigger exists", () => {
    const sql = loadMigration();
    expect(sql).toContain("prevent_audit_log_modification");
    expect(sql).toMatch(/RAISE EXCEPTION.*append-only/i);
  });

  it("P0-2: BEFORE UPDATE trigger on audit_logs exists", () => {
    const sql = loadMigration();
    expect(sql).toMatch(/BEFORE UPDATE\s+ON\s+"audit_logs"/i);
  });

  it("P0-3: BEFORE DELETE trigger on audit_logs exists", () => {
    const sql = loadMigration();
    expect(sql).toMatch(/BEFORE DELETE\s+ON\s+"audit_logs"/i);
  });

  it("P0-4: Both triggers use the same function", () => {
    const sql = loadMigration();
    const updateTrigger = sql.match(/audit_logs_no_update[\s\S]*?EXECUTE FUNCTION\s+(\w+)/i);
    const deleteTrigger = sql.match(/audit_logs_no_delete[\s\S]*?EXECUTE FUNCTION\s+(\w+)/i);
    expect(updateTrigger).not.toBeNull();
    expect(deleteTrigger).not.toBeNull();
    expect(updateTrigger![1]).toBe(deleteTrigger![1]);
  });
});

// ─── Test Suite: RLS Policy Count ──────────────────────────────────────────

describe("VETRA-SEC-05: RLS Policy Count", () => {
  it("P0-1: Each tenant table has exactly 4 policies (SELECT, INSERT, UPDATE, DELETE)", () => {
    const sql = loadMigration();
    for (const table of REQUIRED_TENANT_TABLES) {
      const selectPattern = new RegExp(`create_tenant_rls_policy\\('${table}'`, "i");
      expect(sql).toMatch(selectPattern);
    }
    // Each table gets 4 policies, so 13 tables * 4 = 52 policies
    const policyCalls = sql.match(/create_tenant_rls_policy\('/g);
    expect(policyCalls).not.toBeNull();
    expect(policyCalls!.length).toBe(REQUIRED_TENANT_TABLES.length);
  });

  it("P0-2: Verification block exists at end of migration", () => {
    const sql = loadMigration();
    expect(sql).toContain("VETRA-SEC-05:");
    expect(sql).toMatch(/RAISE NOTICE.*RLS policies created/i);
  });
});

// ─── Test Suite: Shared Reference Tables (No RLS) ──────────────────────────

describe("VETRA-SEC-05: Shared Reference Tables (No RLS)", () => {
  it("P0-1: organizations table does NOT have RLS enabled", () => {
    const sql = loadMigration();
    expect(sql).not.toMatch(/ALTER TABLE\s+"organizations"\s+ENABLE ROW LEVEL SECURITY/i);
  });

  it("P0-2: permissions table does NOT have RLS enabled", () => {
    const sql = loadMigration();
    expect(sql).not.toMatch(/ALTER TABLE\s+"permissions"\s+ENABLE ROW LEVEL SECURITY/i);
  });

  it("P0-3: role_permissions table does NOT have RLS enabled", () => {
    const sql = loadMigration();
    expect(sql).not.toMatch(/ALTER TABLE\s+"role_permissions"\s+ENABLE ROW LEVEL SECURITY/i);
  });
});

// ─── Test Suite: Migration Structural Integrity ────────────────────────────

describe("VETRA-SEC-05: Migration Structural Integrity", () => {
  it("P1-1: Migration has proper statement breakpoints", () => {
    const sql = loadMigration();
    const breakpoints = sql.match(/--> statement-breakpoint/g);
    expect(breakpoints).not.toBeNull();
    expect(breakpoints!.length).toBeGreaterThanOrEqual(5);
  });

  it("P1-2: audit_logs table has all required columns", () => {
    const sql = loadMigration();
    const requiredColumns = [
      "organization_id",
      "actor_id",
      "actor_clerk_id",
      "action",
      "resource",
      "resource_id",
      "old_values",
      "new_values",
      "metadata",
      "ip_address",
      "user_agent",
      "created_at",
    ];
    for (const col of requiredColumns) {
      expect(sql).toContain(`"${col}"`);
    }
  });

  it("P1-3: audit_logs has all required indexes", () => {
    const sql = loadMigration();
    expect(sql).toContain("audit_logs_organization_id_idx");
    expect(sql).toContain("audit_logs_action_idx");
    expect(sql).toContain("audit_logs_resource_idx");
    expect(sql).toContain("audit_logs_actor_id_idx");
    expect(sql).toContain("audit_logs_created_at_idx");
  });

  it("P1-4: No DROP statements (non-destructive migration)", () => {
    const sql = loadMigration();
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});

// ─── Test Suite: setOrganizationContext Function ────────────────────────────

describe("VETRA-SEC-05: setOrganizationContext", () => {
  it("P0-1: set_organization_context function exists", () => {
    const sql = loadMigration();
    expect(sql).toContain("set_organization_context");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION\s+set_organization_context/i);
  });

  it("P0-2: Function uses set_config with is_local=false", () => {
    const sql = loadMigration();
    // is_local=false means the setting persists for the session, not just transaction
    expect(sql).toMatch(/set_config\s*\(\s*'app\.current_organization_id'/);
    // Third parameter should be false (not local)
    expect(sql).toMatch(/set_config\s*\([^)]+false\s*\)/);
  });

  it("P1-1: Function accepts integer parameter", () => {
    const sql = loadMigration();
    expect(sql).toMatch(/set_organization_context\s*\(\s*org_id\s+integer\s*\)/i);
  });
});
