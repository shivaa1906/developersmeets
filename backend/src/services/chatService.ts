import { query } from '../database/db.js';
import { scrubPrivateContactInfo } from '../utils/privacyScrubber.js';
import { EventEmitter } from 'events';

export const chatEventEmitter = new EventEmitter();
chatEventEmitter.setMaxListeners(100);

export class ChatService {
  /**
   * Subscribes to realtime messages for a conversation
   */
  static onMessage(conversationId: string, listener: (msg: any) => void) {
    chatEventEmitter.on(`message:${conversationId}`, listener);
  }

  /**
   * Unsubscribes from realtime messages for a conversation
   */
  static offMessage(conversationId: string, listener: (msg: any) => void) {
    chatEventEmitter.off(`message:${conversationId}`, listener);
  }

  /**
   * Retrieves conversations for the current user with unread counts & anonymous shielding
   */
  static async getUserConversations(userId: string) {
    const res = await query(
      `SELECT c.id, c.type, c.status, c.created_at, c.closed_at,
              p.id as project_id, p.title as project_title, p.project_number, p.status as project_status,
              cm.role as my_role,
              cm.last_read_at,
              (
                SELECT COUNT(*)
                FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_user_id != $1
                  AND m.created_at > COALESCE(cm.last_read_at, cm.joined_at, '1970-01-01'::timestamptz)
              )::int as unread_count
       FROM conversation_members cm
       JOIN conversations c ON cm.conversation_id = c.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return res.rows.map((row) => ({
      ...row,
      unreadCount: Number(row.unread_count || 0),
      isRead: Number(row.unread_count || 0) === 0,
    }));
  }

  /**
   * Retrieves messages for a conversation, reporting unread counts and read state
   */
  static async getMessages(conversationId: string, userId: string, autoMarkRead: boolean = false) {
    // 1. Verify user membership in conversation
    const memberCheck = await query(
      `SELECT cm.*, c.project_id, c.status as conversation_status, p.status as project_status
       FROM conversation_members cm
       JOIN conversations c ON cm.conversation_id = c.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE cm.conversation_id = $1 AND cm.user_id = $2`,
      [conversationId, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    const { project_id, conversation_status, last_read_at } = memberCheck.rows[0];

    // 2. Fetch messages
    const messagesRes = await query(
      `SELECT m.id, m.sender_user_id, m.message, m.message_type, m.created_at,
              u.role as sender_system_role,
              cl.client_number,
              pc.anonymous_tag
       FROM messages m
       JOIN users u ON m.sender_user_id = u.id
       LEFT JOIN clients cl ON u.id = cl.user_id
       LEFT JOIN developers d ON u.id = d.user_id
       LEFT JOIN project_claims pc ON (pc.project_id = $2 AND pc.developer_id = d.id)
       WHERE m.conversation_id = $1
       ORDER BY m.created_at ASC`,
      [conversationId, project_id]
    );

    // Calculate unread count for this user prior to optional auto-mark-read
    const unreadCountRes = await query(
      `SELECT COUNT(*)::int as unread_count
       FROM messages
       WHERE conversation_id = $1
         AND sender_user_id != $2
         AND created_at > COALESCE($3::timestamptz, '1970-01-01'::timestamptz)`,
      [conversationId, userId, last_read_at]
    );
    let unreadCount = Number(unreadCountRes.rows[0]?.unread_count || 0);

    if (autoMarkRead && unreadCount > 0) {
      await query(
        `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );
      unreadCount = 0;
    }

    const messages = messagesRes.rows.map((msg) => {
      const isMe = msg.sender_user_id === userId;
      let senderDisplayName = isMe ? 'You' : 'Participant';

      if (msg.anonymous_tag) {
        senderDisplayName = isMe ? `You (${msg.anonymous_tag})` : msg.anonymous_tag;
      } else if (msg.client_number) {
        senderDisplayName = isMe ? `You (${msg.client_number})` : msg.client_number;
      } else if (msg.sender_system_role === 'CEO' || msg.sender_system_role === 'MD') {
        senderDisplayName = 'Platform Leadership';
      }

      return {
        id: msg.id,
        senderId: msg.sender_user_id,
        senderDisplayName,
        message: msg.message,
        messageType: msg.message_type,
        createdAt: msg.created_at,
        isMe,
      };
    });

    return {
      conversationId,
      status: conversation_status,
      unreadCount,
      isRead: unreadCount === 0,
      messages,
    };
  }

  /**
   * Retrieves unread state for a conversation
   */
  static async getUnreadState(conversationId: string, userId: string) {
    const memberCheck = await query(
      `SELECT cm.last_read_at, cm.joined_at
       FROM conversation_members cm
       WHERE cm.conversation_id = $1 AND cm.user_id = $2`,
      [conversationId, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    const lastRead = memberCheck.rows[0].last_read_at || memberCheck.rows[0].joined_at || new Date(0);

    const unreadRes = await query(
      `SELECT COUNT(*)::int as count
       FROM messages
       WHERE conversation_id = $1
         AND sender_user_id != $2
         AND created_at > $3::timestamptz`,
      [conversationId, userId, lastRead]
    );

    const unreadCount = Number(unreadRes.rows[0].count || 0);

    return {
      conversationId,
      unreadCount,
      isRead: unreadCount === 0,
    };
  }

  /**
   * Explicitly marks all messages in a conversation as read by the user
   */
  static async markConversationAsRead(conversationId: string, userId: string) {
    const memberCheck = await query(
      `SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    await query(
      `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    return {
      success: true,
      conversationId,
      unreadCount: 0,
      isRead: true,
    };
  }

  /**
   * Sends a message with automated privacy redaction, realtime event broadcast, and closed chat defense
   */
  static async sendMessage(conversationId: string, senderUserId: string, rawText: string) {
    // 1. Membership & conversation status check
    const memberCheck = await query(
      `SELECT cm.id, cm.role, c.status as conversation_status, c.project_id
       FROM conversation_members cm
       JOIN conversations c ON cm.conversation_id = c.id
       WHERE cm.conversation_id = $1 AND cm.user_id = $2`,
      [conversationId, senderUserId]
    );

    if (memberCheck.rows.length === 0) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    const { conversation_status, project_id } = memberCheck.rows[0];

    // 2. Closed conversation protection
    if (conversation_status === 'CLOSED') {
      throw new Error('Forbidden: This conversation is closed. Unselected project conversations cannot accept new messages.');
    }

    // 3. Run Privacy Scrubber
    const scrubbed = scrubPrivateContactInfo(rawText);

    // 4. Insert message
    const msgRes = await query(
      `INSERT INTO messages (conversation_id, sender_user_id, message, message_type)
       VALUES ($1, $2, $3, 'TEXT')
       RETURNING id, conversation_id, sender_user_id, message, created_at`,
      [conversationId, senderUserId, scrubbed.scrubbedText]
    );

    // 5. Update sender's last_read_at so sender never has unread count for own messages
    await query(
      `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, senderUserId]
    );

    const messageData = {
      id: msgRes.rows[0].id,
      conversationId,
      senderId: senderUserId,
      message: msgRes.rows[0].message,
      createdAt: msgRes.rows[0].created_at,
      projectId: project_id,
    };

    // 6. Broadcast realtime event
    chatEventEmitter.emit(`message:${conversationId}`, messageData);
    chatEventEmitter.emit('message', messageData);

    return {
      message: msgRes.rows[0],
      redacted: scrubbed.hasViolations,
      violations: scrubbed.violationsFound,
    };
  }
}

