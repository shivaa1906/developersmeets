import { Router } from 'express';
import { WorkspaceController } from '../controllers/workspaceController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

router.get('/:projectId', WorkspaceController.getWorkspace);
router.post('/:projectId/milestones', WorkspaceController.createMilestone);
router.patch('/milestones/:milestoneId', WorkspaceController.updateMilestone);
router.post('/:projectId/complete', WorkspaceController.completeProject);

export default router;
