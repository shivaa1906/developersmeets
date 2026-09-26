import { Response } from 'express';
import { CommunityService } from '../services/communityService.js';
import { AuthenticatedRequest } from '../types/index.js';
import { ROLES } from '../config/constants.js';

export class CommunityController {
  /**
   * List community channels
   */
  static async listChannels(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const isLeadership = [ROLES.CEO, ROLES.ADMIN, ROLES.MD].includes(req.user?.role as any);
      const includeArchived = req.query.includeArchived === 'true' && isLeadership;
      const channels = await CommunityService.getChannels(includeArchived);
      res.json({ channels });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * CEO / Admin creates a new channel
   */
  static async createChannel(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { name, slug, description } = req.body;
    if (!name || !slug) {
      res.status(400).json({ error: 'Channel name and slug are required' });
      return;
    }

    try {
      const channel = await CommunityService.createChannel(
        name,
        slug,
        description || `Channel for ${name}`,
        req.user!.userId
      );
      res.status(201).json({ channel });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * CEO / Admin archives a channel
   */
  static async archiveChannel(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const channel = await CommunityService.archiveChannel(id, req.user!.userId);
      res.json({ channel, message: 'Channel archived successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * CEO / Admin deletes a channel
   */
  static async deleteChannel(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const channel = await CommunityService.deleteChannel(id, req.user!.userId);
      res.json({ channel, message: 'Channel deleted successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get messages for a channel
   */
  static async getChannelMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { channelIdOrSlug } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    try {
      const result = await CommunityService.getChannelMessages(channelIdOrSlug, limit, offset);
      res.json(result);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  /**
   * Send a message to a channel
   */
  static async sendChannelMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { channelIdOrSlug } = req.params;
    const { content, replyToId, mentions, attachments } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Message content cannot be empty' });
      return;
    }

    try {
      const message = await CommunityService.sendChannelMessage({
        channelIdOrSlug,
        userId: req.user!.userId,
        developerId: req.user?.developerId,
        content,
        replyToId,
        mentions,
        attachments,
      });
      res.status(201).json({ message });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Edit a channel message
   */
  static async editChannelMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { messageId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Message content cannot be empty' });
      return;
    }

    try {
      const message = await CommunityService.editChannelMessage(messageId, req.user!.userId, content);
      res.json({ message });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  /**
   * Delete a channel message
   */
  static async deleteChannelMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { messageId } = req.params;

    try {
      const message = await CommunityService.deleteChannelMessage(
        messageId,
        req.user!.userId,
        req.user!.role
      );
      res.json({ message, deleted: true });
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  /**
   * Add/toggle reaction on a channel message
   */
  static async toggleReaction(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji || !emoji.trim()) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    try {
      const result = await CommunityService.toggleReaction(
        messageId,
        req.user!.userId,
        req.user?.developerId,
        emoji
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * CEO / Admin moderates a message
   */
  static async moderateMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { messageId } = req.params;
    const { reason, redactContent } = req.body;

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Moderation reason is required' });
      return;
    }

    try {
      const message = await CommunityService.moderateMessage(
        messageId,
        req.user!.userId,
        reason,
        redactContent !== false
      );
      res.json({ message, moderated: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * CEO / Admin pins an announcement or message in a channel
   */
  static async pinMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { messageId } = req.params;
    const { isPinned } = req.body;

    try {
      const message = await CommunityService.pinMessage(
        messageId,
        req.user!.userId,
        isPinned !== false
      );
      res.json({ message, pinned: message.is_pinned });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Create or retrieve a DM conversation with another developer
   */
  static async createOrGetDM(req: AuthenticatedRequest, res: Response): Promise<void> {
    const developerId = req.user?.developerId;
    if (!developerId) {
      res.status(403).json({ error: 'Only verified developers can initiate direct messages' });
      return;
    }

    const { targetDeveloperId } = req.body;
    if (!targetDeveloperId) {
      res.status(400).json({ error: 'targetDeveloperId is required' });
      return;
    }

    try {
      const result = await CommunityService.getOrCreateDM(
        req.user!.userId,
        developerId,
        targetDeveloperId
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get direct messages in a DM conversation
   */
  static async getDMMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    try {
      const result = await CommunityService.getDMMessages(conversationId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  /**
   * Send a direct message in a DM conversation
   */
  static async sendDMMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    try {
      const result = await CommunityService.sendDMMessage(conversationId, req.user!.userId, message);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  // --- Posts & Comments (Backward Compatible) ---

  static async listPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const channel = req.query.channel as string;
      const search = req.query.search as string;
      const posts = await CommunityService.getPosts(channel, search);
      res.json({ posts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getPost(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const post = await CommunityService.getPostById(id);
      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }
      res.json({ post });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createPost(req: AuthenticatedRequest, res: Response): Promise<void> {
    const developerId = req.user?.developerId;
    if (!developerId) {
      res.status(403).json({ error: 'Verified developer profile required to create posts' });
      return;
    }

    const { channelId, title, content, tags } = req.body;
    if (!channelId || !title || !content) {
      res.status(400).json({ error: 'channelId, title, and content are required' });
      return;
    }

    try {
      const post = await CommunityService.createPost(developerId, channelId, title, content, tags);
      res.status(201).json({ post });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async upvotePost(req: AuthenticatedRequest, res: Response): Promise<void> {
    const developerId = req.user?.developerId;
    if (!developerId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    const { id } = req.params;
    try {
      const result = await CommunityService.upvotePost(developerId, id);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async addComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const developerId = req.user?.developerId;
    if (!developerId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    const { id } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      res.status(400).json({ error: 'Comment content is required' });
      return;
    }

    try {
      const comment = await CommunityService.addComment(developerId, id, content);
      res.status(201).json({ comment });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
