import { Router } from 'express';
import { CreditController } from '../controllers/creditController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/rbacMiddleware.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Public package listing
router.get('/packages', CreditController.getPackages);

// Authenticated developer routes
router.get('/balance', authenticateJwt, CreditController.getBalance);
router.get('/ledger', authenticateJwt, CreditController.getLedger);
router.post('/purchase', authenticateJwt, CreditController.purchase);

// Executive / Admin adjustment
router.post(
  '/admin/adjust',
  authenticateJwt,
  requireRole(ROLES.CEO, ROLES.MD, ROLES.ADMIN),
  CreditController.adminAdjust
);

export default router;
