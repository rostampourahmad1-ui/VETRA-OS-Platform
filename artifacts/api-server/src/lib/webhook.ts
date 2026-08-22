/**
 * VETRA-SEC-03: Clerk Webhook Service
 *
 * Implements Svix webhook signature verification and
 * atomic user provisioning for Clerk events.
 *
 * Security:
 * - HMAC-SHA256 signature verification using CLERK_WEBHOOK_SECRET
 * - Atomic user upsert/deactivation with tenant assignment
 * - Rejects events without valid organizationId mapping
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { db, usersTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "./audit";
import { logger } from "./logger";

// ─── Svix / Clerk Webhook Signature Verification ───────────────────────────

const SIGNING_SECRET_PREFIX = "whsec_";

/**
 * Extracts the HMAC key bytes from a Svix-compatible signing secret.
 * Svix secrets are formatted as: whsec_<base64-encoded-key>
 * The base64 portion is decoded to raw bytes for HMAC-SHA256.
 */
function getSigningKey(secret: string): Buffer {
  if (!secret) {
    throw new Error("CLERK_WEBHOOK_SECRET is not configured");
  }
  if (secret.startsWith(SIGNING_SECRET_PREFIX)) {
    return Buffer.from(secret.slice(SIGNING_SECRET_PREFIX.length), "base64");
  }
  // Fallback: treat the entire secret as the key
  return Buffer.from(secret);
}

/**
 * Verifies the Svix webhook signature.
 *
 * The Svix signature scheme:
 *   signed_content = "{svix-id}.{svix-timestamp}.{rawBody}"
 *   expected = HMAC-SHA256(signing_key, signed_content)
 *
 * Each signature header may contain multiple space-delimited signatures
 * (v1,v1a). At least one must match the computed HMAC.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: {
    "svix-id": string | undefined;
    "svix-timestamp": string | undefined;
    "svix-signature": string | undefined;
  },
  secret: string,
): boolean {
  const svixId = headers["svix-id"];
  const svixTimestamp = headers["svix-timestamp"];
  const svixSignature = headers["svix-signature"];

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn({ svixId: !!svixId, svixTimestamp: !!svixTimestamp, svixSignature: !!svixSignature }, "Webhook verification failed: missing Svix headers");
    return false;
  }

  // Tolerance: reject timestamps older than 5 minutes to prevent replay
  const timestamp = parseInt(svixTimestamp, 10);
  if (isNaN(timestamp)) {
    logger.warn({ svixTimestamp }, "Webhook verification failed: invalid timestamp");
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    logger.warn({ svixTimestamp, now, diff: Math.abs(now - timestamp) }, "Webhook verification failed: timestamp outside tolerance window");
    return false;
  }

  const signingKey = getSigningKey(secret);
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSignature = createHmac("sha256", signingKey)
    .update(signedContent)
    .digest("base64");

  // Split on spaces to handle v1,v1a multi-signature format
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig, "base64");
      const expectedBuf = Buffer.from(expectedSignature, "base64");
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    } catch {
      // Continue to next signature
    }
  }

  logger.warn("Webhook verification failed: signature mismatch");
  return false;
}

// ─── Clerk Event Types ─────────────────────────────────────────────────────

interface ClerkUserEvent {
  data: {
    id: string; // Clerk user ID
    email_addresses?: Array<{ email_address: string }>;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    public_metadata?: Record<string, unknown>;
    private_metadata?: Record<string, unknown>;
    created_at?: number;
    updated_at?: number;
  };
  type: string;
}

export type ClerkEventType =
  | "user.created"
  | "user.updated"
  | "user.deleted";

// ─── User Provisioning ─────────────────────────────────────────────────────

/**
 * Derives the organizationId from Clerk event metadata.
 *
 * Priority order:
 * 1. public_metadata.organizationId - explicitly set by the provisioning caller
 * 2. private_metadata.organizationId - fallback for internal flows
 *
 * Returns null if no organizationId is found - the event is rejected.
 */
