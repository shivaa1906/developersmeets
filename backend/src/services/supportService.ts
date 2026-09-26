import { withTransaction, query } from '../database/db.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { ChatService } from './chatService.js';
import { NotificationService } from './notificationService.js';

export class SupportService {
  /**
   * Client creates a support ticket for a completed or active project
   */
  static async createTicket(
    clientId: string,
    userId: string,
    projectId: string,
    subject: string,
    description: string,
    priority = 'NORMAL',
    preferredTicketNumber?: string,
    preferredBridgeNumber?: string
  ) {
    return withTransaction(async (client) => {
      // 1. Verify project exists & belongs to client
      const projRes = await client.query(
        `SELECT id, lead_developer_id, title FROM projects WHERE id = $1 AND client_id = $2`,
        [projectId, clientId]
      );

      if (projRes.rows.length === 0) {
        throw new Error('Project not found or not owned by your client account');
      }

      const project = projRes.rows[0];

      // 2. Generate ticket number
      let ticketNumber = preferredTicketNumber;
      if (!ticketNumber) {
        const countRes = await client.query('SELECT COUNT(*) FROM support_tickets');
        const seq = parseInt(countRes.rows[0].count, 10) + 1;
        ticketNumber = `SUP-2026-${String(seq).padStart(4, '0')}`;
      }

      // 3. Create ticket
      const ticketRes = await client.query(
        `INSERT INTO support_tickets (
            ticket_number, project_id, client_id, developer_id, subject, description, priority, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN')
         RETURNING *`,
        [ticketNumber, projectId, clientId, project.lead_developer_id, subject, description, priority]
      );
      const ticket = ticketRes.rows[0];

      // 4. Create support bridge conversation
      const convRes = await client.query(
        `INSERT INTO conversations (project_id, type, status)
         VALUES ($1, 'SUPPORT_BRIDGE', 'ACTIVE')
         RETURNING id`,
        [projectId]
      );
      const conversationId = convRes.rows[0].id;

      // 5. Generate bridge number
      let bridgeNumber = preferredBridgeNumber;
      if (!bridgeNumber) {
        const bridgeCountRes = await client.query('SELECT COUNT(*) FROM support_bridges WHERE bridge_number IS NOT NULL');
        const bridgeSeq = parseInt(bridgeCountRes.rows[0].count, 10) + 1;
        bridgeNumber = `SUPPORT BRIDGE #${String(bridgeSeq).padStart(3, '0')}`;
      }

      // 6. Create support bridge record
      const bridgeRes = await client.query(
        `INSERT INTO support_bridges (ticket_id, bridge_number, conversation_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [ticket.id, bridgeNumber, conversationId]
      );
      const bridgeId = bridgeRes.rows[0].id;

      // Add client to bridge and conversation
      await client.query(
        `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'CLIENT')`,
        [bridgeId, userId]
      );
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, client_id, role)
         VALUES ($1, $2, $3, 'CLIENT')`,
        [conversationId, userId, clientId]
      );

      // Add developer to bridge and conversation if assigned
      if (project.lead_developer_id) {
        const devUserRes = await client.query(
          `SELECT user_id FROM developers WHERE id = $1`,
          [project.lead_developer_id]
        );
        if (devUserRes.rows.length > 0) {
          const devUserId = devUserRes.rows[0].user_id;
          await client.query(
            `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'DEVELOPER')`,
            [bridgeId, devUserId]
          );
          await client.query(
            `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role)
             VALUES ($1, $2, $3, 'DEVELOPER')`,
            [conversationId, devUserId, project.lead_developer_id]
          );

          // Notification to developer
          await NotificationService.createNotification({
            userId: devUserId,
            type: 'SUPPORT_TICKET_OPENED',
            title: 'Support Ticket Opened',
            message: `A support ticket (${ticketNumber}) has been opened for "${project.title}".`,
            link: `/support/tickets/${ticket.id}`,
            metadata: { ticketId: ticket.id, ticketNumber, projectId },
            client,
          });
        }
      }

      // Notification to client confirming ticket creation
      await NotificationService.createNotification({
        userId,
        type: 'SUPPORT_TICKET_CREATED',
        title: 'Support Ticket Created',
        message: `Your support ticket (${ticketNumber}) has been submitted for "${project.title}".`,
        link: `/support/tickets/${ticket.id}`,
        metadata: { ticketId: ticket.id, ticketNumber, projectId },
        client,
      });

      await AuditLogger.log({
        actorUserId: userId,
        action: 'SUPPORT_TICKET_CREATED',
        entityType: 'SUPPORT_TICKET',
        entityId: ticket.id,
        metadata: { ticketNumber, projectId, bridgeId, bridgeNumber },
      });

      return {
        ...ticket,
        bridgeId,
        bridgeNumber,
        conversationId,
      };
    });
  }

  /**
   * Support agent opens and assigns a ticket
   */
  static async assignTicket(ticketId: string, supportUserId: string) {
    return withTransaction(async (client) => {
      // 1. Fetch ticket and bridge
      const tRes = await client.query(
        `SELECT st.*, sb.id as bridge_id, sb.conversation_id
         FROM support_tickets st
         LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
         WHERE st.id = $1 FOR UPDATE OF st`,
        [ticketId]
      );

      if (tRes.rows.length === 0) {
        throw new Error('Support ticket not found');
      }

      const ticket = tRes.rows[0];

      // 2. Update status to ASSIGNED
      await client.query(
        `UPDATE support_tickets SET status = 'ASSIGNED', updated_at = NOW() WHERE id = $1`,
        [ticketId]
      );

      // 3. Add support agent to bridge members and conversation members if not already added
      if (ticket.bridge_id) {
        const memCheck = await client.query(
          `SELECT 1 FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2`,
          [ticket.bridge_id, supportUserId]
        );
        if (memCheck.rows.length === 0) {
          await client.query(
            `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'SUPPORT')`,
            [ticket.bridge_id, supportUserId]
          );
        }

        if (ticket.conversation_id) {
          const convMemCheck = await client.query(
            `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
            [ticket.conversation_id, supportUserId]
          );
          if (convMemCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'SUPPORT')`,
              [ticket.conversation_id, supportUserId]
            );
          }
        }
      }

      await AuditLogger.log({
        actorUserId: supportUserId,
        action: 'SUPPORT_TICKET_ASSIGNED',
        entityType: 'SUPPORT_TICKET',
        entityId: ticketId,
      });

      return {
        ticketId,
        status: 'ASSIGNED',
        supportUserId,
        bridgeId: ticket.bridge_id,
      };
    });
  }

  /**
   * Retrieves support tickets for client, developer, or admin with privacy sanitization
   */
  static async getTickets(user: { userId: string; role: string; clientId?: string; developerId?: string }) {
    let sql = `
      SELECT st.id, st.ticket_number, st.subject, st.description, st.priority, st.status,
             st.created_at, st.updated_at, st.closed_at, st.project_id,
             p.title as project_title,
             sb.id as bridge_id, sb.bridge_number, sb.conversation_id
      FROM support_tickets st
      JOIN projects p ON st.project_id = p.id
      LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
    `;
    const params: any[] = [];

    if (['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(user.role)) {
      sql += ` ORDER BY st.created_at DESC`;
    } else if (user.clientId) {
      params.push(user.clientId);
      sql += ` WHERE st.client_id = $1 ORDER BY st.created_at DESC`;
    } else if (user.developerId) {
      params.push(user.developerId);
      sql += ` WHERE st.developer_id = $1 ORDER BY st.created_at DESC`;
    } else {
      return [];
    }

    const res = await query(sql, params);

    // Apply Privacy sanitization
    return res.rows.map((row) => ({
      ...row,
      clientIdentity: 'Client #001',
      developerIdentity: 'Technical Developer',
      supportAgent: 'Support Agent',
    }));
  }

  /**
   * Retrieves specific support bridge with strict access control and privacy shielding
   */
  static async getBridge(
    bridgeIdOrTicketId: string,
    user: { userId: string; role: string; clientId?: string; developerId?: string }
  ) {
    const bridgeRes = await query(
      `SELECT sb.*, st.ticket_number, st.subject, st.status as ticket_status,
              st.project_id, p.title as project_title, st.client_id, st.developer_id
       FROM support_bridges sb
       JOIN support_tickets st ON sb.ticket_id = st.id
       JOIN projects p ON st.project_id = p.id
       WHERE sb.id::text = $1 OR sb.ticket_id::text = $1`,
      [bridgeIdOrTicketId]
    );

    if (bridgeRes.rows.length === 0) {
      throw new Error('Support bridge not found');
    }

    const bridge = bridgeRes.rows[0];

    // Authorization check
    const isLeadershipOrSupport = ['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(user.role);
    const isClientOwner = Boolean(user.clientId && user.clientId === bridge.client_id);
    const isAssignedDev = Boolean(user.developerId && user.developerId === bridge.developer_id);

    // Also check direct membership in support_bridge_members
    const memCheck = await query(
      `SELECT role FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2`,
      [bridge.id, user.userId]
    );
    const isDirectMember = memCheck.rows.length > 0;

    if (!isLeadershipOrSupport && !isClientOwner && !isAssignedDev && !isDirectMember) {
      throw new Error('Forbidden: Access denied to support bridge');
    }

    // Fetch members with privacy sanitization
    const membersRes = await query(
      `SELECT sbm.role, u.id as user_id,
              CASE
                WHEN sbm.role = 'CLIENT' THEN 'Client'
                WHEN sbm.role = 'DEVELOPER' THEN 'Technical Developer'
                WHEN sbm.role = 'SUPPORT' THEN 'Support Agent'
                ELSE sbm.role
              END as display_role
       FROM support_bridge_members sbm
       JOIN users u ON sbm.user_id = u.id
       WHERE sbm.bridge_id = $1`,
      [bridge.id]
    );

    // Fetch messages from conversation
    let messages: any[] = [];
    if (bridge.conversation_id) {
      const msgRes = await ChatService.getMessages(bridge.conversation_id, user.userId, false);
      messages = msgRes.messages;
    }

    return {
      bridge: {
        id: bridge.id,
        bridgeNumber: bridge.bridge_number,
        ticketId: bridge.ticket_id,
        ticketNumber: bridge.ticket_number,
        subject: bridge.subject,
        ticketStatus: bridge.ticket_status,
        projectTitle: bridge.project_title,
        conversationId: bridge.conversation_id,
        createdAt: bridge.created_at,
        closedAt: bridge.closed_at,
      },
      members: membersRes.rows,
      messages,
    };
  }

  /**
   * Sends a message into the support bridge
   */
  static async sendBridgeMessage(bridgeId: string, userId: string, text: string) {
    const bridgeRes = await query(
      `SELECT sb.*, st.status as ticket_status
       FROM support_bridges sb
       JOIN support_tickets st ON sb.ticket_id = st.id
       WHERE sb.id::text = $1`,
      [bridgeId]
    );

    if (bridgeRes.rows.length === 0) {
      throw new Error('Support bridge not found');
    }

    const bridge = bridgeRes.rows[0];

    // Check membership
    const memCheck = await query(
      `SELECT 1 FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2`,
      [bridge.id, userId]
    );

    if (memCheck.rows.length === 0) {
      // Check leadership
      const userRes = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
      if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(userRes.rows[0]?.role || '')) {
        throw new Error('Forbidden: Access denied to support bridge');
      }
    }

    if (bridge.ticket_status === 'CLOSED') {
      throw new Error('Forbidden: This support ticket is closed. No new messages can be posted.');
    }

    if (!bridge.conversation_id) {
      throw new Error('Support bridge conversation not initialized');
    }

    return ChatService.sendMessage(bridge.conversation_id, userId, text);
  }

  /**
   * Update support ticket status across all 7 lifecycle stages:
   * OPEN -> ASSIGNED -> INVESTIGATING -> WAITING_FOR_CLIENT -> IN_PROGRESS -> RESOLVED -> CLOSED
   */
  static async updateStatus(ticketId: string, status: string, userId: string) {
    const validStatuses = [
      'OPEN',
      'ASSIGNED',
      'INVESTIGATING',
      'WAITING_FOR_CLIENT',
      'IN_PROGRESS',
      'RESOLVED',
      'CLOSED',
    ];

    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid ticket status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    const res = await query(
      `UPDATE support_tickets
       SET status = $1::ticket_status,
           closed_at = CASE WHEN $1::text = 'RESOLVED' OR $1::text = 'CLOSED' THEN NOW() ELSE closed_at END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, ticketId]
    );

    if (res.rows.length === 0) {
      throw new Error('Support ticket not found');
    }

    // If ticket is closed, also close the support bridge and conversation
    if (status === 'CLOSED') {
      const bRes = await query(`SELECT id, conversation_id FROM support_bridges WHERE ticket_id = $1`, [ticketId]);
      if (bRes.rows.length > 0) {
        await query(`UPDATE support_bridges SET closed_at = NOW() WHERE id = $1`, [bRes.rows[0].id]);
        if (bRes.rows[0].conversation_id) {
          await query(
            `UPDATE conversations SET status = 'CLOSED', closed_at = NOW() WHERE id = $1`,
            [bRes.rows[0].conversation_id]
          );
        }
      }
    }

    await AuditLogger.log({
      actorUserId: userId,
      action: 'SUPPORT_TICKET_STATUS_UPDATED',
      entityType: 'SUPPORT_TICKET',
      entityId: ticketId,
      metadata: { newStatus: status },
    });

    return res.rows[0];
  }
}
