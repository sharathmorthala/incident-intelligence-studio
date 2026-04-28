import { Router, type IRouter } from "express";
import healthRouter from "./health";
import incidentsRouter from "./incidents";
import dashboardRouter from "./dashboard";
import contractsRouter from "./contracts";
import designRouter from "./design";

const router: IRouter = Router();

router.use(healthRouter);
router.use(incidentsRouter);
router.use(dashboardRouter);
router.use(contractsRouter);
router.use(designRouter);

export default router;
