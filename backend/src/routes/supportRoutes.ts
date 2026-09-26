import { Router } from 'express';
import { SupportController } from '../controllers/supportController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/tickets', SupportController.listTickets);
router.post('/tickets', SupportController.createTicket);
router.post('/tickets/:ticketId/assign', SupportController.assignTicket);
router.patch('/tickets/:ticketId/status', SupportController.updateStatus);

router.get('/bridges/:bridgeId', SupportController.getBridge);
router.post('/bridges/:bridgeId/messages', SupportController.sendBridgeMessage);

export default router;
