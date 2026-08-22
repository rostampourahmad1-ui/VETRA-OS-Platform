import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
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
export const db = drizzle(pool, { schema });

/**
 * Creates a dedicated PostgreSQL pool for controlled test or worker contexts.
 * Callers must provide a connection string for the intended database role.
 */
export function createDatabasePool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

/**
 * VETRA-SEC-05: Sets the PostgreSQL RLS organization context
 * for the current database session. Must be called before any
 * query that operates on tenant-scoped tables.
 *
 * This enables Row-Level Security as a second line of defense
 * against cross-tenant data leaks.
 */
export async function setOrganizationContext(organizationId: number): Promise<void> {
  await db.execute(
    sql`SELECT set_organization_context(${organizationId})`,
  );
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
