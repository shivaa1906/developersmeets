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
    try {
      const messages = await ChatService.getMessages(conversationId, req.user!.userId);
      res.json({ messages });
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
}
