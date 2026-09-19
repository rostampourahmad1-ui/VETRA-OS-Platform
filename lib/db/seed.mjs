#!/usr/bin/env node
/**
 * VETRA OS — minimal demo seed (local/testing only).
 *
 * Creates one clearly-labelled sample organization, the standard role set with
 * an all-permissions admin role, one demo admin user, and one sample project
 * under that organization. Idempotent; safe to re-run.
 *
 * Local/test only. Set SEED_CLERK_USER_ID to map a real Clerk user into the
 * demo organization (as the admin role) plus project membership, so the
 * signed-in user can complete onboarding and exercise the main paths.
 *
 * Safety:
 * - Refuses to run when NODE_ENV=production.
 * - Requires SEED_CLERK_USER_ID unless SEED_ALLOW_NO_CLERK_USER=true.
 * - Idempotent: re-running never creates duplicate users, memberships or
 *   projects, and never resets real data.
 *
 * Runs with the owner/superuser connection (DATABASE_URL) so RLS does not block
 * seeding.
 */
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL;

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run the local test seed while NODE_ENV=production.");
  console.error("This script creates sample data and attaches a Clerk user for local testing only.");
  process.exit(1);
}

if (!connectionString) {
  console.error("DATABASE_MIGRATION_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const ORG_NAME = process.env.SEED_ORG_NAME || "شرکت نمونه وترا";
const PROJECT_NAME = process.env.SEED_PROJECT_NAME || "پروژهٔ نمونه وترا";
const DEMO_EMAIL = process.env.SEED_MANAGER_EMAIL || "demo.manager@vetra.local";
const CLERK_USER_ID = process.env.SEED_CLERK_USER_ID || null;
const ALLOW_NO_CLERK_USER = process.env.SEED_ALLOW_NO_CLERK_USER === "true";

if (!CLERK_USER_ID && !ALLOW_NO_CLERK_USER) {
  console.error("SEED_CLERK_USER_ID is required to map a real Clerk user into the sample organization.");
  console.error("Set it in your local environment (never commit it), for example:");
  console.error("  SEED_CLERK_USER_ID=user_xxxxxxxx DATABASE_MIGRATION_URL=... pnpm --filter @workspace/db seed");
  console.error("To seed sample data only (no user mapping), set SEED_ALLOW_NO_CLERK_USER=true explicitly.");
  process.exit(1);
}

const ROLE_NAMES = [
  "CEO", "ProjectDirector", "ProjectManager", "PlanningEngineer", "SiteEngineer",
  "Supervisor", "HR", "Accountant", "WarehouseManager", "ProcurementOfficer", "Worker",
];
const ADMIN_ROLE = "CEO";

const client = new pg.Client({ connectionString });

async function ensureOrganization() {
  const found = await client.query("select id from organizations where name = $1 limit 1", [ORG_NAME]);
  if (found.rows.length) return found.rows[0].id;
  const created = await client.query(
    "insert into organizations (name, type, logo_initials, industry, country) values ($1, 'contractor', 'VETRA', 'construction', 'IR') returning id",
    [ORG_NAME],
  );
  return created.rows[0].id;
}

async function ensureRoles(orgId) {
  const roleIdByName = {};
  for (const name of ROLE_NAMES) {
    const found = await client.query(
      "select id from roles where organization_id = $1 and name = $2 limit 1",
      [orgId, name],
    );
    roleIdByName[name] = found.rows.length
      ? found.rows[0].id
      : (await client.query("insert into roles (name, organization_id) values ($1, $2) returning id", [name, orgId])).rows[0].id;
  }
  // Admin role receives every defined permission.
  await client.query(
    "insert into role_permissions (role_id, permission_id) select $1, id from permissions on conflict do nothing",
    [roleIdByName[ADMIN_ROLE]],
  );
  return roleIdByName;
}

async function ensureUser({ orgId, roleIdByName, email, name, role, clerkUserId }) {
  const found = clerkUserId
    ? await client.query("select id from users where clerk_user_id = $1 limit 1", [clerkUserId])
    : await client.query("select id from users where email = $1 limit 1", [email]);

  let userId;
  if (found.rows.length) {
    userId = found.rows[0].id;
    await client.query(
      "update users set organization_id = $2, active = true, role = $3 where id = $1",
      [userId, orgId, role],
    );
  } else {
    userId = (await client.query(
      "insert into users (name, email, clerk_user_id, role, avatar_initials, organization_id, active) values ($1, $2, $3, $4, $5, $6, true) returning id",
      [name, email, clerkUserId, role, "کار", orgId],
    )).rows[0].id;
  }
  await client.query(
    "insert into user_roles (user_id, role_id) values ($1, $2) on conflict do nothing",
    [userId, roleIdByName[role]],
  );
  return userId;
}

async function ensureProjectMembership(projectId, userId, orgId, role = "member") {
  // Idempotent without relying on a named unique constraint: some local
  // databases were provisioned by `drizzle-kit push`, which does not create the
  // `(project_id, user_id)` unique constraint that `ON CONFLICT` would need.
  await client.query(
    `insert into project_members (project_id, user_id, organization_id, role)
     select $1, $2, $3, $4
     where not exists (
       select 1 from project_members where project_id = $1 and user_id = $2
     )`,
    [projectId, userId, orgId, role],
  );
}

async function main() {
  await client.connect();
  await client.query("BEGIN");

  const orgId = await ensureOrganization();
  const roleIdByName = await ensureRoles(orgId);

  const managerId = await ensureUser({
    orgId, roleIdByName, email: DEMO_EMAIL, name: "مدیر نمونه", role: ADMIN_ROLE, clerkUserId: null,
  });

  const existingProject = await client.query(
    "select id from projects where name = $1 and organization_id = $2 limit 1",
    [PROJECT_NAME, orgId],
  );
  const projectId = existingProject.rows.length
    ? existingProject.rows[0].id
    : (await client.query(
        `insert into projects (name, description, status, client, location, start_date, end_date, manager_id, organization_id, priority)
         values ($1, $2, 'planning', $3, $4, '2026-01-01', '2026-12-31', $5, $6, 'medium') returning id`,
        [PROJECT_NAME, "پروژهٔ نمونه برای تست و ویرایش", "کارفرمای نمونه", "تهران", managerId, orgId],
      )).rows[0].id;

  let provisioned = null;
  if (CLERK_USER_ID) {
    const email = process.env.SEED_USER_EMAIL || `${CLERK_USER_ID}@seed.local`;
    provisioned = await ensureUser({
      orgId, roleIdByName, email, name: "کاربر نمونه", role: ADMIN_ROLE, clerkUserId: CLERK_USER_ID,
    });
    await ensureProjectMembership(projectId, provisioned, orgId);

    // Fail loudly if the mapping did not end up active in the sample tenant.
    const mapped = await client.query(
      "select id, organization_id, active from users where clerk_user_id = $1 limit 1",
      [CLERK_USER_ID],
    );
    const row = mapped.rows[0];
    if (!row || row.organization_id !== orgId || !row.active) {
      throw new Error(
        "Clerk user mapping verification failed: no active VETRA user in the sample organization for SEED_CLERK_USER_ID.",
      );
    }
  }

  await client.query("COMMIT");

  console.log("Seed complete:");
  console.log(`  organization id=${orgId} (${ORG_NAME})`);
  console.log(`  project id=${projectId} (${PROJECT_NAME})`);
  console.log(`  roles created: ${ROLE_NAMES.join(", ")}`);
  console.log(`  demo admin user id=${managerId} (${DEMO_EMAIL})`);
  if (provisioned) {
    console.log(`  Clerk user mapped to organization id=${orgId} (role ${ADMIN_ROLE}) and project id=${projectId}`);
    console.log("  Reminder: this Clerk user must also be a member of a Clerk Organization so the session carries orgId.");
  } else {
    console.log("  clerk user provisioned: no (SEED_ALLOW_NO_CLERK_USER=true)");
  }
  console.log("Both the organization and the project are editable in the app.");

  await client.end();
}

main().catch(async (error) => {
  console.error("Seed failed:", error.message);
  try { await client.query("ROLLBACK"); } catch {}
  try { await client.end(); } catch {}
  process.exit(1);
});
