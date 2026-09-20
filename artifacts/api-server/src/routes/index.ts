import { Router, type IRouter } from "express";
import healthRouter from "./health";
import healthInternalRouter from "./health-internal";
import dashboardRouter from "./dashboard";
import projectsRouter from "./projects";
import tasksRouter from "./tasks";
import usersRouter from "./users";
import notificationsRouter from "./notifications";
import organizationsRouter from "./organizations";
import searchRouter from "./search";
import phase2Router from "./phase2";
import planningRouter from "./planning";
import workflowsRouter from "./workflows";
import aiRouter from "./ai";
import { attachTenant } from "../middlewares/tenant";
import schedulingRouter from "./scheduling";

const router: IRouter = Router();

router.use(healthRouter);
router.use(attachTenant);
// VETRA-INFRA-04: Authenticated health diagnostics and metrics endpoint.
// Mounted after attachTenant to ensure auth/tenant context is available.
// Contains:
//   GET /healthz/ready  — Readiness probe (DB connectivity check)
//   GET /healthz/deep   — Deep health (DB, memory, uptime, version)
//   GET /metrics        — Prometheus-compatible metrics (API-key gated)
//
// The unauthenticated liveness probe (GET /healthz) lives in healthRouter
// above and is intentionally kept before auth for load balancer probing.
router.use(healthInternalRouter);
router.use(dashboardRouter);
router.use(projectsRouter);
router.use(tasksRouter);
router.use(usersRouter);
router.use(notificationsRouter);
router.use(organizationsRouter);
router.use(searchRouter);
router.use(phase2Router);
router.use(planningRouter);
router.use(workflowsRouter);
router.use(aiRouter);
router.use(schedulingRouter);

export default router;
