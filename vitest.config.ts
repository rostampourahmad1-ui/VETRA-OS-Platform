import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "tests/setup.ts")],
    include: ["tests/**/*.test.ts", "artifacts/**/*.test.ts"],
    clearMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    server: {
      deps: {
        // Inlined so `vi.mock("@clerk/express")` can intercept `getAuth` in the
        // real auth/tenant middlewares under test.
        inline: ["@clerk/express"],
      },
    },
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(__dirname, "lib/db/src/index.ts"),
      "@workspace/api-zod": path.resolve(__dirname, "lib/api-zod/src/index.ts"),
      // Single physical copy so `vi.mock("@clerk/express")` intercepts the
      // `getAuth` used by the real middlewares under test.
      "@clerk/express": path.resolve(__dirname, "artifacts/api-server/node_modules/@clerk/express"),
      express: path.resolve(__dirname, "artifacts/api-server/node_modules/express"),
    },
  },
});
