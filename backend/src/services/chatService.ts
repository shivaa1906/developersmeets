import { query } from '../database/db.js';
import { scrubPrivateContactInfo } from '../utils/privacyScrubber.js';

export class ChatService {
  /**
   * Retrieves conversations for the current user with anonymous shielding
   */
  static async getUserConversations(userId: string) {
    const res = await query(
      `SELECT c.id, c.type, c.status, c.created_at,
              p.title as project_title, p.project_number, p.status as project_status,
              cm.role as my_role
       FROM conversation_members cm
       JOIN conversations c ON cm.conversation_id = c.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );

    return res.rows;
  }

  /**
   * Retrieves messages for a conversation
   */
  static async getMessages(conversationId: string, userId: string) {
    // 1. Verify user membership in conversation
    const memberCheck = await query(
      `SELECT cm.*, c.project_id, p.status as project_status
       FROM conversation_members cm
       JOIN conversations c ON cm.conversation_id = c.id
       LEFT JOIN projects p ON c.project_id = p.id
       WHERE cm.conversation_id = $1 AND cm.user_id = $2`,
      [conversationId, userId]
    );

    if (memberCheck.rows.length === 0) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    const { project_id, project_status: _project_status } = memberCheck.rows[0];

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

    // Format sender display based on anonymity rule
    return messagesRes.rows.map((msg) => {
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
  }

  /**
   * Sends a message with automated privacy and contact redaction
   */
  static async sendMessage(conversationId: string, senderUserId: string, rawText: string) {
    // 1. Membership check
    const memberCheck = await query(
      `SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, senderUserId]
    );

    if (memberCheck.rows.length === 0) {
      throw new Error('Forbidden: You are not a member of this conversation');
    }

    // 2. Run Privacy Scrubber
    const scrubbed = scrubPrivateContactInfo(rawText);

    // 3. Insert message
    const msgRes = await query(
      `INSERT INTO messages (conversation_id, sender_user_id, message, message_type)
       VALUES ($1, $2, $3, 'TEXT')
       RETURNING id, conversation_id, sender_user_id, message, created_at`,
      [conversationId, senderUserId, scrubbed.scrubbedText]
    );

    return {
      message: msgRes.rows[0],
      redacted: scrubbed.hasViolations,
      violations: scrubbed.violationsFound,
    };
  }
}
