import { Router } from 'express';
import { SupportController } from '../controllers/supportController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/tickets', SupportController.listTickets);
router.post('/tickets', SupportController.createTicket);
router.patch('/tickets/:ticketId/status', SupportController.updateStatus);

export default router;
