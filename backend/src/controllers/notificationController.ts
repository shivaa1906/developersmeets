import { Response } from 'express';
import { query } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';

export class NotificationController {
  static async list(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user!.userId]
      );
      const unreadCount = result.rows.filter((n) => !n.read).length;
      res.json({ notifications: result.rows, unreadCount });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async markRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      await query(
        `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
        [id, req.user!.userId]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async markAllRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await query(
        `UPDATE notifications SET read = TRUE WHERE user_id = $1`,
        [req.user!.userId]
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
