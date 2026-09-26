import { Request, Response } from 'express';
import { DeveloperService } from '../services/developerService.js';
import { AuthenticatedRequest } from '../types/index.js';

export class DeveloperController {
  static async listPublic(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query.search as string;
      const developers = await DeveloperService.getVerifiedDevelopers({ search });
      res.json({ developers });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getByUsername(req: Request, res: Response): Promise<void> {
    const { username } = req.params;
    try {
      const developer = await DeveloperService.getDeveloperByUsername(username);
      if (!developer) {
        res.status(404).json({ error: 'Developer not found' });
        return;
      }
      res.json({ developer });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    const developerId = req.user?.developerId;
    if (!developerId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    try {
      const overview = await DeveloperService.getDashboardOverview(developerId);
      res.json(overview);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const developerId = req.user?.developerId;
    if (!developerId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    try {
      const result = await DeveloperService.updateProfile(developerId, req.body);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
