import { query, withTransaction } from '../database/db.js';
import { ChatService } from './chatService.js';
import { NotificationService } from './notificationService.js';

export class CommunityService {
  /**
   * Retrieves all community channels (defaults to non-archived unless requested)
   */
  static async getChannels(includeArchived = false) {
    let sql = 'SELECT * FROM channels';
    if (!includeArchived) {
      sql += ' WHERE is_archived = FALSE';
    }
    sql += ' ORDER BY name ASC';
    const res = await query(sql);
    return res.rows;
  }

  /**
   * Admin / CEO creates a channel
   */
  static async createChannel(name: string, slug: string, description: string, createdByUserId: string) {
    const formattedName = name.startsWith('#') ? name : `#${name}`;
    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const res = await query(
      `INSERT INTO channels (name, slug, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [formattedName, cleanSlug, description, createdByUserId]
    );
    return res.rows[0];
  }

  /**
   * Admin / CEO archives a channel
   */
  static async archiveChannel(channelIdOrSlug: string, _userId?: string) {
    const res = await query(
      `UPDATE channels
       SET is_archived = TRUE, archived_at = NOW()
       WHERE id::text = $1 OR slug = $1
       RETURNING *`,
      [channelIdOrSlug]
    );
    if (res.rows.length === 0) {
      throw new Error('Channel not found');
    }
    return res.rows[0];
  }

  /**
   * Admin / CEO deletes a channel
   */
  static async deleteChannel(channelIdOrSlug: string, _userId?: string) {
    const res = await query(
      `DELETE FROM channels WHERE id::text = $1 OR slug = $1 RETURNING *`,
      [channelIdOrSlug]
    );
    if (res.rows.length === 0) {
      throw new Error('Channel not found');
    }
    return res.rows[0];
  }

  /**
   * Retrieves community discussion posts
   */
  static async getPosts(channelSlug?: string, search?: string) {
    let sql = `
      SELECT cp.id, cp.title, cp.content, cp.tags, cp.upvotes, cp.created_at,
             c.name as channel_name, c.slug as channel_slug,
             d.username as author_username, d.display_name as author_name,
             d.profile_image as author_avatar, d.role_title as author_title,
             COUNT(cc.id) as comments_count
      FROM community_posts cp
      JOIN channels c ON cp.channel_id = c.id
      JOIN developers d ON cp.author_developer_id = d.id
      LEFT JOIN community_comments cc ON cp.id = cc.post_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (channelSlug && channelSlug !== 'all') {
      params.push(channelSlug);
      sql += ` AND c.slug = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (cp.title ILIKE $${params.length} OR cp.content ILIKE $${params.length})`;
    }

    sql += ` GROUP BY cp.id, c.id, d.id ORDER BY cp.created_at DESC`;

    const res = await query(sql, params);
    return res.rows.map((r) => ({
      ...r,
      comments_count: parseInt(r.comments_count, 10),
    }));
  }

  /**
   * Retrieves post details with comments
   */
  static async getPostById(postId: string) {
    const postRes = await query(
      `SELECT cp.*, c.name as channel_name, c.slug as channel_slug,
              d.username as author_username, d.display_name as author_name,
              d.profile_image as author_avatar, d.role_title as author_title
       FROM community_posts cp
       JOIN channels c ON cp.channel_id = c.id
       JOIN developers d ON cp.author_developer_id = d.id
       WHERE cp.id = $1`,
      [postId]
    );

    if (postRes.rows.length === 0) {
      return null;
    }

    const post = postRes.rows[0];

    // Fetch comments
    const commentsRes = await query(
      `SELECT cc.*, d.username as author_username, d.display_name as author_name,
              d.profile_image as author_avatar, d.role_title as author_title
       FROM community_comments cc
       JOIN developers d ON cc.author_developer_id = d.id
       WHERE cc.post_id = $1
       ORDER BY cc.created_at ASC`,
      [postId]
    );

    return {
      ...post,
      comments: commentsRes.rows,
    };
  }

  /**
   * Creates a community post
   */
  static async createPost(
    developerId: string,
    channelId: string,
    title: string,
    content: string,
    tags?: string[]
  ) {
    const res = await query(
      `INSERT INTO community_posts (channel_id, author_developer_id, title, content, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [channelId, developerId, title, content, JSON.stringify(tags || [])]
    );
    return res.rows[0];
  }

  /**
   * Toggles upvote on a post
   */
  static async upvotePost(developerId: string, postId: string) {
    return withTransaction(async (client) => {
      // Check existing upvote
      const existing = await client.query(
        `SELECT * FROM community_upvotes WHERE post_id = $1 AND developer_id = $2`,
        [postId, developerId]
      );

      if (existing.rows.length > 0) {
        // Remove upvote
        await client.query(
          `DELETE FROM community_upvotes WHERE post_id = $1 AND developer_id = $2`,
          [postId, developerId]
        );
        await client.query(
          `UPDATE community_posts SET upvotes = GREATEST(0, upvotes - 1) WHERE id = $1`,
          [postId]
        );
        return { upvoted: false };
      } else {
        // Add upvote
        await client.query(
          `INSERT INTO community_upvotes (post_id, developer_id) VALUES ($1, $2)`,
          [postId, developerId]
        );
        await client.query(
          `UPDATE community_posts SET upvotes = upvotes + 1 WHERE id = $1`,
          [postId]
        );
        return { upvoted: true };
      }
    });
  }

  /**
   * Adds a comment to a post
   */
  static async addComment(developerId: string, postId: string, content: string) {
    const res = await query(
      `INSERT INTO community_comments (post_id, author_developer_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [postId, developerId, content]
    );
    return res.rows[0];
  }

  /**
   * Retrieves messages in a channel
   */
  static async getChannelMessages(channelIdOrSlug: string, limit = 50, offset = 0) {
    const chRes = await query(
      `SELECT id, name, slug, description, is_archived FROM channels WHERE id::text = $1 OR slug = $1`,
      [channelIdOrSlug]
    );
    if (chRes.rows.length === 0) {
      throw new Error('Channel not found');
    }
    const channel = chRes.rows[0];

    const msgsRes = await query(
      `SELECT m.id, m.channel_id, m.content, m.reply_to_id, m.mentions, m.attachments,
              m.has_code_block, m.is_edited, m.edited_at, m.is_deleted, m.deleted_at,
              m.is_pinned, m.pinned_at, m.moderation_reason, m.created_at,
              u.id as author_user_id, u.role as author_system_role,
              d.id as author_developer_id, d.username as author_username,
              d.display_name as author_name, d.profile_image as author_avatar,
              d.role_title as author_title,
              rm.content as reply_to_content,
              rd.display_name as reply_to_author_name
       FROM channel_messages m
       JOIN users u ON m.author_user_id = u.id
       LEFT JOIN developers d ON m.author_developer_id = d.id
       LEFT JOIN channel_messages rm ON m.reply_to_id = rm.id
       LEFT JOIN developers rd ON rm.author_developer_id = rd.id
       WHERE m.channel_id = $1
       ORDER BY m.is_pinned DESC, m.created_at ASC
       LIMIT $2 OFFSET $3`,
      [channel.id, limit, offset]
    );

    const msgIds = msgsRes.rows.map((m) => m.id);
    const reactionsByMessage: Record<string, Array<{ emoji: string; count: number; users: string[] }>> = {};
    if (msgIds.length > 0) {
      const reactionsRes = await query(
        `SELECT r.message_id, r.emoji, r.user_id,
                COALESCE(d.display_name, u.role) as user_name
         FROM channel_message_reactions r
         JOIN users u ON r.user_id = u.id
         LEFT JOIN developers d ON r.developer_id = d.id
         WHERE r.message_id = ANY($1::uuid[])`,
        [msgIds]
      );

      for (const row of reactionsRes.rows) {
        if (!reactionsByMessage[row.message_id]) {
          reactionsByMessage[row.message_id] = [];
        }
        let existing = reactionsByMessage[row.message_id].find((x) => x.emoji === row.emoji);
        if (!existing) {
          existing = { emoji: row.emoji, count: 0, users: [] };
          reactionsByMessage[row.message_id].push(existing);
        }
        existing.count += 1;
        existing.users.push(row.user_name);
      }
    }

    return {
      channel,
      messages: msgsRes.rows.map((row) => ({
        ...row,
        reactions: reactionsByMessage[row.id] || [],
      })),
    };
  }

  /**
   * Sends a message into a channel
   */
  static async sendChannelMessage(data: {
    channelIdOrSlug: string;
    userId: string;
    developerId?: string;
    content: string;
    replyToId?: string;
    mentions?: string[];
    attachments?: Array<{ filename: string; url: string; size?: number; mimetype?: string }>;
  }) {
    const { channelIdOrSlug, userId, developerId, content, replyToId, attachments = [] } = data;

    const chRes = await query(
      `SELECT id, name, slug, is_archived FROM channels WHERE id::text = $1 OR slug = $1`,
      [channelIdOrSlug]
    );
    if (chRes.rows.length === 0) {
      throw new Error('Channel not found');
    }
    const channel = chRes.rows[0];
    if (channel.is_archived) {
      throw new Error('Cannot send messages to an archived channel');
    }

    // Detect code blocks
    const hasCodeBlock = content.includes('```');

    // Detect mentions if not explicitly passed
    let mentions = data.mentions || [];
    if (mentions.length === 0) {
      const match = content.match(/@[\w.-]+/g);
      if (match) {
        mentions = match;
      }
    }

    const insRes = await query(
      `INSERT INTO channel_messages (
         channel_id, author_user_id, author_developer_id, content,
         reply_to_id, mentions, attachments, has_code_block
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        channel.id,
        userId,
        developerId || null,
        content,
        replyToId || null,
        JSON.stringify(mentions),
        JSON.stringify(attachments),
        hasCodeBlock,
      ]
    );

    // Dispatch notifications for community mentions
    if (mentions.length > 0) {
      const snippet = content.length > 80 ? `${content.substring(0, 80)}...` : content;
      for (const mention of mentions) {
        const cleanHandle = mention.replace(/^@/, '');
        try {
          const devMatch = await query(
            `SELECT user_id, username FROM developers WHERE LOWER(username) = LOWER($1)`,
            [cleanHandle]
          );
          let targetUserId = devMatch.rows[0]?.user_id;
          if (!targetUserId) {
            const userMatch = await query(
              `SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(role) = LOWER($1)`,
              [cleanHandle]
            );
            if (userMatch.rows.length > 0) {
              targetUserId = userMatch.rows[0].id;
            }
          }

          if (targetUserId && targetUserId !== userId) {
            await NotificationService.createNotification({
              userId: targetUserId,
              type: 'COMMUNITY_MENTION',
              title: `New Mention in #${channel.slug}`,
              message: `You were mentioned in #${channel.slug}: "${snippet}"`,
              link: `/community/channels/${channel.slug}`,
              metadata: {
                channelId: channel.id,
                channelSlug: channel.slug,
                messageId: insRes.rows[0].id,
              },
            });
          }
        } catch (e: any) {
          console.error('Error dispatching mention notification:', e.message);
        }
      }
    }

    return insRes.rows[0];
  }

  /**
   * Edits a message in a channel (author only)
   */
  static async editChannelMessage(messageId: string, userId: string, newContent: string) {
    const msgRes = await query(`SELECT * FROM channel_messages WHERE id = $1`, [messageId]);
    if (msgRes.rows.length === 0) {
      throw new Error('Message not found');
    }
    const message = msgRes.rows[0];

    if (message.author_user_id !== userId) {
      throw new Error('Forbidden: You can only edit your own messages');
    }

    if (message.is_deleted) {
      throw new Error('Cannot edit a deleted message');
    }

    const hasCodeBlock = newContent.includes('```');

    const updateRes = await query(
      `UPDATE channel_messages
       SET content = $1, is_edited = TRUE, edited_at = NOW(), has_code_block = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newContent, hasCodeBlock, messageId]
    );

    return updateRes.rows[0];
  }

  /**
   * Deletes a message (author or leadership)
   */
  static async deleteChannelMessage(messageId: string, userId: string, userRole: string) {
    const msgRes = await query(`SELECT * FROM channel_messages WHERE id = $1`, [messageId]);
    if (msgRes.rows.length === 0) {
      throw new Error('Message not found');
    }
    const message = msgRes.rows[0];

    const isAuthor = message.author_user_id === userId;
    const isLeadership = ['CEO', 'ADMIN', 'MD'].includes(userRole);

    if (!isAuthor && !isLeadership) {
      throw new Error('Forbidden: You do not have permission to delete this message');
    }

    const updateRes = await query(
      `UPDATE channel_messages
       SET is_deleted = TRUE, deleted_at = NOW(), content = '[This message was deleted]', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [messageId]
    );

    return updateRes.rows[0];
  }

  /**
   * Toggles emoji reaction on a message
   */
  static async toggleReaction(
    messageId: string,
    userId: string,
    developerId: string | undefined,
    emoji: string
  ) {
    const existing = await query(
      `SELECT * FROM channel_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );

    if (existing.rows.length > 0) {
      await query(
        `DELETE FROM channel_message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
        [messageId, userId, emoji]
      );
      return { added: false, emoji };
    } else {
      await query(
        `INSERT INTO channel_message_reactions (message_id, user_id, developer_id, emoji)
         VALUES ($1, $2, $3, $4)`,
        [messageId, userId, developerId || null, emoji]
      );
      return { added: true, emoji };
    }
  }

  /**
   * Moderates a message (CEO / Admin)
   */
  static async moderateMessage(
    messageId: string,
    moderatorUserId: string,
    reason: string,
    redactContent = true
  ) {
    const content = redactContent ? '[This message has been moderated by administrator]' : undefined;
    let sql = `UPDATE channel_messages SET moderated_by = $1, moderation_reason = $2, updated_at = NOW()`;
    const params: any[] = [moderatorUserId, reason];

    if (content) {
      params.push(content);
      sql += `, content = $${params.length}`;
    }

    params.push(messageId);
    sql += ` WHERE id = $${params.length} RETURNING *`;

    const res = await query(sql, params);
    if (res.rows.length === 0) {
      throw new Error('Message not found');
    }
    return res.rows[0];
  }

  /**
   * Pins an announcement or message in a channel (CEO / Admin)
   */
  static async pinMessage(messageId: string, userId: string, isPinned = true) {
    const res = await query(
      `UPDATE channel_messages
       SET is_pinned = $1,
           pinned_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END,
           pinned_by = CASE WHEN $1 = TRUE THEN $2::uuid ELSE NULL END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [isPinned, userId, messageId]
    );
    if (res.rows.length === 0) {
      throw new Error('Message not found');
    }
    return res.rows[0];
  }

  /**
   * Creates or gets a direct message conversation between two developers
   */
  static async getOrCreateDM(userAId: string, devAId: string, targetDevId: string) {
    const targetDevRes = await query(
      `SELECT d.id, d.user_id, d.display_name, d.username FROM developers d WHERE d.id = $1`,
      [targetDevId]
    );
    if (targetDevRes.rows.length === 0) {
      throw new Error('Target developer not found');
    }
    const targetDev = targetDevRes.rows[0];
    const userBId = targetDev.user_id;

    const convRes = await query(
      `SELECT c.id
       FROM conversations c
       JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
       JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
       WHERE c.type = 'COMMUNITY_DM'
       LIMIT 1`,
      [userAId, userBId]
    );

    if (convRes.rows.length > 0) {
      return { conversationId: convRes.rows[0].id, targetDeveloper: targetDev };
    }

    return withTransaction(async (client) => {
      const newConvRes = await client.query(
        `INSERT INTO conversations (type, status) VALUES ('COMMUNITY_DM', 'ACTIVE') RETURNING id`
      );
      const conversationId = newConvRes.rows[0].id;

      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
         VALUES ($1, $2, $3, 'DEVELOPER')`,
        [conversationId, userAId, devAId]
      );

      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
         VALUES ($1, $2, $3, 'DEVELOPER')`,
        [conversationId, userBId, targetDev.id]
      );

      return { conversationId, targetDeveloper: targetDev };
    });
  }

  /**
   * Retrieves messages for a direct message conversation
   */
  static async getDMMessages(conversationId: string, userId: string) {
    return ChatService.getMessages(conversationId, userId, true);
  }

  /**
   * Sends a message into a direct message conversation
   */
  static async sendDMMessage(conversationId: string, userId: string, message: string) {
    return ChatService.sendMessage(conversationId, userId, message);
  }
}
