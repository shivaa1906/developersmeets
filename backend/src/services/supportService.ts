import { withTransaction, query } from '../database/db.js';
import { AuditLogger } from '../utils/auditLogger.js';

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
    priority = 'NORMAL'
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
      const countRes = await client.query('SELECT COUNT(*) FROM support_tickets');
      const seq = parseInt(countRes.rows[0].count, 10) + 1;
      const ticketNumber = `SUP-2026-${String(seq).padStart(4, '0')}`;

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

      // 4. Create support bridge
      const bridgeRes = await client.query(
        `INSERT INTO support_bridges (ticket_id) VALUES ($1) RETURNING id`,
        [ticket.id]
      );
      const bridgeId = bridgeRes.rows[0].id;

      // Add client to bridge
      await client.query(
        `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'CLIENT')`,
        [bridgeId, userId]
      );

      // Add developer to bridge if assigned
      if (project.lead_developer_id) {
        const devUserRes = await client.query(
          `SELECT user_id FROM developers WHERE id = $1`,
          [project.lead_developer_id]
        );
        if (devUserRes.rows.length > 0) {
          await client.query(
            `INSERT INTO support_bridge_members (bridge_id, user_id, role) VALUES ($1, $2, 'DEVELOPER')`,
            [bridgeId, devUserRes.rows[0].user_id]
          );

          // Notification to developer
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'SUPPORT_TICKET_OPENED', 'Support Ticket Opened', $2)`,
            [
              devUserRes.rows[0].user_id,
              `A support ticket (${ticketNumber}) has been opened for "${project.title}".`,
            ]
          );
        }
      }

      await AuditLogger.log({
        actorUserId: userId,
        action: 'SUPPORT_TICKET_CREATED',
        entityType: 'SUPPORT_TICKET',
        entityId: ticket.id,
        metadata: { ticketNumber, projectId },
      });

      return ticket;
    });
  }

  /**
   * Retrieves support tickets for client, developer, or admin
   */
  static async getTickets(user: { userId: string; role: string; clientId?: string; developerId?: string }) {
    if (['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(user.role)) {
      const res = await query(
        `SELECT st.*, p.title as project_title, c.client_number
         FROM support_tickets st
         JOIN projects p ON st.project_id = p.id
         JOIN clients c ON st.client_id = c.id
         ORDER BY st.created_at DESC`
      );
      return res.rows;
    }

    if (user.clientId) {
      const res = await query(
        `SELECT st.*, p.title as project_title, c.client_number
         FROM support_tickets st
         JOIN projects p ON st.project_id = p.id
         JOIN clients c ON st.client_id = c.id
         WHERE st.client_id = $1
         ORDER BY st.created_at DESC`,
        [user.clientId]
      );
      return res.rows;
    }

    if (user.developerId) {
      const res = await query(
        `SELECT st.*, p.title as project_title, c.client_number
         FROM support_tickets st
         JOIN projects p ON st.project_id = p.id
         JOIN clients c ON st.client_id = c.id
         WHERE st.developer_id = $1
         ORDER BY st.created_at DESC`,
        [user.developerId]
      );
      return res.rows;
    }

    return [];
  }

  /**
   * Update support ticket status
   */
  static async updateStatus(ticketId: string, status: string, userId: string) {
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
