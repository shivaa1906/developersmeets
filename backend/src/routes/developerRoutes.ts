import { Router } from 'express';
import { DeveloperController } from '../controllers/developerController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireVerifiedDeveloper } from '../middlewares/rbacMiddleware.js';

const router = Router();

// Public routes
router.get('/', DeveloperController.listPublic);
router.get('/public', DeveloperController.listPublic);
router.get('/directory', DeveloperController.listPublic);
router.get('/skills', DeveloperController.listSkills);
router.get('/skills/search', DeveloperController.listSkills);
// Protected routes for developers
router.get('/me', authenticateJwt, DeveloperController.getMyProfile);
router.patch('/profile', authenticateJwt, DeveloperController.updateProfile);

// Verified Developer gated routes
router.get('/dashboard', authenticateJwt, requireVerifiedDeveloper, DeveloperController.getDashboard);
router.get('/inquiries', authenticateJwt, requireVerifiedDeveloper, DeveloperController.getInquiries);

// Client to Developer inquiry route
router.post('/:developerId/inquiry', authenticateJwt, DeveloperController.sendInquiry);

// Public route by username (placed after static routes to prevent route shadowing)
router.get('/profile/:username', DeveloperController.getByUsername);
router.get('/:username', DeveloperController.getByUsername);

export default router;
