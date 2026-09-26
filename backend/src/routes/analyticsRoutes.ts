import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/rbacMiddleware.js';
import { ROLES } from '../config/constants.js';

const router = Router();

router.use(authenticateJwt);

router.get(
  '/platform',
  requireRole(ROLES.CEO, ROLES.MD, ROLES.ADMIN),
  AnalyticsController.getPlatformOverview
);

router.get(
  '/developer',
  requireRole(ROLES.DEVELOPER, ROLES.CEO, ROLES.MD, ROLES.ADMIN),
  AnalyticsController.getDeveloperMetrics
);

export default router;
