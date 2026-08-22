import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("VETRA-SEC-06: request-scoped RLS architecture", () => {
  const databaseSource = read("lib/db/src/index.ts");
  const tenantMiddleware = read("artifacts/api-server/src/middlewares/tenant.ts");
  const auditSource = read("artifacts/api-server/src/lib/audit.ts");
  const migration = read("lib/db/drizzle/0008_request_scoped_rls.sql");

  it("binds database calls to an AsyncLocalStorage request context and a dedicated client", () => {
    expect(databaseSource).toContain("AsyncLocalStorage");
    expect(databaseSource).toContain("const client = await pool.connect()");
    expect(databaseSource).toContain("runWithRequestDatabaseContext");
    expect(databaseSource).toContain('await client.query("BEGIN")');
    expect(databaseSource).toContain('await client.query(commit ? "COMMIT" : "ROLLBACK")');
  });

  it("uses transaction-local settings and a narrowly scoped Clerk bootstrap policy", () => {
    expect(migration).toContain("set_request_organization_context");
    expect(migration).toContain("set_config('app.current_organization_id', org_id::text, true)");
    expect(migration).toContain("set_request_clerk_user_context");
    expect(migration).toContain("users_clerk_identity_bootstrap_select");
    expect(migration).toContain('"clerk_user_id" = NULLIF(current_setting');
    expect(migration).toContain("REVOKE ALL ON FUNCTION set_request_organization_context(integer) FROM PUBLIC");
  });

  it("binds tenant middleware to the request session and closes it on response completion", () => {
    expect(tenantMiddleware).toContain("createOrganizationDatabaseSession");
    expect(tenantMiddleware).toContain("resolveActiveUserByClerkId");
    expect(tenantMiddleware).toContain('res.once("finish"');
    expect(tenantMiddleware).toContain("await session.close(commit)");
    expect(tenantMiddleware).toContain("runWithRequestDatabaseContext(session.db, () => next())");
  });

  it("keeps asynchronous audit writes in their own tenant-bound transaction", () => {
    expect(auditSource).toContain("withOrganizationDatabase(entry.organizationId");
    expect(auditSource).toContain("withOrganizationDatabase(organizationId");
  });
});
