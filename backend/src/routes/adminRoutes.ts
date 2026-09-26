import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/rbacMiddleware.js';
import { ROLES } from '../config/constants.js';

const router = Router();

router.use(authenticateJwt);
router.use(requireRole(ROLES.CEO, ROLES.MD, ROLES.ADMIN));

// Developer review endpoints
router.get('/developers/pending', AdminController.listPendingDevelopers);
router.post('/developers/:developerId/approve', AdminController.approveDeveloper);
router.post('/developers/:developerId/reject', AdminController.rejectDeveloper);
router.post('/developers/:developerId/suspend', AdminController.suspendDeveloper);

// Operations & Audit endpoints
router.get('/projects', AdminController.listAllProjects);
router.get('/users', AdminController.listAllUsers);
router.get('/ledger', AdminController.listFinancialLedger);
router.get('/audit-logs', AdminController.listAuditLogs);

export default router;
