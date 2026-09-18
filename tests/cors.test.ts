import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "",
}));
vi.mock("../artifacts/api-server/src/middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/clerk-proxy",
  clerkProxyMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getClerkProxyHost: () => undefined,
}));
vi.mock("../artifacts/api-server/src/routes", () => ({
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const originalAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

// Both cases exercise the same configured allowlist. Import the app once so the
// heavy bootstrap is not repeated (and not bounded by a per-test timeout) under
// parallel workers.
let app: Express;

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = "https://app.example.com";
  ({ default: app } = await import("../artifacts/api-server/src/app"));
});

afterAll(() => {
  process.env.CORS_ALLOWED_ORIGINS = originalAllowedOrigins;
});

describe("CORS origin allowlist", () => {
  it("allows a configured origin for credentialed preflight requests", async () => {
    const response = await request(app)
      .options("/api/projects")
      .set("Origin", "https://app.example.com")
      .set("Access-Control-Request-Method", "GET");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant CORS access to an unconfigured origin", async () => {
    const response = await request(app)
      .options("/api/projects")
      .set("Origin", "https://untrusted.example")
      .set("Access-Control-Request-Method", "GET");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});
