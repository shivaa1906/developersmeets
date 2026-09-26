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

    const { projectId, subject, description, priority } = req.body;
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
        priority
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
