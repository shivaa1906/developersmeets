import { query } from '../database/db.js';
import { scrubPrivateContactInfo } from '../utils/privacyScrubber.js';

export interface CreateNotificationParams {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, any>;
  client?: any; // Optional transaction client
}

export interface NotificationRecord {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

export class NotificationService {
  /**
   * Creates a notification with automatic privacy scrub to prevent leaking sensitive contact details.
   */
  static async createNotification(params: CreateNotificationParams): Promise<NotificationRecord> {
    const { userId, type, title, message, link, metadata, client } = params;

    // Strict privacy scrub on title and message bodies
    const scrubbedTitle = scrubPrivateContactInfo(title).scrubbedText;
    const scrubbedMessage = scrubPrivateContactInfo(message).scrubbedText;

    const sql = `
      INSERT INTO notifications (user_id, type, title, message, link, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, type, title, message, link, metadata, read, created_at
    `;
    const values = [
      userId,
      type,
      scrubbedTitle,
      scrubbedMessage,
      link || null,
      JSON.stringify(metadata || {}),
    ];

    const result = client ? await client.query(sql, values) : await query(sql, values);
    return result.rows[0];
  }

  /**
   * Lists notifications for a user and calculates unread count
   */
  static async getUserNotifications(userId: string, limit = 50, offset = 0) {
    const listRes = await query(
      `SELECT id, user_id, type, title, message, link, metadata, read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const countRes = await query(
      `SELECT COUNT(*)::int as unread_count
       FROM notifications
       WHERE user_id = $1 AND read = FALSE`,
      [userId]
    );

    const unreadCount = Number(countRes.rows[0]?.unread_count || 0);

    return {
      notifications: listRes.rows,
      unreadCount,
    };
  }

  /**
   * Marks a single notification as read (with authorization check for user ownership)
   */
  static async markAsRead(notificationId: string, userId: string) {
    const res = await query(
      `UPDATE notifications
       SET read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, type, title, message, link, metadata, read, created_at`,
      [notificationId, userId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    return res.rows[0];
  }

  /**
   * Marks all notifications as read for a user
   */
  static async markAllAsRead(userId: string) {
    const res = await query(
      `UPDATE notifications
       SET read = TRUE
       WHERE user_id = $1 AND read = FALSE
       RETURNING id`,
      [userId]
    );

    return {
      success: true,
      updatedCount: res.rows.length,
    };
  }
}
