import { Router } from 'express';
import { AdminController } from '../controllers/adminController.js';
import { SupportController } from '../controllers/supportController.js';
import { CreditController } from '../controllers/creditController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRole, requireCreditManagement } from '../middlewares/rbacMiddleware.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Base administrative authorization guard:
// Strictly permits CEO, MD, and ADMIN. Developers and Clients are denied (403 Forbidden).
router.use(authenticateJwt);
router.use(requireRole(ROLES.CEO, ROLES.MD, ROLES.ADMIN));

// Developer administration
router.get('/developers/pending', AdminController.listPendingDevelopers);
router.post('/developers/:developerId/approve', AdminController.approveDeveloper);
router.post('/developers/:developerId/reject', AdminController.rejectDeveloper);
router.post('/developers/:developerId/suspend', AdminController.suspendDeveloper);
router.post('/developers/:developerId/verify', AdminController.verifyDeveloper);
router.get('/developers/:developerId/wallet', AdminController.getDeveloperWallet);

// Project administration
router.get('/projects', AdminController.listAllProjects);
router.post('/projects/:projectId/review', AdminController.reviewProject);
router.post('/projects/:projectId/approve', AdminController.approveProject);
router.patch('/projects/:projectId', AdminController.editProject);
router.post('/projects/:projectId/cancel', AdminController.cancelProject);
router.post('/projects/:projectId/reopen', AdminController.reopenProject);
router.get('/projects/:projectId/claims', AdminController.getProjectClaims);
router.get('/projects/:projectId/proposals', AdminController.getProjectProposals);
router.get('/projects/:projectId/completion', AdminController.getProjectCompletion);

// Client administration
router.get('/clients', AdminController.listClients);

// Claims monitoring
router.get('/claims', AdminController.listAllClaims);

// Users & financial ledger
router.get('/users', AdminController.listAllUsers);
router.post('/users/:userId/suspend', AdminController.suspendUser);
router.post('/users/:userId/unsuspend', AdminController.unsuspendUser);
router.post('/users/:userId/disable', AdminController.disableUser);
router.get('/ledger', AdminController.listFinancialLedger);

// Payments (strictly non-secret exposing)
router.get('/payments', AdminController.listPayments);

// Support administration
router.get('/support/tickets', AdminController.listSupportTickets);
router.get('/support/staff', SupportController.listStaff);
router.post('/support/staff', SupportController.addStaff);
router.post('/support/staff/invite', SupportController.inviteStaff);
router.patch('/support/staff/:staffId/status', SupportController.updateStaffStatus);
router.patch('/support/staff/:staffId/permissions', SupportController.updateStaffPermissions);
router.post('/support/staff/:staffId/suspend', SupportController.suspendStaff);
router.post('/support/staff/:staffId/remove', SupportController.removeStaffAccess);
router.post('/support/staff/:staffId/reassign-tickets', SupportController.reassignStaffTickets);
router.get('/support/teams', SupportController.listTeams);
router.post('/support/teams', SupportController.createTeam);
router.post('/support/teams/:teamId/members', SupportController.addTeamMember);
router.delete('/support/teams/:teamId/members/:staffId', SupportController.removeTeamMember);

// Analytics
router.get('/analytics', AdminController.getAnalytics);

// Audit logs
router.get('/audit-logs', AdminController.listAuditLogs);

// System Settings & Financial Manual Adjustments (CEO ONLY - Prohibited to MD)
router.get('/settings', AdminController.getSettings);
router.patch('/settings', requireRole(ROLES.CEO), AdminController.updateSettings);

// Credit Management (CEO & ADMIN ONLY - Prohibited to MD and SUPPORT)
router.post('/credits/adjust', requireCreditManagement, AdminController.adjustCredits);
router.post('/credits/grant', requireCreditManagement, CreditController.grantCredits);
router.post('/credits/remove', requireCreditManagement, CreditController.removeCredits);
router.post('/credits/bulk-grant', requireCreditManagement, CreditController.bulkGrant);
router.post('/credits/bulk-remove', requireCreditManagement, CreditController.bulkRemove);
router.get('/credits/history', requireCreditManagement, CreditController.getCreditHistory);
router.get('/credits/accounts', requireCreditManagement, CreditController.listAccounts);
router.get('/credits/search-users', requireCreditManagement, CreditController.searchUsers);

export default router;
