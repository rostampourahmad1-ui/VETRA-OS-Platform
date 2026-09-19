/**
 * Onboarding / Clerk-mapping regression tests.
 *
 * These tests exercise the REAL `attachTenant` and `requireAuth` middlewares
 * (the two layers that produce 401/403 for the onboarding data calls) with the
 * Clerk session and VETRA database mocked. They must not depend on a live
 * database, the network, or a real Clerk project.
 *
 * Covered requirements:
 *   - no session                       -> 401
 *   - session without a Clerk orgId    -> 403 (VETRA-SEC-03 guard)
 *   - session with orgId, no mapping   -> 403 (tenant mapping missing)
 *   - valid mapping                    -> 200, with a tenant-bound DB session
 *   - mapped user without permission    -> 403 (RBAC gate)
 *   - cross-tenant project             -> not accessible
 *   - client-supplied identity headers -> ignored (mapping from session only)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const mocks = vi.hoisted(() => ({
  state: {
    auth: { userId: null as string | null, orgId: null as string | null },
    user: null as null | { id: number; organizationId: number; role: string; clerkUserId?: string | null },
    resolveCalls: [] as string[],
    createdSessions: [] as number[],
  },
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => mocks.state.auth,
}));

vi.mock("@workspace/db", () => ({
  db: {},
  projectsTable: {},
  projectMembersTable: {},
  resolveActiveUserByClerkId: async (clerkUserId: string) => {
    mocks.state.resolveCalls.push(clerkUserId);
    return mocks.state.user;
  },
  createOrganizationDatabaseSession: async (organizationId: number) => {
    mocks.state.createdSessions.push(organizationId);
    return { db: {}, close: async () => {} };
  },
  runWithRequestDatabaseContext: (_db: unknown, work: () => unknown) => work(),
}));

import { attachTenant } from "../../artifacts/api-server/src/middlewares/tenant";
import { requireAuth } from "../../artifacts/api-server/src/middlewares/requireAuth";

const PROJECTS = new Map<number, { id: number; organizationId: number }>([
  [1, { id: 1, organizationId: 1 }],
  [2, { id: 2, organizationId: 2 }],
]);

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", attachTenant);

  const organizationsRouter = express.Router();
  organizationsRouter.use(requireAuth);
  organizationsRouter.get("/organizations", (req, res) => {
    res.json([{ id: req.organizationId, name: "Org" }]);
  });
  app.use("/api", organizationsRouter);

  // Mirrors the `requirePermission("projects.read")` gate without importing the
  // heavy RBAC stack (already covered by rbac-* test suites).
  app.get("/api/projects", (req, res) => {
    if (!req.vetraUser) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (req.vetraUser.role !== "CEO") { res.status(403).json({ error: "Forbidden", permission: "projects.read" }); return; }
    res.json([]);
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = PROJECTS.get(Number(req.params.id));
    if (!project || project.organizationId !== req.organizationId) { res.status(404).json({ error: "Not found" }); return; }
    res.json(project);
  });

  return app;
}

describe("Onboarding access control", () => {
  beforeEach(() => {
    mocks.state.auth = { userId: null, orgId: null };
    mocks.state.user = null;
    mocks.state.resolveCalls = [];
    mocks.state.createdSessions = [];
  });

  it("returns 401 when there is no Clerk session", async () => {
    const res = await request(createApp()).get("/api/organizations");
    expect(res.status).toBe(401);
    expect(mocks.state.resolveCalls).toHaveLength(0);
  });

  it("returns 403 when the session has no active Clerk organization", async () => {
    mocks.state.auth = { userId: "user_test", orgId: null };
    const res = await request(createApp()).get("/api/organizations");
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("no organization assigned");
    // No mapping lookup, no tenant session without an orgId.
    expect(mocks.state.resolveCalls).toHaveLength(0);
    expect(mocks.state.createdSessions).toHaveLength(0);
  });

  it("returns 403 when the Clerk user is not mapped to a VETRA organization", async () => {
    mocks.state.auth = { userId: "user_test", orgId: "org_clerk" };
    mocks.state.user = null;
    const res = await request(createApp()).get("/api/organizations");
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not mapped");
    expect(mocks.state.resolveCalls).toEqual(["user_test"]);
    expect(mocks.state.createdSessions).toHaveLength(0);
  });

  it("allows a validly mapped user and binds a tenant-scoped DB session", async () => {
    mocks.state.auth = { userId: "user_test", orgId: "org_clerk" };
    mocks.state.user = { id: 7, organizationId: 42, role: "CEO", clerkUserId: "user_test" };

    const app = createApp();
    const organizations = await request(app).get("/api/organizations");
    expect(organizations.status, organizations.text).toBe(200);

    const projects = await request(app).get("/api/projects");
    expect(projects.status).toBe(200);

    expect(mocks.state.createdSessions).toContain(42);
  });

  it("blocks a mapped user without the required permission", async () => {
    mocks.state.auth = { userId: "user_test", orgId: "org_clerk" };
    mocks.state.user = { id: 8, organizationId: 42, role: "VIEWER", clerkUserId: "user_test" };

    const app = createApp();
    expect((await request(app).get("/api/organizations")).status).toBe(200);

    const projects = await request(app).get("/api/projects");
    expect(projects.status).toBe(403);
    expect(projects.body.permission).toBe("projects.read");
  });

  it("does not expose a project that belongs to another tenant", async () => {
    mocks.state.auth = { userId: "user_test", orgId: "org_clerk" };
    mocks.state.user = { id: 7, organizationId: 1, role: "CEO", clerkUserId: "user_test" };

    const res = await request(createApp()).get("/api/projects/2");
    expect(res.status).toBe(404);
  });

  it("ignores client-supplied identity headers and uses the session identity", async () => {
    mocks.state.auth = { userId: "user_real", orgId: "org_clerk" };
    mocks.state.user = { id: 7, organizationId: 1, role: "CEO", clerkUserId: "user_real" };

    const res = await request(createApp())
      .get("/api/organizations")
      .set("x-clerk-user-id", "user_attacker")
      .set("x-organization-id", "999");

    expect(res.status).toBe(200);
    expect(mocks.state.resolveCalls).toEqual(["user_real"]);
    expect(mocks.state.createdSessions).toEqual([1]);
  });
});
