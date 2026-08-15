import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "tests/setup.ts")],
    include: ["tests/**/*.test.ts", "artifacts/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: { "@workspace/db": path.resolve(__dirname, "lib/db/src/index.ts"), "@workspace/api-zod": path.resolve(__dirname, "lib/api-zod/src/index.ts"), express: path.resolve(__dirname, "artifacts/api-server/node_modules/express") },
  },
});
