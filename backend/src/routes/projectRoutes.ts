import { Router } from 'express';
import { ProjectController } from '../controllers/projectController.js';
import { authenticateJwt } from '../middlewares/authMiddleware.js';
import { requireRole, requireVerifiedDeveloper } from '../middlewares/rbacMiddleware.js';
import { ROLES } from '../config/constants.js';

const router = Router();

// Public routes
router.get('/published', ProjectController.listPublished);
router.get('/marketplace', ProjectController.marketplace);

// Authenticated routes
router.get('/my-projects', authenticateJwt, ProjectController.myProjects);
router.get('/:id', authenticateJwt, ProjectController.getById);

// Client project submission
router.post(
  '/submit',
  authenticateJwt,
  requireRole(ROLES.CLIENT, ROLES.CEO, ROLES.ADMIN),
  ProjectController.submit
);

// Admin review and approval of project
router.post(
  '/:projectId/review',
  authenticateJwt,
  requireRole(ROLES.CEO, ROLES.MD, ROLES.ADMIN),
  ProjectController.review
);

router.post(
  '/:projectId/approve',
  authenticateJwt,
  requireRole(ROLES.CEO, ROLES.MD, ROLES.ADMIN),
  ProjectController.approve
);

// Client / Leadership project updates (with strict state protection)
router.patch('/:projectId', authenticateJwt, ProjectController.updateProject);
router.put('/:projectId', authenticateJwt, ProjectController.updateProject);

// Developer claim project slot
router.post(
  '/:projectId/claim',
  authenticateJwt,
  requireVerifiedDeveloper,
  ProjectController.claim
);

// Developer submit proposal
router.post(
  '/:projectId/proposals',
  authenticateJwt,
  requireVerifiedDeveloper,
  ProjectController.submitProposal
);

// List proposals for project (Client / Leadership)
router.get(
  '/:projectId/proposals',
  authenticateJwt,
  ProjectController.listProposals
);

// Client selects developer
router.post(
  '/:projectId/select',
  authenticateJwt,
  requireRole(ROLES.CLIENT, ROLES.CEO, ROLES.ADMIN),
  ProjectController.select
);

export default router;
