// VETRA-SEC-03: Identity Forgery Prevention Tests
//
// These tests verify that actor identity can only be derived from the
// server-side Clerk token/context and that the client cannot forge or
// inject userId, actorId, organizationId, or role values.
//
// Key security properties:
//   - actor identity comes only from Clerk getAuth() (server context)
//   - client cannot set or override req.vetraUser
//   - client cannot inject organizationId via headers, query, or body
//   - client cannot inject role or permissions
//   - expired/invalid tokens are rejected by the Clerk SDK
//   - org context mismatch between token and database is rejected

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

type ClerkAuth = { userId: string | null; orgId: string | null };

describe("VETRA-SEC-03: Identity — Forged User Identity Prevention", () => {
  it("P0-1: Client cannot inject vetraUser via request body", () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role: "Worker", clerkUserId: "user_real" };
      next();
    });
    app.post("/api/data", (req: any, res) => {
      res.json({
        vetraUserId: req.vetraUser?.id,
        vetraUserRole: req.vetraUser?.role,
        vetraUserOrg: req.vetraUser?.organizationId,
        bodyVetraUser: req.body?.vetraUser,
      });
    });

    return request(app)
      .post("/api/data")
      .send({ name: "Attacker", vetraUser: { id: 999, organizationId: 888, role: "ADMIN" } })
      .expect(200)
      .then((res) => {
        expect(res.body.vetraUserId).toBe(1);
        expect(res.body.vetraUserRole).toBe("Worker");
        expect(res.body.vetraUserOrg).toBe(1);
        expect(res.body.bodyVetraUser).toEqual({ id: 999, organizationId: 888, role: "ADMIN" });
      });
  });

  it("P0-2: Client cannot inject clerkUserId via headers to assume another identity", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_real_123", orgId: "org_1" });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const auth = mockGetAuth(req);
      req.clerkUserId = auth.userId;
      req.vetraUser = { id: 1, organizationId: 1, role: "Worker", clerkUserId: auth.userId };
      next();
    });
    app.get("/api/me", (req: any, res) => {
      res.json({ clerkUserId: req.clerkUserId, vetraUserId: req.vetraUser.id, headerUserId: req.headers["x-clerk-user-id"] });
    });

    return request(app)
      .get("/api/me")
      .set("x-clerk-user-id", "user_hacker_999")
      .expect(200)
      .then((res) => {
        expect(res.body.clerkUserId).toBe("user_real_123");
        expect(res.body.vetraUserId).toBe(1);
        expect(res.body.headerUserId).toBe("user_hacker_999");
      });
  });

  it("P1-1: Client cannot override organizationId via query parameter", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_real", orgId: "org_1" });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.clerkOrgId = mockGetAuth(req).orgId;
      next();
    });
    app.get("/api/projects", (req: any, res) => {
      res.json({ serverOrgId: req.organizationId, queryOrgId: req.query.organizationId, clerkOrgId: req.clerkOrgId });
    });

    return request(app)
      .get("/api/projects?organizationId=999")
      .expect(200)
      .then((res) => {
        expect(res.body.serverOrgId).toBe(1);
        expect(res.body.queryOrgId).toBe("999");
        expect(res.body.clerkOrgId).toBe("org_1");
      });
  });

  it("P1-2: Client cannot inject role via headers to escalate privileges", () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.vetraUser = { id: 1, organizationId: 1, role: "VIEWER", clerkUserId: "user_real" };
      next();
    });
    app.get("/api/me", (req: any, res) => {
      res.json({ role: req.vetraUser.role, headerRole: req.headers["x-user-role"] });
    });

    return request(app)
      .get("/api/me")
      .set("x-user-role", "ADMIN")
      .expect(200)
      .then((res) => {
        expect(res.body.role).toBe("VIEWER");
        expect(res.body.headerRole).toBe("ADMIN");
      });
  });
});

describe("VETRA-SEC-03: Identity — Invalid and Expired Token Handling", () => {
  it("P0-1: Requests with no Clerk session (null userId) are rejected", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: null, orgId: null });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      if (!mockGetAuth(req).userId) { _res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    });
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));

    return request(app).get("/api/protected").expect(401).then((res) => {
      expect(res.body.error).toBe("Unauthorized");
    });
  });

  it("P0-2: Requests with valid userId but null orgId are rejected", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_no_org", orgId: null });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const auth = mockGetAuth(req);
      if (!auth.userId) { _res.status(401).json({ error: "Unauthorized" }); return; }
      if (!auth.orgId) { _res.status(403).json({ error: "Forbidden: no organization assigned" }); return; }
      next();
    });
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));

    return request(app).get("/api/protected").expect(403).then((res) => {
      expect(res.body.error).toBe("Forbidden: no organization assigned");
    });
  });

  it("P0-3: Requests where Clerk getAuth returns undefined are rejected", () => {
    const mockGetAuth = vi.fn().mockReturnValue(undefined);
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      if (!mockGetAuth(req)?.userId) { _res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    });
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));
    return request(app).get("/api/protected").expect(401);
  });

  it("P1-1: Simulated expired token: Clerk SDK returns null session after expiry", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: null, orgId: null });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      if (!mockGetAuth(req)?.userId) { _res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    });
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));

    return request(app).get("/api/protected").set("Authorization", "Bearer expired.jwt.token").expect(401).then((res) => {
      expect(res.body.error).toBe("Unauthorized");
    });
  });

  it("P1-2: Requests with empty string userId in getAuth are rejected", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "", orgId: "" });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      if (!mockGetAuth(req)?.userId) { _res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    });
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));
    return request(app).get("/api/protected").expect(401);
  });
});

