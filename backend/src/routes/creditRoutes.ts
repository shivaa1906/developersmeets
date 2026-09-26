import { Router } from 'express';
import { CreditController } from '../controllers/creditController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireCreditManagement } from '../middlewares/rbacMiddleware.js';

const router = Router();

// Public package listing
router.get('/packages', CreditController.getPackages);

// Authenticated developer routes
router.get('/balance', authenticateJwt, CreditController.getBalance);
router.get('/ledger', authenticateJwt, CreditController.getLedger);
router.post('/purchase', authenticateJwt, CreditController.purchase);
router.post('/payment/create', authenticateJwt, CreditController.createOrder);
router.post('/payment/verify-client', authenticateJwt, CreditController.verifyClientPayment);

// Webhook endpoint (cryptographic verification)
router.post('/webhook', CreditController.handleWebhook);

// Executive / Admin credit management routes (Strictly CEO and ADMIN by default; MD & SUPPORT denied)
router.post('/admin/adjust', authenticateJwt, requireCreditManagement, CreditController.adminAdjust);
router.post('/admin/grant', authenticateJwt, requireCreditManagement, CreditController.grantCredits);
router.post('/admin/remove', authenticateJwt, requireCreditManagement, CreditController.removeCredits);
router.post('/admin/bulk-preview', authenticateJwt, requireCreditManagement, CreditController.previewBulkGrant);
router.post('/admin/bulk-grant', authenticateJwt, requireCreditManagement, CreditController.bulkGrant);
router.post('/admin/bulk-remove-preview', authenticateJwt, requireCreditManagement, CreditController.previewBulkRemove);
router.post('/admin/bulk-remove', authenticateJwt, requireCreditManagement, CreditController.bulkRemove);
router.get('/admin/bulk-operations', authenticateJwt, requireCreditManagement, CreditController.listBulkOperations);
router.get('/admin/bulk-operations/:operationId', authenticateJwt, requireCreditManagement, CreditController.getBulkOperation);
router.get('/admin/history', authenticateJwt, requireCreditManagement, CreditController.getCreditHistory);
router.get('/admin/accounts', authenticateJwt, requireCreditManagement, CreditController.listAccounts);
router.get('/admin/search-users', authenticateJwt, requireCreditManagement, CreditController.searchUsers);
router.get('/admin/stats', authenticateJwt, requireCreditManagement, CreditController.getCreditStats);
router.get('/admin/export', authenticateJwt, requireCreditManagement, CreditController.exportCreditTransactions);
router.get('/admin/users/:target', authenticateJwt, requireCreditManagement, CreditController.getUserCreditDetail);

export default router;
