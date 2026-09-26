import { Request, Response } from 'express';
import { CommunityService } from '../services/communityService.js';
import { AuthenticatedRequest } from '../types/index.js';

export class CommunityController {
  static async listChannels(req: Request, res: Response): Promise<void> {
    try {
      const channels = await CommunityService.getChannels();
      res.json({ channels });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async listPosts(req: Request, res: Response): Promise<void> {
    try {
      const channel = req.query.channel as string;
      const search = req.query.search as string;
      const posts = await CommunityService.getPosts(channel, search);
      res.json({ posts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getPost(req: Request, res: Response): Promise<void> {
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
