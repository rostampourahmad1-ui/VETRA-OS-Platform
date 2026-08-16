import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

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

async function appWithOrigins(origins: string) {
  vi.resetModules();
  process.env.CORS_ALLOWED_ORIGINS = origins;
  const { default: app } = await import("../artifacts/api-server/src/app");
  return app;
}

afterEach(() => {
  process.env.CORS_ALLOWED_ORIGINS = originalAllowedOrigins;
});

describe("CORS origin allowlist", () => {
  it("allows a configured origin for credentialed preflight requests", async () => {
    const app = await appWithOrigins("https://app.example.com");

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
    const app = await appWithOrigins("https://app.example.com");

    const response = await request(app)
      .options("/api/projects")
      .set("Origin", "https://untrusted.example")
      .set("Access-Control-Request-Method", "GET");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });
});
