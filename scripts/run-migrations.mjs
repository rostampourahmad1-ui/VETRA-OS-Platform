#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationsDirectory = resolve(
  process.env.MIGRATIONS_DIR ?? join(repositoryRoot, "lib/db/drizzle"),
);
const databaseUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_MIGRATION_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const migrationPattern = /^(\d+)_.*\.sql$/;
const migrationFiles = readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && migrationPattern.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => {
    const leftNumber = Number(left.match(migrationPattern)?.[1]);
    const rightNumber = Number(right.match(migrationPattern)?.[1]);
    return leftNumber - rightNumber || left.localeCompare(right);
  });

if (migrationFiles.length === 0) {
  console.error(`No SQL migrations found in ${migrationsDirectory}.`);
  process.exit(1);
}

const migrationNumbers = new Set();
for (const migrationFile of migrationFiles) {
  const migrationNumber = Number(migrationFile.match(migrationPattern)?.[1]);
  if (migrationNumbers.has(migrationNumber)) {
    console.error(`Duplicate migration sequence detected: ${migrationFile}`);
    process.exit(1);
  }
  migrationNumbers.add(migrationNumber);
}

console.log(`Applying ${migrationFiles.length} SQL migrations from ${migrationsDirectory}`);
for (const migrationFile of migrationFiles) {
  console.log(`→ ${migrationFile}`);
  const result = spawnSync(
    "psql",
    ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--file", join(migrationsDirectory, migrationFile), databaseUrl],
    { stdio: "inherit" },
  );

  if (result.error) {
    console.error(`Unable to execute ${migrationFile}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Migration failed: ${migrationFile}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`Successfully applied ${migrationFiles.length} SQL migrations.`);
