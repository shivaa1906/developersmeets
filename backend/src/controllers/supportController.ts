import { Response } from 'express';
import { SupportService } from '../services/supportService.js';
import { AuthenticatedRequest } from '../types/index.js';

export class SupportController {
  static async createTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    const clientId = req.user?.clientId;
    if (!clientId) {
      res.status(403).json({ error: 'Client account required to create support ticket' });
      return;
    }

    const { projectId, subject, description, priority, preferredTicketNumber, preferredBridgeNumber } = req.body;
    if (!projectId || !subject || !description) {
      res.status(400).json({ error: 'projectId, subject, and description are required' });
      return;
    }

    try {
      const ticket = await SupportService.createTicket(
        clientId,
        req.user!.userId,
        projectId,
        subject,
        description,
        priority,
        preferredTicketNumber,
        preferredBridgeNumber
      );
      res.status(201).json({ ticket });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async listTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tickets = await SupportService.getTickets({
        userId: req.user!.userId,
        role: req.user!.role,
        clientId: req.user?.clientId,
        developerId: req.user?.developerId,
      });
      res.json({ tickets });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async assignTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;

    if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only support agents or leadership can assign tickets' });
      return;
    }

    try {
      const result = await SupportService.assignTicket(ticketId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getBridge(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { bridgeId } = req.params;

    try {
      const bridge = await SupportService.getBridge(bridgeId, {
        userId: req.user!.userId,
        role: req.user!.role,
        clientId: req.user?.clientId,
        developerId: req.user?.developerId,
      });
      res.json(bridge);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Access denied')) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async sendBridgeMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { bridgeId } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    try {
      const result = await SupportService.sendBridgeMessage(bridgeId, req.user!.userId, message);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Access denied')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async updateStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;
    const { status } = req.body;

    if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only support agents or leadership can change ticket status' });
      return;
    }

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    try {
      const ticket = await SupportService.updateStatus(ticketId, status, req.user!.userId);
      res.json({ ticket });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
