/**
 * Local test-seed safety and idempotency guards.
 *
 * The seed is the only supported way to attach a real Clerk user to the sample
 * VETRA organization for controlled human testing. These tests run the script
 * as a child process (no database connection is reached because the guards are
 * evaluated before `client.connect()`).
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const seedPath = path.join(root, "lib/db/seed.mjs");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

function runSeed(env: Record<string, string>) {
  return spawnSync(process.execPath, [seedPath], {
    env: {
      ...process.env,
      DATABASE_MIGRATION_URL: "postgresql://guard:guard@127.0.0.1:1/never_connect",
      DATABASE_URL: "",
      SEED_CLERK_USER_ID: "",
      SEED_ALLOW_NO_CLERK_USER: "",
      ...env,
    },
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("local seed safety guards", () => {
  it("refuses to run in production", () => {
    const result = runSeed({ NODE_ENV: "production", SEED_CLERK_USER_ID: "user_test" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/production/i);
  });

  it("stops with a clear message when SEED_CLERK_USER_ID is missing", () => {
    const result = runSeed({ NODE_ENV: "test" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/SEED_CLERK_USER_ID/);
  });

  it("is idempotent and scoped: upsert by clerk id, no duplicate memberships", () => {
    const source = read("lib/db/seed.mjs");
    expect(source).toContain("SEED_CLERK_USER_ID");
    expect(source).toContain("where clerk_user_id = $1");
    // Membership insert must be idempotent even when the database lacks the
    // `(project_id, user_id)` unique constraint (drizzle-kit push schemas).
    expect(source).toContain("where not exists (");
    expect(source).toContain("project_id = $1 and user_id = $2");
    expect(source).toContain("on conflict do nothing");
  });
});

describe("onboarding blocker sources are the app middleware, not the frontend", () => {
  it("tenant middleware returns distinct 403s for missing org and missing mapping", () => {
    const tenantSource = read("artifacts/api-server/src/middlewares/tenant.ts");
    expect(tenantSource).toContain("no organization assigned in session");
    expect(tenantSource).toContain("not mapped to a VETRA organization");
    expect(tenantSource).toContain("resolveActiveUserByClerkId");
  });

  it("organizations route is guarded by requireAuth", () => {
    const organizationsSource = read("artifacts/api-server/src/routes/organizations.ts");
    expect(organizationsSource).toContain("router.use(requireAuth)");
  });

  it("onboarding page activates the caller's own Clerk organization before loading", () => {
    const page = read("artifacts/vetra/src/pages/onboarding/OrgProjectSelector.tsx");
    expect(page).toContain("useOrganizationList");
    expect(page).toContain("setActive");
    expect(page).toContain("onboarding.noMapping");
  });
});
