import { Router, type Request, type Response, type NextFunction } from "express";
import { verifySvixSignature, processClerkWebhookEvent } from "../lib/webhook";
import { logger } from "../lib/logger";

const router = Router();

/**
 * VETRA-SEC-03: Clerk Webhook Endpoint
 *
 * POST /api/webhooks/clerk
 *
 * Receives Clerk webhook events, validates the Svix signature,
 * and processes user provisioning events.
 *
 * IMPORTANT: This route MUST be mounted BEFORE express.json()
 * middleware in app.ts because it needs access to the raw request body
 * for HMAC signature verification. The raw body is buffered via
 * a custom middleware applied to this route only.
 */

// Raw body capture middleware
function rawBodyCapture(req: Request, _res: Response, next: NextFunction): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    (req as Request & { rawBody: string }).rawBody = Buffer.concat(chunks).toString("utf-8");
    next();
  });
  req.on("error", (err) => next(err));
}

// Extend Request type for this route
declare module "express" {
  interface Request {
    rawBody?: string;
  }
}

router.post("/webhooks/clerk", rawBodyCapture, async (req: Request, res: Response): Promise<void> => {
  try {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      logger.error("CLERK_WEBHOOK_SECRET is not configured");
      res.status(500).json({ error: "Webhook secret not configured" });
      return;
    }

    const rawBody = (req as Request & { rawBody: string }).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: "Missing request body" });
      return;
    }

    // Verify Svix signature
    const svixHeaders = {
      "svix-id": req.headers["svix-id"] as string | undefined,
      "svix-timestamp": req.headers["svix-timestamp"] as string | undefined,
      "svix-signature": req.headers["svix-signature"] as string | undefined,
    };

    if (!verifySvixSignature(rawBody, svixHeaders, secret)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    // Parse and process the event
    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      res.status(400).json({ error: "Invalid JSON payload" });
      return;
    }

    const handled = await processClerkWebhookEvent(event as any);
    res.status(200).json({ received: true, handled });
  } catch (error) {
    logger.error({ err: error }, "Webhook processing error");
    res.status(500).json({ error: "Internal webhook processing error" });
  }
});

export default router;
