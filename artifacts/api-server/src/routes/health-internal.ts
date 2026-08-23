import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getMetricsText } from "../lib/metrics";

const router: IRouter = Router();

/**
 * VETRA-INFRA-04: Authenticated Health & Diagnostics
 *
 * These endpoints are mounted inside the auth-protected router so they
 * require a valid Clerk session.  The unauthenticated /healthz liveness
 * probe remains in the public health route.
 */

// Readiness probe — checks database connectivity
router.get("/healthz/ready", async (_req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
    } finally {
      client.release();
    }
    res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch (error) {
    logger.error({ err: error }, "Readiness check failed");
    res.status(503).json({ status: "error", database: "disconnected", timestamp: new Date().toISOString() });
  }
});

// Deep health check — includes DB, memory, uptime, and version
router.get("/healthz/deep", async (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  let dbStatus = "unknown";
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }
  res.json({
    status: dbStatus === "connected" ? "ok" : "degraded",
    database: dbStatus,
    memory: { rss: mem.rss, heapTotal: mem.heapTotal, heapUsed: mem.heapUsed, external: mem.external },
    uptime: Math.floor(process.uptime()),
    version: process.env.SERVICE_VERSION ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
});

// Metrics endpoint — returns Prometheus-compatible metrics, gated by API key
router.get("/metrics", (req: Request, res: Response) => {
  const expectedKey = process.env.MONITORING_API_KEY;
  if (!expectedKey) {
    res.status(403).json({ error: "Metrics endpoint is not configured" });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.slice(7) !== expectedKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const metricsText = getMetricsText();
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200).send(metricsText);
});

export default router;