function extractOrganizationId(evt: ClerkUserEvent): number | null {
  const pub = evt.data.public_metadata?.organizationId;
  const priv = evt.data.private_metadata?.organizationId;

  const raw = pub ?? priv;
  if (raw === undefined || raw === null) return null;

  const parsed = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Extracts the primary email from Clerk user data.
 */
function extractEmail(evt: ClerkUserEvent): string | null {
  const emails = evt.data.email_addresses;
  if (!emails || emails.length === 0) return null;
  return emails[0].email_address || null;
}

/**
 * Derives avatar initials from user name.
 */
function deriveInitials(evt: ClerkUserEvent): string {
  const first = evt.data.first_name || "";
  const last = evt.data.last_name || "";
  const name = [first, last].filter(Boolean).join(" ") || evt.data.username || "";
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Handles user.created events.
 *
 * Creates a new user row atomically linked to the organization
 * specified in metadata. Rejects if no organizationId is present.
 */
async function handleUserCreated(evt: ClerkUserEvent): Promise<void> {
  const organizationId = extractOrganizationId(evt);
  if (organizationId === null) {
    logger.warn({ clerkUserId: evt.data.id }, "user.created rejected: missing organizationId in metadata");
    return;
  }

  // Verify the organization exists
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, organizationId));

  if (!org) {
    logger.warn({ clerkUserId: evt.data.id, organizationId }, "user.created rejected: organization not found");
    return;
  }

  const email = extractEmail(evt);
  const name = [evt.data.first_name, evt.data.last_name]
    .filter(Boolean)
    .join(" ") || evt.data.username || email || "Unknown User";

  const initials = deriveInitials(evt);

  // Check if user already exists (idempotent)
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, evt.data.id));

  if (existing) {
    logger.info({ clerkUserId: evt.data.id, vetraUserId: existing.id }, "user.created skipped: user already provisioned");
    return;
  }

  await db.insert(usersTable).values({
    name,
    email: email || `${evt.data.id}@clerk.user`,
    clerkUserId: evt.data.id,
    role: "Worker",
    organizationId,
    avatarInitials: initials,
    active: true,
  });

  logger.info({ clerkUserId: evt.data.id, name, organizationId }, "user.created: user provisioned successfully");

  // VETRA-SEC-06: Audit
  writeAuditLog({
    action: "user.created",
    resource: "user",
    resourceId: evt.data.id,
    newValues: { name, email, role: "Worker", organizationId },
    organizationId,
    actorClerkId: evt.data.id,
    metadata: { source: "clerk_webhook" },
  });
}

/**
 * Handles user.updated events.
 *
 * Updates name, email, and active status. Does NOT change organizationId
 * (tenant reassignment requires a separate admin operation).
 */
async function handleUserUpdated(evt: ClerkUserEvent): Promise<void> {
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, organizationId: usersTable.organizationId })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, evt.data.id));

  if (!user) {
    logger.warn({ clerkUserId: evt.data.id }, "user.updated skipped: user not found in VETRA");
    return;
  }

  const updates: Record<string, unknown> = {};
  const name = [evt.data.first_name, evt.data.last_name]
    .filter(Boolean)
    .join(" ") || undefined;
  if (name) updates.name = name;

  const email = extractEmail(evt);
  if (email) updates.email = email;

  const initials = deriveInitials(evt);
  if (initials) updates.avatarInitials = initials;

  if (Object.keys(updates).length === 0) return;

  await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.clerkUserId, evt.data.id));

  logger.info({ clerkUserId: evt.data.id, updates }, "user.updated: user synced");

  // VETRA-SEC-06: Audit
  writeAuditLog({
    action: "user.updated",
    resource: "user",
    resourceId: evt.data.id,
    oldValues: { name: user.name, email: user.email },
    newValues: updates,
    organizationId: user.organizationId,
    metadata: { source: "clerk_webhook" },
  });
}

/**
 * Handles user.deleted events.
 *
 * Soft-deletes the user by setting active=false.
 * Never hard-deletes to preserve audit trail.
 */
async function handleUserDeleted(evt: ClerkUserEvent): Promise<void> {
  const [user] = await db
    .select({ id: usersTable.id, active: usersTable.active, organizationId: usersTable.organizationId })
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, evt.data.id));

  if (!user) {
    logger.warn({ clerkUserId: evt.data.id }, "user.deleted skipped: user not found in VETRA");
    return;
  }

  if (!user.active) {
    logger.info({ clerkUserId: evt.data.id }, "user.deleted skipped: already inactive");
    return;
  }

  await db
    .update(usersTable)
    .set({ active: false })
    .where(eq(usersTable.clerkUserId, evt.data.id));

  logger.info({ clerkUserId: evt.data.id, vetraUserId: user.id }, "user.deleted: user deactivated");

  // VETRA-SEC-06: Audit
  writeAuditLog({
    action: "user.deleted",
    resource: "user",
    resourceId: evt.data.id,
    oldValues: { active: true },
    newValues: { active: false },
    organizationId: user.organizationId,
    metadata: { source: "clerk_webhook", vetraUserId: user.id },
  });
}

// ─── Event Router ──────────────────────────────────────────────────────────

const EVENT_HANDLERS: Record<string, (evt: ClerkUserEvent) => Promise<void>> = {
  "user.created": handleUserCreated,
  "user.updated": handleUserUpdated,
  "user.deleted": handleUserDeleted,
};

/**
 * Processes a verified Clerk webhook event.
 *
 * @param evt - Parsed Clerk event payload
 * @returns true if the event was handled, false if unknown
 */
export async function processClerkWebhookEvent(evt: ClerkUserEvent): Promise<boolean> {
  const handler = EVENT_HANDLERS[evt.type];
  if (!handler) {
    logger.info({ type: evt.type }, "Unhandled Clerk event type");
    return false;
  }

  await handler(evt);
  return true;
}

// ─── Re-export for convenience ─────────────────────────────────────────────

export { extractOrganizationId, extractEmail, deriveInitials };
