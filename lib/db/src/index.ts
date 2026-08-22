import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * VETRA-INFRA-01: Multi-role database connection.
 *
 * Connection priority:
 *   1. DATABASE_APP_URL — non-owner application role (recommended)
 *   2. DATABASE_URL — fallback for backward compatibility
 *
 * The application role (vetra_app) is a non-owner role with RLS enforcement.
 * The migration role (vetra_migration) is a DDL-capable owner role.
 */
const connectionString = process.env.DATABASE_APP_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_APP_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
const rootDb = drizzle(pool, { schema });
// Pool و PoolClient فقط در نوع داخلی $client تفاوت دارند؛ API Drizzle یکسان است.
type DatabaseHandle = Omit<typeof rootDb, "$client">;

/**
 * VETRA-SEC-06: Request-local database handle.
 *
 * A PostgreSQL custom setting is connection-local. Keeping the active Drizzle
 * handle in AsyncLocalStorage guarantees that all database calls made by a
 * tenant request use the same checked-out connection until that request ends.
 */
const requestDatabaseContext = new AsyncLocalStorage<DatabaseHandle>();

/**
 * Backwards-compatible database facade. Existing routes keep importing `db`,
 * while calls made inside `runWithRequestDatabaseContext` resolve to the
 * request-bound Drizzle client instead of the shared pool.
 */
export const db = new Proxy(rootDb, {
  get(target, property, receiver) {
    const active = requestDatabaseContext.getStore() ?? target;
    const value = Reflect.get(active, property, receiver);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as DatabaseHandle;

export interface OrganizationDatabaseSession {
  db: DatabaseHandle;
  close(commit: boolean): Promise<void>;
}

/** Runs work with a request-bound database client visible through `db`. */
export function runWithRequestDatabaseContext<T>(database: DatabaseHandle, work: () => T): T {
  return requestDatabaseContext.run(database, work);
}

/**
 * Checks out one client, begins a transaction, and applies organization context
 * with `SET LOCAL` semantics. The migration-provided function ensures the
 * setting is cleared automatically by COMMIT or ROLLBACK before release.
 */
export async function createOrganizationDatabaseSession(
  organizationId: number,
): Promise<OrganizationDatabaseSession> {
  const client = await pool.connect();
  const scopedDb = drizzle(client, { schema });
  let closed = false;

  try {
    await client.query("BEGIN");
    await scopedDb.execute(
      sql`SELECT set_request_organization_context(${organizationId})`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw error;
  }

  return {
    db: scopedDb,
    async close(commit: boolean): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await client.query(commit ? "COMMIT" : "ROLLBACK");
      } finally {
        client.release();
      }
    },
  };
}

/**
 * Executes a bounded database operation in a dedicated tenant transaction.
 * This is used by out-of-band work such as fire-and-forget audit logging, which
 * must not retain a request connection after its HTTP response has completed.
 */
export async function withOrganizationDatabase<T>(
  organizationId: number,
  work: (database: DatabaseHandle) => Promise<T>,
): Promise<T> {
  const session = await createOrganizationDatabaseSession(organizationId);
  try {
    const result = await runWithRequestDatabaseContext(session.db, () => work(session.db));
    await session.close(true);
    return result;
  } catch (error) {
    await session.close(false);
    throw error;
  }
}

/**
 * Resolves the active VETRA user for a Clerk identity before an organization is
 * known. A narrowly scoped RLS bootstrap policy, keyed by a transaction-local
 * Clerk user setting, permits only this one active mapping row to be read.
 */
export async function resolveActiveUserByClerkId(clerkUserId: string) {
  const client = await pool.connect();
  const bootstrapDb = drizzle(client, { schema });

  try {
    await client.query("BEGIN");
    await bootstrapDb.execute(
      sql`SELECT set_request_clerk_user_context(${clerkUserId})`,
    );
    const [user] = await bootstrapDb
      .select({
        id: schema.usersTable.id,
        organizationId: schema.usersTable.organizationId,
        role: schema.usersTable.role,
        clerkUserId: schema.usersTable.clerkUserId,
      })
      .from(schema.usersTable)
      .where(
        and(
          eq(schema.usersTable.clerkUserId, clerkUserId),
          eq(schema.usersTable.active, true),
        ),
      );
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Legacy session-scoped setter retained for package compatibility only.
 * New request code must use `createOrganizationDatabaseSession` so context is
 * tied to one client and is cleared automatically at transaction completion.
 */
export async function setOrganizationContext(organizationId: number): Promise<void> {
  await rootDb.execute(
    sql`SELECT set_organization_context(${organizationId})`,
  );
}

/**
 * Creates a dedicated PostgreSQL pool for controlled test or worker contexts.
 * Callers must provide a connection string for the intended database role.
 */
export function createDatabasePool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

/**
 * VETRA-INFRA-01: Creates a migration-level database connection.
 * Uses DATABASE_MIGRATION_URL (owner role) for running Drizzle migrations.
 * Falls back to DATABASE_URL for backward compatibility.
 */
export function createMigrationConnection(): { db: ReturnType<typeof drizzle>; pool: pg.Pool } {
  const migrationUrl = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!migrationUrl) {
    throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set for migrations");
  }
  const migrationPool = new Pool({ connectionString: migrationUrl });
  const migrationDb = drizzle(migrationPool, { schema });
  return { db: migrationDb, pool: migrationPool };
}

export * from "./schema";
