import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/register/developer', AuthController.registerDeveloper);
router.post('/register/client', AuthController.registerClient);
router.post('/login', AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.get('/me', authenticateJwt, AuthController.me);

export default router;
