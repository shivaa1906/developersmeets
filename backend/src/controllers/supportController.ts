import { Response } from 'express';
import { SupportService } from '../services/supportService.js';
import { SupportStaffService } from '../services/supportStaffService.js';
import { AuthenticatedRequest } from '../types/index.js';
import { query } from '../database/db.js';

export class SupportController {
  static async createTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    const {
      projectId,
      subject,
      description,
      priority,
      category,
      attachments,
      preferredTicketNumber,
      preferredBridgeNumber,
    } = req.body;

    if (!subject || !description) {
      res.status(400).json({ error: 'subject and description are required' });
      return;
    }

    let clientId = req.user?.clientId;
    if (!clientId && req.user?.role === 'CLIENT') {
      const cRes = await query('SELECT id FROM clients WHERE user_id = $1', [req.user.userId]);
      if (cRes.rows.length > 0) {
        clientId = cRes.rows[0].id;
      }
    }

    let developerId = req.user?.developerId;
    if (!developerId && req.user?.role === 'DEVELOPER') {
      const dRes = await query('SELECT id FROM developers WHERE user_id = $1', [req.user.userId]);
      if (dRes.rows.length > 0) {
        developerId = dRes.rows[0].id;
      }
    }

    // Role-specific validation
    if (req.user?.role === 'CLIENT') {
      if (!clientId) {
        res.status(403).json({ error: 'Client account required' });
        return;
      }
      if (projectId) {
        const projCheck = await query('SELECT id FROM projects WHERE id = $1 AND client_id = $2', [projectId, clientId]);
        if (projCheck.rows.length === 0) {
          res.status(403).json({ error: 'Forbidden: You do not own this project.' });
          return;
        }
      }
    } else if (req.user?.role === 'DEVELOPER') {
      if (!developerId) {
        res.status(403).json({ error: 'Developer profile required' });
        return;
      }
      if (projectId) {
        const projRes = await SupportStaffService.findProjectClient(projectId, developerId);
        if (projRes) {
          clientId = projRes;
        } else {
          res.status(403).json({ error: 'Forbidden: You are not an authorized or claimed developer on this project.' });
          return;
        }
      }
    } else if (['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(req.user?.role || '')) {
      if (projectId) {
        clientId = (await SupportStaffService.findProjectClient(projectId)) || undefined;
      }
    } else {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const ticket = await SupportService.createTicket(
        clientId || null,
        req.user!.userId,
        projectId || null,
        subject,
        description,
        priority,
        preferredTicketNumber,
        preferredBridgeNumber,
        category,
        attachments,
        developerId || null
      );
      res.status(201).json({ ticket });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async listTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { search, status, priority, category, assigned } = req.query;

    try {
      const tickets = await SupportService.getTickets(
        {
          userId: req.user!.userId,
          role: req.user!.role,
          clientId: req.user?.clientId,
          developerId: req.user?.developerId,
        },
        {
          search: typeof search === 'string' ? search : undefined,
          status: typeof status === 'string' ? status : undefined,
          priority: typeof priority === 'string' ? priority : undefined,
          category: typeof category === 'string' ? category : undefined,
          assigned: typeof assigned === 'string' ? assigned : undefined,
        }
      );
      res.json({ tickets });
    } catch (error: any) {
      if (error.message?.includes('Forbidden') || error.message?.includes('Access denied')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  static async getTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;

    try {
      const ticket = await SupportService.getTicketById(ticketId, {
        userId: req.user!.userId,
        role: req.user!.role,
        clientId: req.user?.clientId,
        developerId: req.user?.developerId,
      });
      res.json({ ticket });
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

  static async updateStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    try {
      const ticket = await SupportService.updateStatus(
        ticketId,
        status,
        req.user!.userId,
        req.user!.role,
        req.user?.clientId
      );
      res.json({ ticket });
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async uploadAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;
    const { fileName, fileUrl, fileSize, mimeType } = req.body;

    if (!fileName || !fileUrl) {
      res.status(400).json({ error: 'fileName and fileUrl are required' });
      return;
    }

    try {
      const attachment = await SupportService.uploadAttachment(
        ticketId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          clientId: req.user?.clientId,
          developerId: req.user?.developerId,
        },
        {
          fileName,
          fileUrl,
          fileSize: Number(fileSize || 0),
          mimeType: mimeType || 'application/octet-stream',
        }
      );
      res.status(201).json({ attachment });
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Access denied')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async getAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId, attachmentId } = req.params;

    try {
      const attachment = await SupportService.getAttachment(ticketId, attachmentId, {
        userId: req.user!.userId,
        role: req.user!.role,
        clientId: req.user?.clientId,
        developerId: req.user?.developerId,
      });
      res.json({ attachment });
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

  static async updateInternalNotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;
    const { notes } = req.body;

    if (!notes) {
      res.status(400).json({ error: 'Notes content is required' });
      return;
    }

    try {
      const result = await SupportService.updateInternalNotes(
        ticketId,
        notes,
        req.user!.userId,
        req.user!.role
      );
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
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
    const { message, attachmentUrl } = req.body;

    if (!message || message.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' });
      return;
    }

    try {
      const result = await SupportService.sendBridgeMessage(bridgeId, req.user!.userId, message, attachmentUrl);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Access denied')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async listCategories(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const categories = await SupportStaffService.listCategories();
      res.json({ categories });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async escalateTicket(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { ticketId } = req.params;
    const { reason, escalationLevel, newAssignedToUserId } = req.body;

    if (!reason || !escalationLevel) {
      res.status(400).json({ error: 'reason and escalationLevel are required' });
      return;
    }

    try {
      const result = await SupportService.escalateTicket({
        ticketId,
        actorUserId: req.user!.userId,
        actorRole: req.user!.role,
        reason,
        escalationLevel,
        newAssignedToUserId,
      });
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async listStaff(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only support staff or leadership can view staff directory' });
      return;
    }

    try {
      const staff = await SupportStaffService.listStaff();
      res.json({ staff });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async addStaff(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can assign support staff roles' });
      return;
    }

    const { userIdOrEmail, department, title, supportLevel, specializations, maxActiveTickets, timezone, permissions } = req.body;
    if (!userIdOrEmail) {
      res.status(400).json({ error: 'userIdOrEmail is required' });
      return;
    }

    try {
      const staff = await SupportStaffService.addExistingUser({
        userIdOrEmail,
        department,
        title,
        supportLevel,
        specializations,
        maxActiveTickets,
        timezone,
        permissions,
        actorUserId: req.user!.userId,
      });
      res.status(201).json({ staff });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async inviteStaff(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can invite new support staff' });
      return;
    }

    const { email, fullName, phone, username, department, title, supportLevel, specializations, maxActiveTickets, timezone } = req.body;
    if (!email || !fullName) {
      res.status(400).json({ error: 'email and fullName are required' });
      return;
    }

    try {
      const staff = await SupportStaffService.inviteNewStaff({
        email,
        fullName,
        phone,
        username,
        department,
        title,
        supportLevel,
        specializations,
        maxActiveTickets,
        timezone,
        actorUserId: req.user!.userId,
      });
      res.status(201).json({ staff });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async updateStaffStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { staffId } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }

    try {
      const staff = await SupportStaffService.updateStatus(
        staffId,
        status,
        req.user!.userId,
        req.user!.role
      );
      res.json({ staff });
    } catch (error: any) {
      if (error.message.includes('Forbidden')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  static async updateStaffPermissions(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can manage support permissions' });
      return;
    }

    const { staffId } = req.params;
    const { permissions } = req.body;

    if (!Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions must be an array' });
      return;
    }

    try {
      const staff = await SupportStaffService.updatePermissions(staffId, permissions, req.user!.userId);
      res.json({ staff });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async suspendStaff(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can suspend support staff' });
      return;
    }

    const { staffId } = req.params;

    try {
      const staff = await SupportStaffService.updateStatus(staffId, 'SUSPENDED', req.user!.userId, req.user!.role);
      res.json({ staff, message: 'Support staff suspended successfully.' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async removeStaffAccess(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can revoke support access' });
      return;
    }

    const { staffId } = req.params;

    try {
      const result = await SupportStaffService.removeSupportAccess(staffId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async reassignStaffTickets(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only leadership or support managers can bulk reassign tickets' });
      return;
    }

    const { fromUserId, toUserId } = req.body;

    if (!fromUserId || !toUserId) {
      res.status(400).json({ error: 'fromUserId and toUserId are required' });
      return;
    }

    try {
      const result = await SupportStaffService.reassignAllTickets(fromUserId, toUserId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async listTeams(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const teams = await SupportStaffService.listTeams();
      res.json({ teams });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can create support teams' });
      return;
    }

    const { name, department, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    try {
      const team = await SupportStaffService.createTeam(name, department, description, req.user!.userId);
      res.status(201).json({ team });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async addTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can manage team memberships' });
      return;
    }

    const { teamId } = req.params;
    const { staffId, roleInTeam } = req.body;

    if (!staffId) {
      res.status(400).json({ error: 'staffId is required' });
      return;
    }

    try {
      const membership = await SupportStaffService.addTeamMember(teamId, staffId, roleInTeam, req.user!.userId);
      res.status(201).json({ membership });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async removeTeamMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '')) {
      res.status(403).json({ error: 'Forbidden: only platform leadership can manage team memberships' });
      return;
    }

    const { teamId, staffId } = req.params;

    try {
      const result = await SupportStaffService.removeTeamMember(teamId, staffId, req.user!.userId);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}
