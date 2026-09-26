import { Router } from 'express';
import { ChatController } from '../controllers/chatController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/conversations', ChatController.listConversations);
router.get('/:conversationId/messages', ChatController.getMessages);
router.post('/:conversationId/messages', ChatController.sendMessage);
router.post('/:conversationId/read', ChatController.markAsRead);
router.get('/:conversationId/unread', ChatController.getUnread);
router.get('/:conversationId/stream', ChatController.streamMessages);

export default router;
