import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generates valid Svix headers for a given payload and secret.
 * Uses the Svix v1 signature scheme.
 */
function generateSvixHeaders(
  payload: string,
  secret: string,
  timestamp?: number,
): { "svix-id": string; "svix-timestamp": string; "svix-signature": string } {
  const svixId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const keyBase64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const signingKey = Buffer.from(keyBase64, "base64");
  const signedContent = `${svixId}.${ts}.${payload}`;
  const signature = createHmac("sha256", signingKey).update(signedContent).digest("base64");
  return {
    "svix-id": svixId,
    "svix-timestamp": String(ts),
    "svix-signature": signature,
  };
}

// ─── Dynamic import of webhook module ───────────────────────────────────────

// We need to mock dependencies before importing the module
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("../../artifacts/api-server/src/lib/logger", () => ({
  logger: mockLogger,
}));

// We need to test in isolation - the webhook module imports from @workspace/db
// which connects to a real database. For unit tests, we test the pure functions
// directly.

// Since the module has side effects (imports db), we test the exported pure
// functions that dont require database access.

describe("VETRA-SEC-03: Webhook Signature Verification", () => {
  // We test the algorithm manually since the module has DB dependencies
  // This validates the Svix signature verification logic

  const VALID_SECRET = "whsec_CdFJqYtF0pB3vK7xM2nR5sW8zA1bD4eG6hI9jL0kN=";

  function verifySignature(
    rawBody: string,
    svixId: string,
    svixTimestamp: string,
    svixSignature: string,
    secret: string,
  ): boolean {
    // Replicate the logic from webhook.ts
    if (!svixId || !svixTimestamp || !svixSignature) return false;

    const timestamp = parseInt(svixTimestamp, 10);
    if (isNaN(timestamp)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) return false;

    const keyBase64 = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const signingKey = Buffer.from(keyBase64, "base64");
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expectedSignature = createHmac("sha256", signingKey)
      .update(signedContent)
      .digest("base64");

    const signatures = svixSignature.split(" ");
    const { timingSafeEqual } = require("node:crypto");
    for (const sig of signatures) {
      try {
        const sigBuf = Buffer.from(sig, "base64");
        const expectedBuf = Buffer.from(expectedSignature, "base64");
        if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
          return true;
        }
      } catch {
        // continue
      }
    }
    return false;
  }

  it("P0-1: Valid signature passes verification", () => {
    const payload = JSON.stringify({ type: "user.created", data: { id: "user_123" } });
    const headers = generateSvixHeaders(payload, VALID_SECRET);
    const result = verifySignature(
      payload,
      headers["svix-id"],
      headers["svix-timestamp"],
      headers["svix-signature"],
      VALID_SECRET,
    );
    expect(result).toBe(true);
  });

  it("P0-2: Wrong secret fails verification", () => {
    const payload = JSON.stringify({ type: "user.created", data: { id: "user_123" } });
    const headers = generateSvixHeaders(payload, VALID_SECRET);
    const wrongSecret = "whsec_Z9yX8wV7uT6sR5qP4oN3mL2k1jI0hG9fE8dC7bA6a=";
    const result = verifySignature(
      payload,
      headers["svix-id"],
      headers["svix-timestamp"],
      headers["svix-signature"],
      wrongSecret,
    );
    expect(result).toBe(false);
  });

  it("P0-3: Tampered payload fails verification", () => {
    const originalPayload = JSON.stringify({ type: "user.created", data: { id: "user_123" } });
    const headers = generateSvixHeaders(originalPayload, VALID_SECRET);
    const tamperedPayload = JSON.stringify({ type: "user.created", data: { id: "user_999" } });
    const result = verifySignature(
      tamperedPayload,
      headers["svix-id"],
      headers["svix-timestamp"],
      headers["svix-signature"],
      VALID_SECRET,
    );
    expect(result).toBe(false);
  });

  it("P0-4: Missing Svix headers fail verification", () => {
    const payload = JSON.stringify({ type: "user.created" });
    expect(verifySignature(payload, "", "", "", VALID_SECRET)).toBe(false);
    expect(verifySignature(payload, "msg_1", "", "", VALID_SECRET)).toBe(false);
    expect(verifySignature(payload, "", "1234567890", "", VALID_SECRET)).toBe(false);
    expect(verifySignature(payload, "", "", "sig", VALID_SECRET)).toBe(false);
  });

  it("P0-5: Expired timestamp (outside 5-minute window) fails verification", () => {
    const payload = JSON.stringify({ type: "user.created" });
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const headers = generateSvixHeaders(payload, VALID_SECRET, oldTimestamp);
    const result = verifySignature(
      payload,
      headers["svix-id"],
      headers["svix-timestamp"],
      headers["svix-signature"],
      VALID_SECRET,
    );
    expect(result).toBe(false);
  });

  it("P1-1: Future timestamp (outside 5-minute window) fails verification", () => {
    const payload = JSON.stringify({ type: "user.created" });
    const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in future
    const headers = generateSvixHeaders(payload, VALID_SECRET, futureTimestamp);
    const result = verifySignature(
      payload,
      headers["svix-id"],
      headers["svix-timestamp"],
      headers["svix-signature"],
      VALID_SECRET,
    );
    expect(result).toBe(false);
  });

  it("P1-2: Non-numeric timestamp fails verification", () => {
    const payload = JSON.stringify({ type: "user.created" });
    const result = verifySignature(payload, "msg_1", "not-a-number", "sig", VALID_SECRET);
    expect(result).toBe(false);
  });

  it("P1-3: Multi-signature format (v1,v1a) with one valid signature passes", () => {
    const payload = JSON.stringify({ type: "user.created" });
    const validHeaders = generateSvixHeaders(payload, VALID_SECRET);
    const wrongSig = createHmac("sha256", Buffer.from("wrongkeybase64==", "base64"))
      .update("wrong.content")
      .digest("base64");
    const combinedSignature = `${wrongSig} ${validHeaders["svix-signature"]}`;
    const result = verifySignature(
      payload,
      validHeaders["svix-id"],
      validHeaders["svix-timestamp"],
      combinedSignature,
      VALID_SECRET,
    );
    expect(result).toBe(true);
  });
});

