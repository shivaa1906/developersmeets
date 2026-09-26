import { Router } from 'express';
import { DeveloperController } from '../controllers/developerController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

// Public routes
router.get('/public', DeveloperController.listPublic);
router.get('/profile/:username', DeveloperController.getByUsername);

// Protected routes
router.get('/dashboard', authenticateJwt, DeveloperController.getDashboard);
router.patch('/profile', authenticateJwt, DeveloperController.updateProfile);

export default router;
