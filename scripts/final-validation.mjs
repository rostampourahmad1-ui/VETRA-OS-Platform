#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const hasDatabaseTestUrl = Boolean(process.env.DATABASE_TEST_APP_URL);
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

function run(label, args) {
  process.stdout.write(`\n=== ${label} ===\n`);
  const result = spawnSync(executable, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (nodeMajor !== 24) {
  process.stderr.write(`WARNING: Node ${process.versions.node} detected; CI target is Node 24. Run this gate on Node 24 before release.\n`);
}

run("OpenAPI code generation", ["--filter", "@workspace/api-spec", "run", "codegen"]);
run("Lint", ["lint"]);
run("Typecheck", ["typecheck"]);
run("Unit and regression tests", ["test"]);

if (hasDatabaseTestUrl) {
  run("PostgreSQL RLS integration tests", ["exec", "vitest", "run", "tests/security/rls-integration.test.ts"]);
} else {
  process.stdout.write("\n=== PostgreSQL RLS integration tests ===\nSKIPPED: DATABASE_TEST_APP_URL is not set. This is a release blocker outside CI.\n");
}

run("Production build", ["build"]);
process.stdout.write("\n=== Diff hygiene ===\n");
const diff = spawnSync("git", ["diff", "--check"], { stdio: "inherit", env: process.env });
if (diff.error) throw diff.error;
if (diff.status !== 0) process.exit(diff.status ?? 1);

process.stdout.write("\nFinal validation completed. Review git status before committing generated changes.\n");
