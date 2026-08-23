import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import type { Request, Response, NextFunction } from "express";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import webhookRouter from "./routes/webhook";
import { logger } from "./lib/logger";
import { runWithCorrelationId, generateCorrelationId } from "./lib/logger";
import { metricsMiddleware, startSystemMetricsUpdater } from "./lib/metrics";

const app: Express = express();
const allowedCorsOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

// ─── Correlation ID Middleware ─────────────────────────────────────────────
// Assigns a unique correlation ID to every request and binds it to the
// async context so all descendant logs include the correlation ID.
app.use((req: Request, _res: Response, next: NextFunction) => {
  const correlationId =
    (req.headers["x-correlation-id"] as string) || generateCorrelationId();
  (req as any).correlationId = correlationId;
  runWithCorrelationId(correlationId, next);
});

// ─── Metrics Middleware ───────────────────────────────────────────────────
// Collects HTTP request metrics (count, duration, active requests).
app.use(metricsMiddleware);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Same-origin and non-browser calls do not send an Origin header.
      if (!origin || allowedCorsOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);

// Webhook routes must be mounted before express.json() for raw body access
app.use("/api", webhookRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => {
    const proxyHost = getClerkProxyHost(req);
    return {
      publishableKey: proxyHost
        ? publishableKeyFromHost(proxyHost, process.env.CLERK_PUBLISHABLE_KEY)
        : process.env.CLERK_PUBLISHABLE_KEY,
    };
  }),
);

// ─── Start Periodic System Metrics ────────────────────────────────────────
startSystemMetricsUpdater();

app.use("/api", router);

export default app;