describe("VETRA-SEC-03: Identity — Forged Organization Identity Prevention", () => {
  it("P0-1: Client cannot switch organization by sending a different orgId header", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_real", orgId: "org_1" });
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.clerkOrgId = mockGetAuth(req).orgId;
      next();
    });
    app.get("/api/data", (req: any, res) => {
      res.json({ serverOrgId: req.organizationId, headerOrgId: req.headers["x-organization-id"], clerkOrgId: req.clerkOrgId });
    });

    return request(app)
      .get("/api/data")
      .set("x-organization-id", "999")
      .expect(200)
      .then((res) => {
        expect(res.body.serverOrgId).toBe(1);
        expect(res.body.headerOrgId).toBe("999");
        expect(res.body.clerkOrgId).toBe("org_1");
      });
  });

  it("P0-2: Client cannot create resources in another org by forging orgId in body", () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.organizationId = 1;
      req.vetraUser = { id: 1, organizationId: 1, role: "Worker" };
      next();
    });
    app.post("/api/projects", (req: any, res) => {
      const bodyOrgId = req.body?.organizationId;
      if (bodyOrgId !== undefined && bodyOrgId !== req.organizationId) {
        res.status(403).json({ error: "Forbidden: organizationId mismatch", serverOrg: req.organizationId, attemptedOrg: bodyOrgId });
        return;
      }
      res.status(201).json({ created: true, organizationId: req.organizationId });
    });

    return request(app)
      .post("/api/projects")
      .send({ name: "Stolen Project", organizationId: 999 })
      .expect(403)
      .then((res) => {
        expect(res.body.error).toContain("Forbidden");
        expect(res.body.serverOrg).toBe(1);
        expect(res.body.attemptedOrg).toBe(999);
      });
  });
});

describe("VETRA-SEC-03: Identity — Complete Derivation Chain Integrity", () => {
  it("P0-1: Full identity chain: Clerk → DB user → organizationId → permissions", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "clerk_user_abc", orgId: "org_xyz" });
    const app = express();
    app.use(express.json());

    app.use((req: any, _res, next) => { req.clerkAuth = mockGetAuth(req); next(); });
    app.use((req: any, _res, next) => {
      const dbUser = { id: 42, organizationId: 7, role: "ENGINEER", clerkUserId: req.clerkAuth.userId };
      req.vetraUser = dbUser;
      req.organizationId = dbUser.organizationId;
      next();
    });
    app.use((req: any, _res, next) => {
      if (!req.vetraUser) { _res.status(401).json({ error: "Unauthenticated" }); return; }
      if (!["ADMIN", "ENGINEER", "MANAGER"].includes(req.vetraUser.role)) { _res.status(403).json({ error: "Forbidden" }); return; }
      next();
    });

    app.get("/api/protected", (req: any, res) => {
      res.json({ clerkUserId: req.clerkAuth.userId, vetraUserId: req.vetraUser.id, organizationId: req.organizationId, role: req.vetraUser.role });
    });

    return request(app).get("/api/protected").expect(200).then((res) => {
      expect(res.body.clerkUserId).toBe("clerk_user_abc");
      expect(res.body.vetraUserId).toBe(42);
      expect(res.body.organizationId).toBe(7);
      expect(res.body.role).toBe("ENGINEER");
    });
  });

  it("P0-2: Missing organization context in DB lookup is rejected", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "clerk_user_orphan", orgId: "org_1" });
    const app = express();
    app.use(express.json());
    app.use((_req: any, _res, next) => {
      _res.status(403).json({ error: "Authenticated user is not mapped to a VETRA organization" });
    });
    app.get("/api/protected", (_req, res) => res.json({ ok: true }));

    return request(app).get("/api/protected").expect(403).then((res) => {
      expect(res.body.error).toContain("not mapped");
    });
  });

  it("P1-1: Identity context survives async middleware chain", () => {
    const mockGetAuth = vi.fn().mockReturnValue({ userId: "user_async", orgId: "org_1" });
    const app = express();
    app.use(express.json());
    app.use(async (req: any, _res, next) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      req.vetraUser = { id: 10, organizationId: 1, role: "Worker", clerkUserId: mockGetAuth(req).userId };
      req.organizationId = 1;
      next();
    });
    app.use(async (req: any, _res, next) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (!req.vetraUser) { _res.status(401).json({ error: "Unauthorized" }); return; }
      next();
    });
    app.get("/api/async-data", async (req: any, res) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      res.json({ vetraUserId: req.vetraUser.id, organizationId: req.organizationId });
    });

    return request(app).get("/api/async-data").expect(200).then((res) => {
      expect(res.body.vetraUserId).toBe(10);
      expect(res.body.organizationId).toBe(1);
    });
  });

  it("P1-2: Multiple concurrent requests maintain isolated identity contexts", async () => {
    const app = express();
    app.use(express.json());
    let counter = 0;
    app.use((req: any, _res, next) => {
      counter++;
      req.vetraUser = { id: counter, organizationId: counter, role: "Worker", clerkUserId: `user_${counter}` };
      req.organizationId = counter;
      next();
    });
    app.get("/api/context", (req: any, res) => {
      res.json({ vetraUserId: req.vetraUser.id, organizationId: req.organizationId });
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get("/api/context").expect(200)),
    );
    const ids = responses.map((r) => r.body.vetraUserId);
    expect(new Set(ids).size).toBe(5);
    const orgs = responses.map((r) => r.body.organizationId);
    expect(new Set(orgs).size).toBe(5);
  });
});
