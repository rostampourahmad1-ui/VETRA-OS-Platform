import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import projectsRouter from "./projects";
import tasksRouter from "./tasks";
import documentsRouter from "./documents";
import contractsRouter from "./contracts";
import dailyReportsRouter from "./daily-reports";
import meetingsRouter from "./meetings";
import usersRouter from "./users";
import equipmentRouter from "./equipment";
import inventoryRouter from "./inventory";
import procurementRouter from "./procurement";
import notificationsRouter from "./notifications";
import organizationsRouter from "./organizations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(projectsRouter);
router.use(tasksRouter);
router.use(documentsRouter);
router.use(contractsRouter);
router.use(dailyReportsRouter);
router.use(meetingsRouter);
router.use(usersRouter);
router.use(equipmentRouter);
router.use(inventoryRouter);
router.use(procurementRouter);
router.use(notificationsRouter);
router.use(organizationsRouter);

export default router;
