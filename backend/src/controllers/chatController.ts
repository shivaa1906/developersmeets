import { Response } from 'express';
import { ChatService } from '../services/chatService.js';
import { AuthenticatedRequest } from '../types/index.js';

export class ChatController {
  static async listConversations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const conversations = await ChatService.getUserConversations(req.user!.userId);
      res.json({ conversations });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    const autoMarkRead = req.query.markRead === 'true';
    try {
      const result = await ChatService.getMessages(conversationId, req.user!.userId, autoMarkRead);
      res.json(result);
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message content cannot be empty' });
      return;
    }

    try {
      const result = await ChatService.sendMessage(conversationId, req.user!.userId, message);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  static async markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    try {
      const result = await ChatService.markConversationAsRead(conversationId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  static async getUnread(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    try {
      const result = await ChatService.getUnreadState(conversationId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(403).json({ error: error.message });
    }
  }

  static async streamMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { conversationId } = req.params;
    const userId = req.user!.userId;

    // Verify membership first
    try {
      await ChatService.getUnreadState(conversationId, userId);
    } catch (err: any) {
      res.status(403).json({ error: err.message });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', conversationId })}\n\n`);

    const onMessageListener = (msg: any) => {
      res.write(`data: ${JSON.stringify({ type: 'MESSAGE', ...msg })}\n\n`);
    };

    ChatService.onMessage(conversationId, onMessageListener);

    req.on('close', () => {
      ChatService.offMessage(conversationId, onMessageListener);
    });
  }
}
