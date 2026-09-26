import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/', NotificationController.list);
router.patch('/:id/read', NotificationController.markRead);
router.post('/:id/read', NotificationController.markRead);
router.patch('/read-all', NotificationController.markAllRead);
router.post('/read-all', NotificationController.markAllRead);

export default router;
