import { Router } from 'express';
import { CommunityController } from '../controllers/communityController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireVerifiedDeveloper } from '../middlewares/rbacMiddleware.js';

const router = Router();

// Public read routes
router.get('/channels', CommunityController.listChannels);
router.get('/posts', CommunityController.listPosts);
router.get('/posts/:id', CommunityController.getPost);

// Authenticated write routes (Verified Developers & Leadership only)
router.post('/posts', authenticateJwt, requireVerifiedDeveloper, CommunityController.createPost);
router.post('/posts/:id/upvote', authenticateJwt, requireVerifiedDeveloper, CommunityController.upvotePost);
router.post('/posts/:id/comments', authenticateJwt, requireVerifiedDeveloper, CommunityController.addComment);

export default router;
