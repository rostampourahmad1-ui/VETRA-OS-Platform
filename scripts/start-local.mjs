import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

function loadEnvFile(file) {
  return readFile(file, "utf8").then((content) => {
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
      process.env[key] = value;
    }
  });
}

await loadEnvFile(".env");
await loadEnvFile(process.env.VETRA_ENV_FILE ?? ".env.local");

for (const name of ["DATABASE_URL", "DATABASE_APP_URL", "DATABASE_MIGRATION_URL", "DATABASE_TEST_APP_URL"]) {
  if (process.env[name]) process.env[name] = process.env[name].replace(":5433", ":5432");
}

const api = process.env.VETRA_ONLY_WEB ? null : spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
  env: { ...process.env, PORT: "5000" },
  stdio: "inherit",
});

const web = process.env.VETRA_ONLY_API ? null : spawn("corepack pnpm --filter @workspace/vetra dev", {
  env: { ...process.env, PORT: "5173" },
  stdio: "inherit",
  shell: true,
});

const stop = () => {
  api?.kill();
  web?.kill();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
api?.on("exit", (code) => { if (code && code !== 0) web?.kill(); });
web?.on("exit", (code) => { if (code && code !== 0) api.kill(); });
