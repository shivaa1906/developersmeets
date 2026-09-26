import { Router } from 'express';
import { SupportController } from '../controllers/supportController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

// Support tickets management
router.get('/tickets', SupportController.listTickets);
router.post('/tickets', SupportController.createTicket);
router.get('/tickets/:ticketId', SupportController.getTicket);
router.post('/tickets/:ticketId/assign', SupportController.assignTicket);
router.patch('/tickets/:ticketId/status', SupportController.updateStatus);
router.post('/tickets/:ticketId/attachments', SupportController.uploadAttachment);
router.get('/tickets/:ticketId/attachments/:attachmentId', SupportController.getAttachment);
router.patch('/tickets/:ticketId/notes', SupportController.updateInternalNotes);

// Support categories & escalation
router.get('/categories', SupportController.listCategories);
router.post('/tickets/:ticketId/escalate', SupportController.escalateTicket);

// Support staff operations & team management
router.get('/staff', SupportController.listStaff);
router.post('/staff', SupportController.addStaff);
router.post('/staff/invite', SupportController.inviteStaff);
router.patch('/staff/:staffId/status', SupportController.updateStaffStatus);
router.patch('/staff/:staffId/permissions', SupportController.updateStaffPermissions);
router.post('/staff/:staffId/suspend', SupportController.suspendStaff);
router.post('/staff/:staffId/remove', SupportController.removeStaffAccess);
router.post('/staff/:staffId/reassign-tickets', SupportController.reassignStaffTickets);
router.get('/teams', SupportController.listTeams);
router.post('/teams', SupportController.createTeam);
router.post('/teams/:teamId/members', SupportController.addTeamMember);
router.delete('/teams/:teamId/members/:staffId', SupportController.removeTeamMember);

// Support bridge realtime communication
router.get('/bridges/:bridgeId', SupportController.getBridge);
router.post('/bridges/:bridgeId/messages', SupportController.sendBridgeMessage);

export default router;
