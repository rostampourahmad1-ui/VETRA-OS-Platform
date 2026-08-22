 /**
 * VETRA-TEST-02: RLS Integration Tests (Real PostgreSQL)
 * =======================================================
 *
 * Tests Row-Level Security enforcement on a real PostgreSQL database.
 * These tests verify FAIL-CLOSED tenant isolation at the database level.
 *
 * PREREQUISITES:
 *   - A PostgreSQL database must be accessible at DATABASE_URL
 *   - Migrations 0000 through 0008 must have been applied
 *   - The vetra_app and vetra_migration roles must exist (run init scripts)
 *
 * If PostgreSQL is not available, all tests are skipped with a clear message.
 *
 * SECURITY: Tests use dedicated test tenant IDs (999990, 999991) to avoid
 * interfering with production or development data.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDatabasePool, pool } from "../../lib/db/src/index";

// ─── Test Constants ────────────────────────────────────────────────────────

const TENANT_A = 999990;
const TENANT_B = 999991;
const TEST_TIMEOUT = 30_000;

// ─── Database Connection ───────────────────────────────────────────────────

let adminPool: Awaited<ReturnType<typeof pool.connect>>;
let appPool: typeof pool | undefined;
let appClient: Awaited<ReturnType<typeof pool.connect>>;
let postgresAvailable = false;

beforeAll(async () => {
  const dbUrl = process.env.DATABASE_URL || "";
  if (!dbUrl || dbUrl.includes("USER") || dbUrl.includes("PASSWORD") || dbUrl.includes("HOST")) {
    console.warn(
      "⚠ VETRA-TEST-02: DATABASE_URL is not set or contains placeholder values.\n" +
      "  RLS integration tests require a real PostgreSQL database.\n" +
      "  Set DATABASE_URL=postgresql://user:pass@host:5432/db to run these tests.\n" +
      "  All RLS integration tests will be SKIPPED."
    );
    return;
  }

  const appDbUrl = process.env.DATABASE_TEST_APP_URL;
  if (!appDbUrl) {
    console.warn(
      "⚠ VETRA-TEST-02: DATABASE_TEST_APP_URL is not set.\n" +
      "  RLS integration tests require a non-owner application role.\n" +
      "  All RLS integration tests will be SKIPPED."
    );
    return;
  }

  try {
    adminPool = await pool.connect();
    await adminPool.query("SELECT 1");
    appPool = createDatabasePool(appDbUrl);
    appClient = await appPool.connect();
    await appClient.query("SELECT 1");
    postgresAvailable = true;
    console.log("✓ VETRA-TEST-02: PostgreSQL connected. Running RLS integration tests.");
  } catch (err) {
    console.warn(
      `⚠ VETRA-TEST-02: Cannot connect to PostgreSQL: ${(err as Error).message}\n` +
      "  All RLS integration tests will be SKIPPED."
    );
    postgresAvailable = false;
  }
}, TEST_TIMEOUT);

afterAll(async () => {
  // Clean up test data
  if (postgresAvailable && adminPool) {
    try {
      await adminPool.query("DELETE FROM workflow_run_events WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM form_submissions WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM form_template_versions WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM form_templates WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM workflow_steps WHERE workflow_id IN (SELECT id FROM workflows WHERE organization_id IN ($1, $2))", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM workflow_runs WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM workflows WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM projects WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM users WHERE organization_id IN ($1, $2)", [TENANT_A, TENANT_B]);
      await adminPool.query("DELETE FROM organizations WHERE id IN ($1, $2)", [TENANT_A, TENANT_B]);
    } catch {
      // Best-effort cleanup
    }
  }
  appClient?.release();
  await appPool?.end();
  adminPool?.release();
});

 // ─── Helper ─────────────────────────────────────────────────────────────────

 async function setupTestData(): Promise<void> {
   // Create test organizations
   await adminPool.query(
     "INSERT INTO organizations (id, name, created_at) VALUES ($1, 'Test Org A', NOW()), ($2, 'Test Org B', NOW()) ON CONFLICT DO NOTHING",
     [TENANT_A, TENANT_B]
   );

   // Create test users in each org
   await adminPool.query(
     "INSERT INTO users (id, name, email, clerk_user_id, organization_id, role) VALUES ($1, 'User A', 'user_a@test.local', 'clerk_test_user_a', $2, 'Worker'), ($3, 'User B', 'user_b@test.local', 'clerk_test_user_b', $4, 'Worker') ON CONFLICT DO NOTHING",
     [10001, TENANT_A, 10002, TENANT_B]
   );

   // Create test projects
  await adminPool.query(
    "INSERT INTO projects (id, name, client, location, start_date, end_date, manager_id, organization_id, created_at) VALUES ($1, 'Project A', 'Test Client', 'Test Location', CURRENT_DATE, CURRENT_DATE + 1, $2, $3, NOW()), ($4, 'Project B', 'Test Client', 'Test Location', CURRENT_DATE, CURRENT_DATE + 1, $5, $6, NOW()) ON CONFLICT DO NOTHING",
    [20001, 10001, TENANT_A, 20002, 10002, TENANT_B]
  );
 }

 async function setOrg(orgId: number): Promise<void> {
   await appClient.query("SELECT set_organization_context($1)", [orgId]);
 }

 async function clearOrg(): Promise<void> {
   await appClient.query("SELECT set_config('app.current_organization_id', '', false)");
 }

 // ─── Test Suite: Database Connectivity ─────────────────────────────────────

 describe("VETRA-TEST-02: Database Connectivity", () => {
   it("P0-1: PostgreSQL is available", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     const result = await adminPool.query("SELECT 1 AS one");
     expect(result.rows[0].one).toBe(1);
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: RLS Enabled and Forced ────────────────────────────────────

 describe("VETRA-TEST-02: RLS Enabled and Forced", () => {
   it("P0-2: All tenant tables have RLS enabled", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     const requiredTables = [
       "users", "projects", "tasks", "contracts", "daily_reports",
       "meetings", "equipment", "inventory", "procurement",
       "activity", "documents", "audit_logs", "roles",
       "form_templates", "form_template_versions", "form_submissions",
       "workflows", "workflow_steps", "workflow_runs", "workflow_run_events",
     ];
     const result = await adminPool.query(
       `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = ANY($1)
        AND rowsecurity = true`,
       [requiredTables]
     );
     const rlsEnabledTables = result.rows.map((r: any) => r.tablename);
     for (const table of requiredTables) {
       expect(rlsEnabledTables).toContain(table);
     }
   }, TEST_TIMEOUT);

   it("P0-3: All tenant tables have FORCE ROW LEVEL SECURITY", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     const requiredTables = [
       "users", "projects", "tasks", "contracts", "daily_reports",
       "meetings", "equipment", "inventory", "procurement",
       "activity", "documents", "audit_logs", "roles",
       "form_templates", "form_template_versions", "form_submissions",
       "workflows", "workflow_steps", "workflow_runs", "workflow_run_events",
     ];
     const result = await adminPool.query(
       `SELECT c.relname AS tablename
        FROM pg_class AS c
        INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
        AND c.relname = ANY($1)
        AND c.relforcerowsecurity = true`,
       [requiredTables]
     );
     const forcedTables = result.rows.map((r: any) => r.tablename);
     for (const table of requiredTables) {
       expect(forcedTables).toContain(table);
     }
   }, TEST_TIMEOUT);

   it("P0-4: Shared reference tables do NOT have RLS", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     const result = await adminPool.query(
       `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('organizations', 'permissions', 'role_permissions')
        AND rowsecurity = true`
     );
     expect(result.rows.length).toBe(0);
   }, TEST_TIMEOUT);
 });

 describe("VETRA-FORM-01: Forms RLS Isolation", () => {
   beforeAll(async () => {
     if (!postgresAvailable) return;
     await setupTestData();
     await adminPool.query(
       "INSERT INTO form_templates (id, organization_id, name, status, definition, created_by, updated_by) VALUES ($1, $2, 'Org A form', 'draft', '{\"fields\":[]}'::jsonb, $3, $3), ($4, $5, 'Org B form', 'draft', '{\"fields\":[]}'::jsonb, $6, $6) ON CONFLICT DO NOTHING",
       [61001, TENANT_A, 10001, 61002, TENANT_B, 10002],
     );
   }, TEST_TIMEOUT);

   it("P1-FORM-1: tenant A cannot read tenant B form templates", async () => {
     if (!postgresAvailable) { console.warn("SKIPPED: PostgreSQL not available"); return; }
     await setOrg(TENANT_A);
     const result = await appClient.query("SELECT id FROM form_templates ORDER BY id");
     expect(result.rows.map((row: { id: number }) => row.id)).toEqual([61001]);
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: FAIL-CLOSED — No Context = No Rows ────────────────────────

 describe("VETRA-TEST-02: FAIL-CLOSED — No Context = No Rows", () => {
   beforeAll(async () => {
     if (postgresAvailable) await setupTestData();
   }, TEST_TIMEOUT);

   it("P0-5: SELECT returns zero rows when org context is not set", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await clearOrg();
     const result = await appClient.query("SELECT * FROM users WHERE organization_id = $1", [TENANT_A]);
     // FAIL-CLOSED: No rows should be visible without org context
     expect(result.rows.length).toBe(0);
   }, TEST_TIMEOUT);

   it("P0-6: INSERT fails when org context is not set", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await clearOrg();
     await expect(
       appClient.query(
         "INSERT INTO users (id, name, email, organization_id, role) VALUES ($1, $2, $3, $4, $5)",
         [99999, "NoOrg User", "noorg@test.local", TENANT_A, "Worker"]
       )
     ).rejects.toThrow();
   }, TEST_TIMEOUT);

   it("P0-7: UPDATE affects zero rows when org context is not set", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await clearOrg();
     const result = await appClient.query(
       "UPDATE users SET name = 'Hacked' WHERE organization_id = $1",
       [TENANT_A]
     );
     expect(result.rowCount).toBe(0);
   }, TEST_TIMEOUT);

   it("P0-8: DELETE affects zero rows when org context is not set", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await clearOrg();
     const result = await appClient.query(
       "DELETE FROM users WHERE organization_id = $1",
       [TENANT_A]
     );
     expect(result.rowCount).toBe(0);
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: Cross-Tenant Isolation — Read ─────────────────────────────

 describe("VETRA-TEST-02: Cross-Tenant Isolation — Read", () => {
   beforeAll(async () => {
     if (postgresAvailable) await setupTestData();
   }, TEST_TIMEOUT);

   it("P0-9: Tenant A cannot read Tenant B's users", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await setOrg(TENANT_A);
     const result = await appClient.query("SELECT * FROM users");
     const orgIds = result.rows.map((r: any) => r.organization_id);
     // Should only see Tenant A's data
     expect(orgIds.every((id: number) => id === TENANT_A)).toBe(true);
     expect(orgIds.some((id: number) => id === TENANT_B)).toBe(false);
   }, TEST_TIMEOUT);

   it("P0-10: Tenant B cannot read Tenant A's projects", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await setOrg(TENANT_B);
     const result = await appClient.query("SELECT * FROM projects");
     const orgIds = result.rows.map((r: any) => r.organization_id);
     expect(orgIds.every((id: number) => id === TENANT_B)).toBe(true);
     expect(orgIds.some((id: number) => id === TENANT_A)).toBe(false);
   }, TEST_TIMEOUT);

   it("P0-11: Tenant A sees only its own data after switching context", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     // Switch from Tenant A to Tenant B and back
     await setOrg(TENANT_A);
     let result = await appClient.query("SELECT * FROM users");
     expect(result.rows.every((r: any) => r.organization_id === TENANT_A)).toBe(true);

     await setOrg(TENANT_B);
     result = await appClient.query("SELECT * FROM users");
     expect(result.rows.every((r: any) => r.organization_id === TENANT_B)).toBe(true);

     await setOrg(TENANT_A);
     result = await appClient.query("SELECT * FROM users");
     expect(result.rows.every((r: any) => r.organization_id === TENANT_A)).toBe(true);
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: Cross-Tenant Isolation — Write ────────────────────────────

 describe("VETRA-TEST-02: Cross-Tenant Isolation — Write", () => {
   beforeAll(async () => {
     if (postgresAvailable) await setupTestData();
   }, TEST_TIMEOUT);

   it("P0-12: Tenant A cannot update Tenant B's users", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await setOrg(TENANT_A);
     // Try to update a user in Tenant B
     const result = await appClient.query(
       "UPDATE users SET name = 'Hacked' WHERE organization_id = $1 AND id = $2 RETURNING *",
       [TENANT_B, 10002]
     );
     // RLS should prevent the update — zero rows affected
     expect(result.rows.length).toBe(0);
   }, TEST_TIMEOUT);

   it("P0-13: Tenant A cannot delete Tenant B's projects", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await setOrg(TENANT_A);
     const result = await appClient.query(
       "DELETE FROM projects WHERE organization_id = $1 AND id = $2 RETURNING *",
       [TENANT_B, 20002]
     );
     expect(result.rows.length).toBe(0);
   }, TEST_TIMEOUT);

   it("P0-14: Tenant A can only create data within its own org", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await setOrg(TENANT_A);
     // Try to insert a project with Tenant B's org ID
     await expect(
       appClient.query(
         "INSERT INTO projects (id, name, client, location, start_date, end_date, manager_id, organization_id, created_at) VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE + 1, $5, $6, NOW())",
         [29999, "Cross-Tenant Project", "Test Client", "Test Location", 10001, TENANT_B]
       )
     ).rejects.toThrow();
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: Request-Scoped RLS Context ────────────────────────────────

 describe("VETRA-SEC-06: Request-Scoped RLS Context", () => {
   beforeAll(async () => {
     if (postgresAvailable) await setupTestData();
   }, TEST_TIMEOUT);

   it("P1-8: Clerk bootstrap may resolve only the authenticated active user", async () => {
     if (!postgresAvailable) { console.warn("SKIPPED: PostgreSQL not available"); return; }
     await clearOrg();
     await appClient.query("BEGIN");
     try {
       await appClient.query("SELECT set_request_clerk_user_context($1)", ["clerk_test_user_a"]);
       const result = await appClient.query(
         "SELECT id, organization_id, clerk_user_id FROM users WHERE clerk_user_id IN ($1, $2) ORDER BY id",
         ["clerk_test_user_a", "clerk_test_user_b"],
       );
       expect(result.rows).toEqual([
         { id: 10001, organization_id: TENANT_A, clerk_user_id: "clerk_test_user_a" },
       ]);
     } finally {
       await appClient.query("ROLLBACK");
     }
   }, TEST_TIMEOUT);

   it("P1-9: organization context is cleared when a request transaction commits", async () => {
     if (!postgresAvailable) { console.warn("SKIPPED: PostgreSQL not available"); return; }
     await clearOrg();
     await appClient.query("BEGIN");
     try {
       await appClient.query("SELECT set_request_organization_context($1)", [TENANT_A]);
       const scoped = await appClient.query("SELECT organization_id FROM projects ORDER BY id");
       expect(scoped.rows.every((row: { organization_id: number }) => row.organization_id === TENANT_A)).toBe(true);
     } finally {
       await appClient.query("COMMIT");
     }

     const afterCommit = await appClient.query("SELECT organization_id FROM projects");
     expect(afterCommit.rows).toEqual([]);
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: RLS Policy Count ──────────────────────────────────────────

 describe("VETRA-TEST-02: RLS Policy Count", () => {
   it("P1-1: Each tenant table has exactly 4 policies (SELECT, INSERT, UPDATE, DELETE)", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     const result = await adminPool.query(
       `SELECT tablename, count(*) as policy_count
        FROM pg_policies
        WHERE policyname LIKE '%_tenant_isolation_%'
        GROUP BY tablename
        ORDER BY tablename`
     );
     for (const row of result.rows) {
       expect(Number(row.policy_count)).toBe(4);
     }
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: Audit Log Append-Only ─────────────────────────────────────

 describe("VETRA-TEST-02: Audit Log Append-Only", () => {
   it("P1-2: audit_logs rejects UPDATE operations", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await expect(
       adminPool.query("UPDATE audit_logs SET action = 'tampered' WHERE id = 1")
     ).rejects.toThrow();
   }, TEST_TIMEOUT);

   it("P1-3: audit_logs rejects DELETE operations", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await expect(
       adminPool.query("DELETE FROM audit_logs WHERE id = 1")
     ).rejects.toThrow();
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: Non-Owner Role Isolation (VETRA-INFRA-01) ─────────────────

 describe("VETRA-TEST-02: Non-Owner Role Isolation", () => {
   it("P1-4: vetra_app role cannot bypass RLS", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await clearOrg();
     const result = await appClient.query("SELECT * FROM users WHERE organization_id = $1", [TENANT_A]);
     expect(result.rows.length).toBe(0);
   }, TEST_TIMEOUT);

   it("P1-5: vetra_app role cannot create tables (no DDL privilege)", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await expect(
       appClient.query("CREATE TABLE test_security_bypass (id serial)")
     ).rejects.toThrow();
   }, TEST_TIMEOUT);

   it("P1-6: vetra_app role cannot drop tables", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     await expect(
       appClient.query("DROP TABLE users")
     ).rejects.toThrow();
   }, TEST_TIMEOUT);
 });

 // ─── Test Suite: setOrganizationContext Function ────────────────────────────

 describe("VETRA-TEST-02: setOrganizationContext", () => {
   it("P1-7: set_organization_context function exists and is callable", async () => {
     if (!postgresAvailable) {
       console.warn("SKIPPED: PostgreSQL not available");
       return;
     }
     const result = await adminPool.query(
       "SELECT proname FROM pg_proc WHERE proname = 'set_organization_context'"
     );
     expect(result.rows.length).toBeGreaterThanOrEqual(1);
     // Verify it can be called
     await adminPool.query("SELECT set_organization_context($1)", [TENANT_A]);
     await adminPool.query("SELECT set_organization_context($1)", [TENANT_B]);
   }, TEST_TIMEOUT);
 });
