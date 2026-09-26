import { Router } from 'express';
import { CommunityController } from '../controllers/communityController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireVerifiedDeveloper, requireRole } from '../middlewares/rbacMiddleware.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Private Developer Community Guard:
// Strictly accessible to approved developers and leadership.
// Rejects unauthenticated (401), clients (403), guests (403), pending developers (403), and suspended developers (403).
router.use(authenticateJwt, requireVerifiedDeveloper);

// Channel routes
router.get('/channels', CommunityController.listChannels);
router.post('/channels', requireRole(ROLES.CEO, ROLES.ADMIN, ROLES.MD), CommunityController.createChannel);
router.patch('/channels/:id/archive', requireRole(ROLES.CEO, ROLES.ADMIN, ROLES.MD), CommunityController.archiveChannel);
router.delete('/channels/:id', requireRole(ROLES.CEO, ROLES.ADMIN, ROLES.MD), CommunityController.deleteChannel);

// Channel message routes
router.get('/channels/:channelIdOrSlug/messages', CommunityController.getChannelMessages);
router.post('/channels/:channelIdOrSlug/messages', CommunityController.sendChannelMessage);

// Individual message actions (edit, delete, reactions, moderation, pinning)
router.patch('/messages/:messageId', CommunityController.editChannelMessage);
router.delete('/messages/:messageId', CommunityController.deleteChannelMessage);
router.post('/messages/:messageId/reactions', CommunityController.toggleReaction);
router.patch('/messages/:messageId/moderate', requireRole(ROLES.CEO, ROLES.ADMIN, ROLES.MD), CommunityController.moderateMessage);
router.patch('/messages/:messageId/pin', requireRole(ROLES.CEO, ROLES.ADMIN, ROLES.MD), CommunityController.pinMessage);

// Direct Messages (DMs) between verified developers
router.post('/dms', CommunityController.createOrGetDM);
router.get('/dms/:conversationId/messages', CommunityController.getDMMessages);
router.post('/dms/:conversationId/messages', CommunityController.sendDMMessage);

// Discussion Posts & Comments (Backward Compatible)
router.get('/posts', CommunityController.listPosts);
router.get('/posts/:id', CommunityController.getPost);
router.post('/posts', CommunityController.createPost);
router.post('/posts/:id/upvote', CommunityController.upvotePost);
router.post('/posts/:id/comments', CommunityController.addComment);

export default router;