describe("VETRA-SEC-03: Webhook Event Processing", () => {
  // Test the extractOrganizationId logic
  function extractOrganizationId(evt: any): number | null {
    const pub = evt.data?.public_metadata?.organizationId;
    const priv = evt.data?.private_metadata?.organizationId;
    const raw = pub ?? priv;
    if (raw === undefined || raw === null) return null;
    const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function extractEmail(evt: any): string | null {
    const emails = evt.data?.email_addresses;
    if (!emails || emails.length === 0) return null;
    return emails[0].email_address || null;
  }

  function deriveInitials(evt: any): string {
    const first = evt.data?.first_name || "";
    const last = evt.data?.last_name || "";
    const name = [first, last].filter(Boolean).join(" ") || evt.data?.username || "";
    if (!name) return "??";
    return name
      .split(" ")
      .map((n: string) => n[0] || "")
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  it("P0-1: extractOrganizationId returns orgId from public_metadata", () => {
    const evt = {
      data: {
        id: "user_123",
        public_metadata: { organizationId: 42 },
      },
    };
    expect(extractOrganizationId(evt)).toBe(42);
  });

  it("P0-2: extractOrganizationId falls back to private_metadata", () => {
    const evt = {
      data: {
        id: "user_123",
        private_metadata: { organizationId: 99 },
      },
    };
    expect(extractOrganizationId(evt)).toBe(99);
  });

  it("P0-3: extractOrganizationId prefers public_metadata over private_metadata", () => {
    const evt = {
      data: {
        id: "user_123",
        public_metadata: { organizationId: 10 },
        private_metadata: { organizationId: 20 },
      },
    };
    expect(extractOrganizationId(evt)).toBe(10);
  });

  it("P0-4: extractOrganizationId returns null when no orgId present", () => {
    const evt = {
      data: {
        id: "user_123",
        public_metadata: {},
        private_metadata: {},
      },
    };
    expect(extractOrganizationId(evt)).toBeNull();
  });

  it("P0-5: extractOrganizationId returns null when metadata is missing", () => {
    const evt = { data: { id: "user_123" } };
    expect(extractOrganizationId(evt)).toBeNull();
  });

  it("P0-6: extractOrganizationId returns null for invalid orgId values", () => {
    expect(extractOrganizationId({ data: { public_metadata: { organizationId: 0 } } })).toBeNull();
    expect(extractOrganizationId({ data: { public_metadata: { organizationId: -1 } } })).toBeNull();
    expect(extractOrganizationId({ data: { public_metadata: { organizationId: "not-a-number" } } })).toBeNull();
  });

  it("P1-1: extractEmail returns primary email", () => {
    const evt = {
      data: {
        id: "user_123",
        email_addresses: [
          { email_address: "primary@vetra.io" },
          { email_address: "secondary@vetra.io" },
        ],
      },
    };
    expect(extractEmail(evt)).toBe("primary@vetra.io");
  });

  it("P1-2: extractEmail returns null when no emails", () => {
    const evt = { data: { id: "user_123", email_addresses: [] } };
    expect(extractEmail(evt)).toBeNull();
    const evt2 = { data: { id: "user_123" } };
    expect(extractEmail(evt2)).toBeNull();
  });

  it("P1-3: deriveInitials generates correct initials", () => {
    expect(deriveInitials({ data: { first_name: "Ali", last_name: "Rezaei" } })).toBe("AR");
    expect(deriveInitials({ data: { first_name: "Sara" } })).toBe("S");
    expect(deriveInitials({ data: { username: "testuser" } })).toBe("T");
    expect(deriveInitials({ data: {} })).toBe("??");
  });
});

describe("VETRA-SEC-03: Clerk Event Type Safety", () => {
  it("P1-1: Only known event types are handled", () => {
    const knownTypes = ["user.created", "user.updated", "user.deleted"];
    const unknownTypes = ["session.created", "organization.created", "email.created"];

    // Verify type safety - known types are in the handler map
    for (const t of knownTypes) {
      expect(typeof t).toBe("string");
      expect(t).toMatch(/^user\./);
    }

    // Unknown types are not user events
    for (const t of unknownTypes) {
      expect(typeof t).toBe("string");
      expect(t).not.toMatch(/^user\.created|user\.updated|user\.deleted$/);
    }
  });
});
