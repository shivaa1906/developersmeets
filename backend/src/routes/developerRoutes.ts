import { Router } from 'express';
import { DeveloperController } from '../controllers/developerController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireVerifiedDeveloper } from '../middlewares/rbacMiddleware.js';

const router = Router();

// Public routes
router.get('/public', DeveloperController.listPublic);
router.get('/directory', DeveloperController.listPublic);
router.get('/skills', DeveloperController.listSkills);
router.get('/skills/search', DeveloperController.listSkills);
router.get('/profile/:username', DeveloperController.getByUsername);
router.get('/:username', DeveloperController.getByUsername);

// Protected routes for developers
router.get('/me', authenticateJwt, DeveloperController.getMyProfile);
router.patch('/profile', authenticateJwt, DeveloperController.updateProfile);

// Verified Developer gated routes
router.get('/dashboard', authenticateJwt, requireVerifiedDeveloper, DeveloperController.getDashboard);
router.get('/inquiries', authenticateJwt, requireVerifiedDeveloper, DeveloperController.getInquiries);

// Client to Developer inquiry route
router.post('/:developerId/inquiry', authenticateJwt, DeveloperController.sendInquiry);

export default router;
