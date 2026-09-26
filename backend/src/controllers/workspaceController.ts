import { Response } from 'express';
import { WorkspaceService } from '../services/workspaceService.js';
import { AuthenticatedRequest } from '../types/index.js';

export class WorkspaceController {
  /**
   * GET /api/workspace/:projectId
   * Returns all 9 sections: Overview, Requirements, Milestones, Tasks, Files, Messages, Timeline, Payments, Support
   */
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
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * POST /api/workspace/:projectId/milestones
   */
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
        orderIndex ? Number(orderIndex) : 0,
        req.user!.userId
      );
      res.status(201).json({ milestone });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * PATCH /api/workspace/milestones/:milestoneId
   */
  static async updateMilestone(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { milestoneId } = req.params;
    const { status, feedback, submissionNotes } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    try {
      const milestone = await WorkspaceService.updateMilestoneStatus(
        milestoneId,
        status,
        req.user!.userId,
        {
          role: req.user!.role,
          developerId: req.user?.developerId,
          clientId: req.user?.clientId,
          feedback,
          submissionNotes,
        }
      );
      res.json({ milestone });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Tasks Management
   */
  static async createTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { title, description, milestoneId, assigneeDeveloperId } = req.body;

    try {
      const task = await WorkspaceService.createTask(
        projectId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          developerId: req.user?.developerId,
          clientId: req.user?.clientId,
        },
        { title, description, milestoneId, assigneeDeveloperId }
      );
      res.status(201).json({ task });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async getTasks(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const tasks = await WorkspaceService.getTasks(projectId, {
        userId: req.user!.userId,
        role: req.user!.role,
        developerId: req.user?.developerId,
        clientId: req.user?.clientId,
      });
      res.json({ tasks });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async updateTask(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { taskId } = req.params;
    const { status, title, description, assigneeDeveloperId } = req.body;

    try {
      const task = await WorkspaceService.updateTask(
        taskId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          developerId: req.user?.developerId,
          clientId: req.user?.clientId,
        },
        { status, title, description, assigneeDeveloperId }
      );
      res.json({ task });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Files Management
   */
  static async uploadFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { fileName, fileUrl, fileSize, mimeType, milestoneId } = req.body;

    try {
      const file = await WorkspaceService.uploadFile(
        projectId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          developerId: req.user?.developerId,
          clientId: req.user?.clientId,
        },
        { fileName, fileUrl, fileSize: Number(fileSize), mimeType, milestoneId }
      );
      res.status(201).json({ file });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async getFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const files = await WorkspaceService.getFiles(projectId, {
        userId: req.user!.userId,
        role: req.user!.role,
        developerId: req.user?.developerId,
        clientId: req.user?.clientId,
      });
      res.json({ files });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async getFile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId, fileId } = req.params;
    try {
      const file = await WorkspaceService.getFile(projectId, fileId, {
        userId: req.user!.userId,
        role: req.user!.role,
        developerId: req.user?.developerId,
        clientId: req.user?.clientId,
      });
      res.json({ file });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Timeline
   */
  static async getTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const workspace = await WorkspaceService.getWorkspace(projectId, {
        userId: req.user!.userId,
        role: req.user!.role,
        developerId: req.user?.developerId,
        clientId: req.user?.clientId,
      });
      res.json({ timeline: workspace.timeline });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Client completes project & unmasks developer attribution
   */
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
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }
}
