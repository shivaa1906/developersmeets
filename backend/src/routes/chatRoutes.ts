import { Router } from 'express';
import { ChatController } from '../controllers/chatController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/conversations', ChatController.listConversations);
router.get('/:conversationId/messages', ChatController.getMessages);
router.post('/:conversationId/messages', ChatController.sendMessage);

export default router;
