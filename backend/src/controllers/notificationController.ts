import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { NotificationService } from '../services/notificationService.js';

export class NotificationController {
  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const limit = Math.min(100, Number(req.query.limit) || 50);
      const offset = Number(req.query.offset) || 0;
      const data = await NotificationService.getUserNotifications(req.user!.userId, limit, offset);
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async markRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const updated = await NotificationService.markAsRead(id, req.user!.userId);
      if (!updated) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }
      res.json({ success: true, notification: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async markAllRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await NotificationService.markAllAsRead(req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
