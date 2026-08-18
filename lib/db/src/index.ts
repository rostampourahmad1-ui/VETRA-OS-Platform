import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

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

export * from "./schema";
