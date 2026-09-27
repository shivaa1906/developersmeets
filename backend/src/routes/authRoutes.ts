import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Apply strict rate limiting across authentication endpoints
router.use(authRateLimiter(60, 15 * 60 * 1000));

router.post('/register/developer', AuthController.registerDeveloper);
router.post('/register/client', AuthController.registerClient);
router.post('/register-client', AuthController.registerClient);
router.post('/login', AuthController.login);
router.post('/logout', authenticateJwt, AuthController.logout);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/change-password', authenticateJwt, AuthController.changePassword);
router.post('/send-verification-email', AuthController.sendVerificationEmail);
router.post('/verify-email', AuthController.verifyEmail);
router.get('/me', authenticateJwt, AuthController.me);
router.patch('/profile', authenticateJwt, AuthController.updateProfile);
router.get('/account/deletion-eligibility', authenticateJwt, AuthController.getDeletionEligibility);
router.post('/delete-account', authenticateJwt, AuthController.deactivateAccount);
router.post('/account/delete', authenticateJwt, AuthController.deactivateAccount);
router.delete('/account', authenticateJwt, AuthController.deactivateAccount);

export default router;
