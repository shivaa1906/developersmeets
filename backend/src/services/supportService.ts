import { withTransaction, query } from '../database/db.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { ChatService } from './chatService.js';
import { NotificationService } from './notificationService.js';
import { sanitizeInput, sanitizeRichText } from '../utils/sanitizer.js';
import { RealtimeEvents } from '../realtime/events.js';
import { SupportStaffService } from './supportStaffService.js';

export class SupportService {
  /**
   * Creates a support ticket for a completed/active project or platform/account/credit support
   */
  static async createTicket(
    clientId: string | null,
    userId: string,
    projectId: string | null,
    subject: string,
    description: string,
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL',
    preferredTicketNumber?: string,
    preferredBridgeNumber?: string,
    category = 'TECHNICAL',
    attachments: any[] = [],
    developerId: string | null = null
  ) {
    return withTransaction(async (client) => {
      let project: any = null;
      let effectiveDevId = developerId || null;
      let effectiveClientId = clientId || null;

      // 1. If project specified, verify existence & ownership
      if (projectId) {
        let projQuery = `SELECT id, lead_developer_id, title, client_id FROM projects WHERE id = $1`;
        const projParams: any[] = [projectId];
        if (clientId) {
          projQuery += ` AND client_id = $2`;
          projParams.push(clientId);
        }
        const projRes = await client.query(projQuery, projParams);

        if (projRes.rows.length === 0) {
          throw new Error('Project not found or not owned by your client account');
        }

        project = projRes.rows[0];
        effectiveClientId = clientId || project.client_id;
        effectiveDevId = developerId || project.lead_developer_id;
      }

      const projectTitle = project ? project.title : 'Platform Operations Support';

      // 2. Generate ticket number
      let ticketNumber = preferredTicketNumber;
      if (!ticketNumber) {
        const countRes = await client.query('SELECT COUNT(*) FROM support_tickets');
        const seq = parseInt(countRes.rows[0].count, 10) + 1;
        ticketNumber = `SUP-2026-${String(seq).padStart(4, '0')}`;
      }

      // 3. Process & validate attachments if provided
      const sanitizedAttachments: any[] = [];
      if (Array.isArray(attachments)) {
        for (const att of attachments) {
          if (att && (att.name || att.fileName)) {
            const fileName = sanitizeInput(att.name || att.fileName);
            const lowerName = fileName.toLowerCase();
            const ext = lowerName.lastIndexOf('.') !== -1 ? lowerName.slice(lowerName.lastIndexOf('.')) : '';
            const dangerousExtensions = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.bin', '.js', '.py', '.apk', '.vbs', '.php', '.jar', '.com'];
            if (dangerousExtensions.includes(ext)) {
              throw new Error(`Upload of executable or dangerous file extension '${ext}' is prohibited.`);
            }
            if (att.size && att.size > 50 * 1024 * 1024) {
              throw new Error('Attachment size exceeds allowed maximum (50 MB)');
            }
            sanitizedAttachments.push({
              id: att.id || `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              fileName,
              fileUrl: att.fileUrl || att.url || `/api/support/attachments/${fileName}`,
              fileSize: att.size || att.fileSize || 0,
              mimeType: att.mimeType || att.type || 'application/octet-stream',
              uploadedAt: new Date().toISOString(),
            });
          }
        }
      }

      // 4. Create ticket with sanitized input
      const cleanSubject = sanitizeInput(subject);
      const cleanDescription = sanitizeRichText(description);

      // Smart routing agent lookup
      const routingAgent = await SupportStaffService.findSmartRoutingAgent(category, priority);
      const initialStatus = routingAgent ? 'ASSIGNED' : 'OPEN';
      const assignedUserId = routingAgent ? routingAgent.user_id : null;

      // SLA hours calculation
      let slaHours = 24;
      if (priority === 'URGENT') slaHours = 2;
      else if (priority === 'HIGH') slaHours = 8;
      else if (priority === 'NORMAL') slaHours = 24;
      else slaHours = 48;

      const ticketRes = await client.query(
        `INSERT INTO support_tickets (
            ticket_number, project_id, client_id, developer_id, subject, description, priority, category, attachments, status, assigned_to_user_id, response_due_at, resolution_due_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + ($12 || ' hours')::interval, NOW() + ($13 || ' hours')::interval)
         RETURNING *`,
        [
          ticketNumber,
          projectId || null,
          effectiveClientId || null,
          effectiveDevId || null,
          cleanSubject,
          cleanDescription,
          priority,
          category,
          JSON.stringify(sanitizedAttachments),
          initialStatus,
          assignedUserId,
          slaHours,
          slaHours * 3,
        ]
      );
      const ticket = ticketRes.rows[0];

      // 5. Create support bridge conversation
      const convRes = await client.query(
        `INSERT INTO conversations (project_id, type, status)
         VALUES ($1, 'SUPPORT_BRIDGE', 'ACTIVE')
         RETURNING id`,
        [projectId || null]
      );
      const conversationId = convRes.rows[0].id;

      // 6. Generate bridge number
      let bridgeNumber = preferredBridgeNumber;
      if (!bridgeNumber) {
        const bridgeCountRes = await client.query('SELECT COUNT(*) FROM support_bridges WHERE bridge_number IS NOT NULL');
        const bridgeSeq = parseInt(bridgeCountRes.rows[0].count, 10) + 1;
        bridgeNumber = `SUPPORT BRIDGE #${String(bridgeSeq).padStart(3, '0')}`;
      }

      // 7. Create support bridge record
      const bridgeRes = await client.query(
        `INSERT INTO support_bridges (ticket_id, bridge_number, conversation_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [ticket.id, bridgeNumber, conversationId]
      );
      const bridgeId = bridgeRes.rows[0].id;

      // 8. Enroll creator into bridge & conversation
      const uRes = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
      const creatorRole = uRes.rows[0]?.role || (effectiveClientId ? 'CLIENT' : 'DEVELOPER');
      await client.query(
        `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, $3)`,
        [bridgeId, userId, creatorRole]
      );
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id, client_id, developer_id, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [conversationId, userId, effectiveClientId || null, effectiveDevId || null, creatorRole]
      );

      // If client exists and is distinct from creator, enroll client
      if (effectiveClientId) {
        const clUserRes = await client.query('SELECT user_id FROM clients WHERE id = $1', [effectiveClientId]);
        const clientUserId = clUserRes.rows[0]?.user_id;
        if (clientUserId && clientUserId !== userId) {
          const cMemCheck = await client.query('SELECT 1 FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2', [bridgeId, clientUserId]);
          if (cMemCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'CLIENT')`,
              [bridgeId, clientUserId]
            );
          }
          const cConvCheck = await client.query('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, clientUserId]);
          if (cConvCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO conversation_members (conversation_id, user_id, client_id, role) VALUES ($1, $2, $3, 'CLIENT')`,
              [conversationId, clientUserId, effectiveClientId]
            );
          }
        }
      }

      // If developer exists and is distinct from creator, enroll developer
      if (effectiveDevId) {
        const devUserRes = await client.query('SELECT user_id FROM developers WHERE id = $1', [effectiveDevId]);
        const devUserId = devUserRes.rows[0]?.user_id;
        if (devUserId && devUserId !== userId) {
          const dMemCheck = await client.query('SELECT 1 FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2', [bridgeId, devUserId]);
          if (dMemCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'DEVELOPER')`,
              [bridgeId, devUserId]
            );
          }
          const dConvCheck = await client.query('SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, devUserId]);
          if (dConvCheck.rows.length === 0) {
            await client.query(
              `INSERT INTO conversation_members (conversation_id, user_id, developer_id, role) VALUES ($1, $2, $3, 'DEVELOPER')`,
              [conversationId, devUserId, effectiveDevId]
            );
          }

          // Notification to counterpart developer
          await NotificationService.createNotification({
            userId: devUserId,
            type: 'SUPPORT_TICKET_OPENED',
            title: 'Support Ticket Opened',
            message: `A support ticket (${ticketNumber}) has been opened for "${projectTitle}".`,
            link: `/dashboard/support/${ticket.id}`,
            metadata: { ticketId: ticket.id, ticketNumber, projectId: projectId || null },
            client,
          });
        }
      }

      // Add routing agent to bridge and send assignment notification if auto-routed
      if (routingAgent) {
        await client.query(
          `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'SUPPORT')`,
          [bridgeId, routingAgent.user_id]
        );
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'SUPPORT')`,
          [conversationId, routingAgent.user_id]
        );
        await NotificationService.createNotification({
          userId: routingAgent.user_id,
          type: 'SUPPORT_TICKET_ASSIGNED_TO_ME',
          title: 'Ticket Assigned to You via Smart Routing',
          message: `Ticket ${ticketNumber} (${cleanSubject}) has been auto-routed and assigned to you.`,
          link: `/dashboard/support/${ticket.id}`,
          metadata: { ticketId: ticket.id, ticketNumber, projectId: projectId || null },
          client,
        });
      }

      // Notification to creator confirming ticket creation
      await NotificationService.createNotification({
        userId,
        type: 'SUPPORT_TICKET_CREATED',
        title: 'Support Ticket Created',
        message: `Your support ticket (${ticketNumber}) has been submitted for "${projectTitle}".`,
        link: `/dashboard/support/${ticket.id}`,
        metadata: { ticketId: ticket.id, ticketNumber, projectId: projectId || null },
        client,
      });

      await AuditLogger.log({
        actorUserId: userId,
        action: 'SUPPORT_TICKET_CREATED',
        entityType: 'SUPPORT_TICKET',
        entityId: ticket.id,
        metadata: { ticketNumber, projectId: projectId || null, bridgeId, bridgeNumber },
      });

      return {
        ...ticket,
        bridgeId,
        bridge_id: bridgeId,
        bridgeNumber,
        bridge_number: bridgeNumber,
        conversationId,
        conversation_id: conversationId,
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
        `SELECT st.*, sb.id as bridge_id, sb.conversation_id, p.title as project_title,
                cl.user_id as client_user_id, d.user_id as dev_user_id
         FROM support_tickets st
         JOIN projects p ON st.project_id = p.id
         JOIN clients cl ON st.client_id = cl.id
         LEFT JOIN developers d ON st.developer_id = d.id
         LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
         WHERE st.id = $1 FOR UPDATE OF st`,
        [ticketId]
      );

      if (tRes.rows.length === 0) {
        throw new Error('Support ticket not found');
      }

      const ticket = tRes.rows[0];

      // 2. Update status to ASSIGNED and assign user
      await client.query(
        `UPDATE support_tickets SET status = 'ASSIGNED', assigned_to_user_id = $1, updated_at = NOW() WHERE id = $2`,
        [supportUserId, ticketId]
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

      // 4. Notifications
      if (ticket.client_user_id) {
        await NotificationService.createNotification({
          userId: ticket.client_user_id,
          type: 'SUPPORT_TICKET_ASSIGNED',
          title: 'Support Agent Assigned',
          message: `A support agent has been assigned to ticket ${ticket.ticket_number}.`,
          link: `/dashboard/support/${ticket.id}`,
          metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number },
          client,
        });
      }

      if (ticket.dev_user_id) {
        await NotificationService.createNotification({
          userId: ticket.dev_user_id,
          type: 'SUPPORT_TICKET_ASSIGNED',
          title: 'Support Agent Assigned to Bridge',
          message: `A support agent joined the support bridge for "${ticket.project_title}".`,
          link: `/dashboard/support/${ticket.id}`,
          metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number },
          client,
        });
      }

      await NotificationService.createNotification({
        userId: supportUserId,
        type: 'SUPPORT_TICKET_ASSIGNED_TO_ME',
        title: 'Ticket Assigned to You',
        message: `You have been assigned to handle support ticket ${ticket.ticket_number} for "${ticket.project_title}".`,
        link: `/admin/support`,
        metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number },
        client,
      });

      await AuditLogger.log({
        actorUserId: supportUserId,
        action: 'SUPPORT_TICKET_ASSIGNED',
        entityType: 'SUPPORT_TICKET',
        entityId: ticketId,
        metadata: { assignedToUserId: supportUserId, ticketNumber: ticket.ticket_number },
      });

      try {
        RealtimeEvents.emitSupportUpdate(ticketId, {
          type: 'TICKET_ASSIGNED',
          payload: { ticketId, status: 'ASSIGNED', assignedToUserId: supportUserId },
        });
        if (ticket.bridge_id) {
          RealtimeEvents.emitSupportUpdate(ticket.bridge_id, {
            type: 'TICKET_ASSIGNED',
            payload: { ticketId, status: 'ASSIGNED', assignedToUserId: supportUserId },
          });
        }
      } catch (_err) {
        // Non-blocking
      }

      return {
        ticketId,
        status: 'ASSIGNED',
        supportUserId,
        bridgeId: ticket.bridge_id,
      };
    });
  }

  /**
   * Retrieves support tickets for client, developer, or admin with filtering and privacy sanitization
   */
  static async getTickets(
    user: { userId: string; role: string; clientId?: string; developerId?: string },
    filters?: { search?: string; status?: string; priority?: string; category?: string; assigned?: string }
  ) {
    let sql = `
      SELECT st.id, st.ticket_number, st.subject, st.description, st.priority, st.status,
             st.category, st.attachments, st.assigned_to_user_id,
             st.created_at, st.updated_at, st.closed_at, st.project_id,
             st.developer_id, st.client_id,
             st.response_due_at, st.resolution_due_at, st.escalated_at, st.escalation_reason,
             COALESCE(p.title, 'Platform Support') as project_title,
             sb.id as bridge_id, sb.bridge_number, sb.conversation_id,
             u_assigned.uid as assigned_agent_uid,
             u_assigned.public_uid as assigned_agent_public_uid,
             u_assigned.email as assigned_agent_email,
             ss.title as assigned_agent_title,
             ss.department as assigned_agent_department
      FROM support_tickets st
      LEFT JOIN projects p ON st.project_id = p.id
      LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
      LEFT JOIN users u_assigned ON st.assigned_to_user_id = u_assigned.id
      LEFT JOIN support_staff ss ON ss.user_id = st.assigned_to_user_id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    const isStaff = ['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(user.role);

    if (isStaff) {
      if (filters?.assigned === 'me') {
        params.push(user.userId);
        conditions.push(`st.assigned_to_user_id = $${params.length}`);
      } else if (filters?.assigned === 'unassigned') {
        conditions.push(`st.assigned_to_user_id IS NULL`);
      } else if (filters?.assigned && filters.assigned !== 'ALL') {
        params.push(filters.assigned);
        conditions.push(`st.assigned_to_user_id = $${params.length}`);
      }
    } else {
      let clId = user.clientId;
      let devId = user.developerId;

      if (user.role === 'CLIENT' && !clId) {
        const cRes = await query('SELECT id FROM clients WHERE user_id = $1', [user.userId]);
        if (cRes.rows.length > 0) clId = cRes.rows[0].id;
      } else if (user.role === 'DEVELOPER' && !devId) {
        const dRes = await query('SELECT id FROM developers WHERE user_id = $1', [user.userId]);
        if (dRes.rows.length > 0) devId = dRes.rows[0].id;
      }

      if (clId) {
        params.push(clId);
        conditions.push(`st.client_id = $${params.length}`);
      } else if (devId) {
        params.push(devId);
        const devIdx = params.length;
        params.push(user.userId);
        const userIdx = params.length;
        conditions.push(`(
          st.developer_id = $${devIdx}
          OR EXISTS (
            SELECT 1 FROM support_bridge_members sbm
            JOIN support_bridges sbb ON sbm.bridge_id = sbb.id
            WHERE sbb.ticket_id = st.id AND sbm.user_id = $${userIdx}
          )
        )`);
      } else {
        return [];
      }
    }

    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`st.status = $${params.length}::ticket_status`);
    }

    if (filters?.priority) {
      params.push(filters.priority);
      conditions.push(`st.priority = $${params.length}::ticket_priority`);
    }

    if (filters?.category) {
      params.push(filters.category);
      conditions.push(`st.category = $${params.length}`);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      const pIdx = params.length;
      conditions.push(`(st.ticket_number ILIKE $${pIdx} OR st.subject ILIKE $${pIdx} OR p.title ILIKE $${pIdx} OR st.description ILIKE $${pIdx})`);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY st.created_at DESC`;

    const res = await query(sql, params);

    return res.rows.map((row) => ({
      ...row,
      clientIdentity: 'Client #001',
      developerIdentity: 'Technical Developer',
      supportAgent: row.assigned_agent_email
        ? (row.assigned_agent_title ? `${row.assigned_agent_title}` : 'Support Agent')
        : 'Unassigned',
    }));
  }

  /**
   * Retrieves single support ticket by ID or Ticket Number with strict authorization
   */
  static async getTicketById(
    ticketId: string,
    user: { userId: string; role: string; clientId?: string; developerId?: string }
  ) {
    const tRes = await query(
      `SELECT st.*, COALESCE(p.title, 'Platform Support') as project_title, p.project_number,
              sb.id as bridge_id, sb.bridge_number, sb.conversation_id,
              u_assigned.uid as assigned_agent_uid,
              u_assigned.public_uid as assigned_agent_public_uid,
              u_assigned.email as assigned_agent_email
       FROM support_tickets st
       LEFT JOIN projects p ON st.project_id = p.id
       LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
       LEFT JOIN users u_assigned ON st.assigned_to_user_id = u_assigned.id
       WHERE st.id::text = $1 OR st.ticket_number = $1`,
      [ticketId]
    );

    if (tRes.rows.length === 0) {
      throw new Error('Support ticket not found');
    }

    const ticket = tRes.rows[0];

    // Authorization check
    const isLeadershipOrSupport = ['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(user.role);
    const isClientOwner = Boolean(user.clientId && user.clientId === ticket.client_id);
    const isAssignedDev = Boolean(user.developerId && user.developerId === ticket.developer_id);

    let isBridgeMember = false;
    if (ticket.bridge_id && user.userId) {
      const bRes = await query('SELECT 1 FROM support_bridge_members WHERE bridge_id = $1 AND user_id = $2', [ticket.bridge_id, user.userId]);
      isBridgeMember = bRes.rows.length > 0;
    }

    if (!isLeadershipOrSupport && !isClientOwner && !isAssignedDev && !isBridgeMember) {
      throw new Error('Forbidden: Access denied to support ticket');
    }

    // Shield internal notes from clients and developers
    const internalNotes = isLeadershipOrSupport ? ticket.internal_notes : undefined;

    return {
      ...ticket,
      internal_notes: internalNotes,
      clientIdentity: 'Client #001',
      developerIdentity: 'Technical Developer',
      supportAgent: ticket.assigned_to_user_id ? 'Support Agent' : 'Unassigned',
    };
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
              st.priority, st.category, st.attachments, st.assigned_to_user_id,
              st.project_id, COALESCE(p.title, 'Platform Support') as project_title, st.client_id, st.developer_id,
              st.internal_notes
       FROM support_bridges sb
       JOIN support_tickets st ON sb.ticket_id = st.id
       LEFT JOIN projects p ON st.project_id = p.id
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
      `SELECT sbm.role, u.id as user_id, u.uid as user_uid, u.public_uid as user_public_uid,
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
        priority: bridge.priority,
        category: bridge.category,
        attachments: bridge.attachments || [],
        projectTitle: bridge.project_title,
        conversationId: bridge.conversation_id,
        createdAt: bridge.created_at,
        closedAt: bridge.closed_at,
        internalNotes: isLeadershipOrSupport ? bridge.internal_notes : undefined,
      },
      members: membersRes.rows,
      messages,
    };
  }

  /**
   * Sends a message into the support bridge
   */
  static async sendBridgeMessage(bridgeId: string, userId: string, text: string, attachmentUrl?: string) {
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

    return ChatService.sendMessage(bridge.conversation_id, userId, text, attachmentUrl);
  }

  /**
   * Update support ticket status across all 7 lifecycle stages:
   * OPEN -> ASSIGNED -> INVESTIGATING -> WAITING_FOR_CLIENT -> IN_PROGRESS -> RESOLVED -> CLOSED
   */
  static async updateStatus(
    ticketId: string,
    status: string,
    userId: string,
    userRole?: string,
    clientId?: string
  ) {
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

    // Determine user role if not provided
    let effectiveRole = userRole;
    if (!effectiveRole) {
      const uRes = await query(`SELECT role FROM users WHERE id = $1`, [userId]);
      effectiveRole = uRes.rows[0]?.role;
    }

    const isLeadershipOrSupport = ['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(effectiveRole || '');

    const ticketCheck = await query(
      `SELECT st.*, cl.user_id as client_user_id, d.user_id as dev_user_id, p.title as project_title, sb.id as bridge_id
       FROM support_tickets st
       JOIN clients cl ON st.client_id = cl.id
       JOIN projects p ON st.project_id = p.id
       LEFT JOIN developers d ON st.developer_id = d.id
       LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
       WHERE st.id = $1`,
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      throw new Error('Support ticket not found');
    }

    const currentTicket = ticketCheck.rows[0];

    // Authorization check
    if (!isLeadershipOrSupport) {
      const isClientOwner = Boolean(
        (clientId && clientId === currentTicket.client_id) ||
        (currentTicket.client_user_id === userId)
      );

      if (isClientOwner && ['RESOLVED', 'CLOSED'].includes(status)) {
        // Allowed: Client confirms resolution or closes own ticket
      } else {
        throw new Error('Forbidden: only support agents, leadership, or the ticket owner (for resolution) can change ticket status');
      }
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

    const updatedTicket = res.rows[0];

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

    // Send notifications based on status change
    if (currentTicket.client_user_id && currentTicket.client_user_id !== userId) {
      let notifTitle = 'Ticket Status Updated';
      let notifMsg = `Support ticket ${currentTicket.ticket_number} status updated to ${status}.`;
      if (status === 'WAITING_FOR_CLIENT') {
        notifTitle = 'Information Requested';
        notifMsg = `Support has requested information regarding ticket ${currentTicket.ticket_number}.`;
      } else if (status === 'IN_PROGRESS') {
        notifTitle = 'Work in Progress';
        notifMsg = `Technical investigation in progress for ticket ${currentTicket.ticket_number}.`;
      } else if (status === 'RESOLVED') {
        notifTitle = 'Ticket Resolved';
        notifMsg = `Support ticket ${currentTicket.ticket_number} has been resolved. Please review and confirm.`;
      } else if (status === 'CLOSED') {
        notifTitle = 'Ticket Closed';
        notifMsg = `Support ticket ${currentTicket.ticket_number} has been closed.`;
      }

      await NotificationService.createNotification({
        userId: currentTicket.client_user_id,
        type: 'SUPPORT_TICKET_STATUS_UPDATED',
        title: notifTitle,
        message: notifMsg,
        link: `/dashboard/support/${ticketId}`,
        metadata: { ticketId, status, ticketNumber: currentTicket.ticket_number },
      });
    }

    if (currentTicket.dev_user_id && currentTicket.dev_user_id !== userId) {
      await NotificationService.createNotification({
        userId: currentTicket.dev_user_id,
        type: 'SUPPORT_TICKET_STATUS_UPDATED',
        title: 'Support Bridge Status Changed',
        message: `Support ticket ${currentTicket.ticket_number} status updated to ${status}.`,
        link: `/dashboard/support/${ticketId}`,
        metadata: { ticketId, status, ticketNumber: currentTicket.ticket_number },
      });
    }

    await AuditLogger.log({
      actorUserId: userId,
      action: 'SUPPORT_TICKET_STATUS_UPDATED',
      entityType: 'SUPPORT_TICKET',
      entityId: ticketId,
      metadata: { previousStatus: currentTicket.status, newStatus: status, ticketNumber: currentTicket.ticket_number },
    });

    try {
      RealtimeEvents.emitSupportUpdate(ticketId, {
        type: 'TICKET_STATUS_UPDATED',
        payload: updatedTicket,
      });

      if (currentTicket.bridge_id) {
        RealtimeEvents.emitSupportUpdate(currentTicket.bridge_id, {
          type: 'TICKET_STATUS_UPDATED',
          payload: updatedTicket,
        });
      }
    } catch (_err) {
      // Non-blocking
    }

    return updatedTicket;
  }

  /**
   * Uploads an attachment to a support ticket with full defensive validation
   */
  static async uploadAttachment(
    ticketId: string,
    user: { userId: string; role: string; clientId?: string; developerId?: string },
    fileData: { fileName: string; fileUrl: string; fileSize: number; mimeType: string }
  ) {
    // 1. Authorize ticket access
    const ticket = await this.getTicketById(ticketId, user);

    if (!fileData.fileName || fileData.fileName.trim().length === 0) {
      throw new Error('File name is required');
    }

    const fileName = sanitizeInput(fileData.fileName);
    const lowerName = fileName.toLowerCase();
    const ext = lowerName.lastIndexOf('.') !== -1 ? lowerName.slice(lowerName.lastIndexOf('.')) : '';

    const dangerousExtensions = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.bin', '.js', '.py', '.apk', '.vbs', '.php', '.jar', '.com'];
    if (dangerousExtensions.includes(ext)) {
      throw new Error(`Upload of executable or dangerous file extension '${ext}' is prohibited.`);
    }

    const safeExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.zip', '.txt', '.json', '.docx', '.csv'];
    if (ext && !safeExtensions.includes(ext)) {
      throw new Error(`Unsupported file extension '${ext}'. Allowed extensions: ${safeExtensions.join(', ')}`);
    }

    const MAX_SIZE = 50 * 1024 * 1024;
    if (fileData.fileSize > MAX_SIZE) {
      throw new Error('File size exceeds allowed maximum (50 MB)');
    }

    const attachmentId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAttachment = {
      id: attachmentId,
      fileName,
      fileUrl: fileData.fileUrl,
      fileSize: fileData.fileSize,
      mimeType: fileData.mimeType,
      uploadedByUserId: user.userId,
      uploadedAt: new Date().toISOString(),
    };

    const currentAttachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
    const updatedAttachments = [...currentAttachments, newAttachment];

    await query(
      `UPDATE support_tickets SET attachments = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(updatedAttachments), ticket.id]
    );

    await AuditLogger.log({
      actorUserId: user.userId,
      action: 'SUPPORT_ATTACHMENT_UPLOADED',
      entityType: 'SUPPORT_TICKET',
      entityId: ticket.id,
      metadata: { fileName, fileSize: fileData.fileSize, attachmentId },
    });

    try {
      RealtimeEvents.emitSupportUpdate(ticket.id, {
        type: 'TICKET_ATTACHMENT_ADDED',
        payload: newAttachment,
      });
      if (ticket.bridge_id) {
        RealtimeEvents.emitSupportUpdate(ticket.bridge_id, {
          type: 'TICKET_ATTACHMENT_ADDED',
          payload: newAttachment,
        });
      }
    } catch (_err) {
      // Non-blocking
    }

    return newAttachment;
  }

  /**
   * Retrieves an attachment with authorization check to prevent IDOR
   */
  static async getAttachment(
    ticketId: string,
    attachmentId: string,
    user: { userId: string; role: string; clientId?: string; developerId?: string }
  ) {
    const ticket = await this.getTicketById(ticketId, user);
    const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
    const found = attachments.find((a: any) => a.id === attachmentId || a.fileName === attachmentId);
    if (!found) {
      throw new Error('Attachment not found');
    }
    return found;
  }

  /**
   * Updates internal support notes (strictly restricted to CEO, MD, ADMIN, SUPPORT)
   */
  static async updateInternalNotes(ticketId: string, notes: string, userId: string, role: string) {
    if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(role)) {
      throw new Error('Forbidden: only support agents or leadership can access internal notes');
    }

    const cleanNotes = sanitizeRichText(notes);
    const res = await query(
      `UPDATE support_tickets SET internal_notes = $1, updated_at = NOW() WHERE id = $2 RETURNING id, ticket_number, internal_notes`,
      [cleanNotes, ticketId]
    );

    if (res.rows.length === 0) {
      throw new Error('Support ticket not found');
    }

    await AuditLogger.log({
      actorUserId: userId,
      action: 'SUPPORT_INTERNAL_NOTES_UPDATED',
      entityType: 'SUPPORT_TICKET',
      entityId: ticketId,
    });

    return res.rows[0];
  }

  /**
   * Escalates a support ticket to a higher tier or technical specialist
   */
  static async escalateTicket(params: {
    ticketId: string;
    actorUserId: string;
    actorRole: string;
    reason: string;
    escalationLevel: string;
    newAssignedToUserId?: string;
  }) {
    if (!['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(params.actorRole)) {
      throw new Error('Forbidden: only support agents or leadership can escalate tickets');
    }

    return withTransaction(async (client) => {
      // 1. Fetch ticket and details
      const tRes = await client.query(
        `SELECT st.*, p.title as project_title, sb.id as bridge_id, sb.conversation_id,
                cl.user_id as client_user_id, d.user_id as dev_user_id
         FROM support_tickets st
         JOIN projects p ON st.project_id = p.id
         JOIN clients cl ON st.client_id = cl.id
         LEFT JOIN developers d ON st.developer_id = d.id
         LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
         WHERE st.id = $1 FOR UPDATE OF st`,
        [params.ticketId]
      );

      if (tRes.rows.length === 0) {
        throw new Error('Support ticket not found');
      }

      const ticket = tRes.rows[0];
      const previousAssignee = ticket.assigned_to_user_id;
      const targetAssignee = params.newAssignedToUserId || previousAssignee;

      // 2. Insert into support_escalations
      await client.query(
        `INSERT INTO support_escalations (
           ticket_id, escalated_by_user_id, previous_assigned_to_user_id, new_assigned_to_user_id, escalation_level, reason
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [ticket.id, params.actorUserId, previousAssignee, targetAssignee, params.escalationLevel, params.reason]
      );

      // 3. Update ticket: transition status to INVESTIGATING, elevate priority, set escalation metadata
      await client.query(
        `UPDATE support_tickets
         SET status = 'INVESTIGATING',
             priority = CASE 
               WHEN priority = 'LOW' THEN 'NORMAL'::ticket_priority 
               WHEN priority = 'NORMAL' THEN 'HIGH'::ticket_priority 
               ELSE 'URGENT'::ticket_priority 
             END,
             escalated_at = NOW(),
             escalated_by = $1,
             escalation_reason = $2,
             assigned_to_user_id = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [params.actorUserId, params.reason, targetAssignee, ticket.id]
      );

      // 4. Enroll new assignee in bridge if reassigned
      if (targetAssignee && ticket.bridge_id) {
        await client.query(
          `INSERT INTO support_bridge_members (bridge_id, user_id, role)
           VALUES ($1, $2, 'SUPPORT')
           ON CONFLICT DO NOTHING`,
          [ticket.bridge_id, targetAssignee]
        );
      }
      if (targetAssignee && ticket.conversation_id) {
        await client.query(
          `INSERT INTO conversation_members (conversation_id, user_id, role)
           VALUES ($1, $2, 'SUPPORT')
           ON CONFLICT DO NOTHING`,
          [ticket.conversation_id, targetAssignee]
        );
      }

      // 5. Notifications
      if (ticket.client_user_id) {
        await NotificationService.createNotification({
          userId: ticket.client_user_id,
          type: 'SUPPORT_TICKET_ESCALATED',
          title: 'Support Ticket Escalated',
          message: `Your ticket ${ticket.ticket_number} has been escalated to ${params.escalationLevel} for prioritized investigation.`,
          link: `/dashboard/support/${ticket.id}`,
          metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number, level: params.escalationLevel },
          client,
        });
      }

      if (targetAssignee && targetAssignee !== params.actorUserId) {
        await NotificationService.createNotification({
          userId: targetAssignee,
          type: 'SUPPORT_TICKET_ASSIGNED_TO_ME',
          title: 'Escalated Ticket Assigned to You',
          message: `Ticket ${ticket.ticket_number} has been escalated to ${params.escalationLevel} and assigned to you.`,
          link: `/dashboard/support/${ticket.id}`,
          metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number, reason: params.reason },
          client,
        });
      }

      await AuditLogger.log(
        {
          actorUserId: params.actorUserId,
          action: 'SUPPORT_TICKET_ESCALATED',
          entityType: 'SUPPORT_TICKET',
          entityId: ticket.id,
          metadata: {
            ticketNumber: ticket.ticket_number,
            escalationLevel: params.escalationLevel,
            reason: params.reason,
            previousAssignee,
            newAssignee: targetAssignee,
          },
        },
        client
      );

      try {
        RealtimeEvents.emitSupportUpdate(ticket.id, {
          type: 'TICKET_ESCALATED',
          payload: { ticketId: ticket.id, escalationLevel: params.escalationLevel, reason: params.reason },
        });
        if (ticket.bridge_id) {
          RealtimeEvents.emitSupportUpdate(ticket.bridge_id, {
            type: 'TICKET_ESCALATED',
            payload: { ticketId: ticket.id, escalationLevel: params.escalationLevel, reason: params.reason },
          });
        }
      } catch (_e) {
        // Non-blocking realtime event notification
      }

      return {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        escalationLevel: params.escalationLevel,
        status: 'INVESTIGATING',
        assignedToUserId: targetAssignee,
      };
    });
  }
}
