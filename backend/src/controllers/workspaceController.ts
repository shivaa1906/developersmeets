import { Response } from 'express';
import { WorkspaceService } from '../services/workspaceService.js';
import { AuthenticatedRequest } from '../types/index.js';

export class WorkspaceController {
  static async getWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const workspace = await WorkspaceService.getWorkspace(projectId, {
        userId: req.user!.userId,
        role: req.user!.role,
        developerId: req.user?.developerId,
        clientId: req.user?.clientId,
      });
      res.json({ workspace });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  static async createMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { title, description, dueDate, orderIndex } = req.body;

    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    try {
      const milestone = await WorkspaceService.createMilestone(
        projectId,
        title,
        description,
        dueDate,
        orderIndex ? Number(orderIndex) : 0
      );
      res.status(201).json({ milestone });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async updateMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { milestoneId } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    try {
      const milestone = await WorkspaceService.updateMilestoneStatus(
        milestoneId,
        status,
        req.user!.userId
      );
      res.json({ milestone });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async completeProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { rating, feedback } = req.body;
    const clientId = req.user?.clientId;

    if (!clientId) {
      res.status(403).json({ error: 'Client account required to complete project' });
      return;
    }

    try {
      const result = await WorkspaceService.completeProject(
        projectId,
        clientId,
        rating ? Number(rating) : 5,
        feedback
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
