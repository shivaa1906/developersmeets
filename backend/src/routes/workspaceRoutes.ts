import { Router } from 'express';
import { WorkspaceController } from '../controllers/workspaceController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticateJwt);

// 1. Workspace Full State (All 9 sections)
router.get('/:projectId', WorkspaceController.getWorkspace);

// 2. Milestones Management & Lifecycle
router.post('/:projectId/milestones', WorkspaceController.createMilestone);
router.patch('/milestones/:milestoneId', WorkspaceController.updateMilestone);

// 3. Tasks Management
router.post('/:projectId/tasks', WorkspaceController.createTask);
router.get('/:projectId/tasks', WorkspaceController.getTasks);
router.patch('/tasks/:taskId', WorkspaceController.updateTask);

// 4. Deliverable Files & Access Control
router.post('/:projectId/files', WorkspaceController.uploadFile);
router.get('/:projectId/files', WorkspaceController.getFiles);
router.get('/:projectId/files/:fileId', WorkspaceController.getFile);

// 5. Timeline Events
router.get('/:projectId/timeline', WorkspaceController.getTimeline);

// 6. Project Completion
router.post('/:projectId/complete', WorkspaceController.completeProject);

export default router;
