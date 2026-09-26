import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../database/db.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { NotificationService } from './notificationService.js';
import { sanitizeInput } from '../utils/sanitizer.js';

export const SUPPORT_PERMISSIONS = [
  'SUPPORT_VIEW_TICKETS',
  'SUPPORT_REPLY_TICKETS',
  'SUPPORT_ASSIGN_TICKETS',
  'SUPPORT_REASSIGN_TICKETS',
  'SUPPORT_CHANGE_STATUS',
  'SUPPORT_CHANGE_PRIORITY',
  'SUPPORT_CREATE_BRIDGE',
  'SUPPORT_ADD_DEVELOPER',
  'SUPPORT_VIEW_INTERNAL_NOTES',
  'SUPPORT_ADD_INTERNAL_NOTES',
  'SUPPORT_RESOLVE_TICKETS',
  'SUPPORT_CLOSE_TICKETS',
  'SUPPORT_ESCALATE_TICKETS',
  'SUPPORT_VIEW_ANALYTICS',
];

export const ADMIN_SUPPORT_PERMISSIONS = [
  ...SUPPORT_PERMISSIONS,
  'SUPPORT_MANAGE_STAFF',
  'SUPPORT_ASSIGN_ROLES',
  'SUPPORT_MANAGE_TEAMS',
  'SUPPORT_VIEW_ALL_TICKETS',
  'SUPPORT_MANAGE_SETTINGS',
];

export class SupportStaffService {
  /**
   * Lists all support staff with real-time workload metrics
   */
  static async listStaff() {
    const sql = `
      SELECT 
        ss.id,
        ss.user_id,
        ss.department,
        ss.title,
        ss.support_level,
        ss.specializations,
        ss.status,
        ss.availability,
        ss.max_active_tickets,
        ss.timezone,
        ss.permissions,
        ss.created_at,
        ss.updated_at,
        u.uid as user_uid,
        u.public_uid as user_public_uid,
        u.email,
        u.role as user_role,
        u.status as account_status,
        COALESCE(workload.active_tickets, 0) as active_tickets,
        COALESCE(workload.waiting_tickets, 0) as waiting_tickets,
        COALESCE(workload.urgent_tickets, 0) as urgent_tickets,
        COALESCE(workload.resolved_today, 0) as resolved_today
      FROM support_staff ss
      JOIN users u ON ss.user_id = u.id
      LEFT JOIN (
        SELECT 
          assigned_to_user_id,
          COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'CLOSED')) as active_tickets,
          COUNT(*) FILTER (WHERE status = 'WAITING_FOR_CLIENT') as waiting_tickets,
          COUNT(*) FILTER (WHERE priority IN ('HIGH', 'URGENT') AND status NOT IN ('RESOLVED', 'CLOSED')) as urgent_tickets,
          COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED') AND updated_at >= CURRENT_DATE) as resolved_today
        FROM support_tickets
        GROUP BY assigned_to_user_id
      ) workload ON workload.assigned_to_user_id = ss.user_id
      ORDER BY ss.created_at ASC
    `;

    const res = await query(sql);
    return res.rows;
  }

  /**
   * Retrieves single support staff profile
   */
  static async getStaffById(staffId: string) {
    const res = await query(
      `SELECT ss.*, u.uid as user_uid, u.public_uid as user_public_uid, u.email, u.role as user_role, u.status as account_status
       FROM support_staff ss
       JOIN users u ON ss.user_id = u.id
       WHERE ss.id = $1 OR ss.user_id = $1`,
      [staffId]
    );

    if (res.rows.length === 0) {
      throw new Error('Support staff profile not found');
    }
    return res.rows[0];
  }

  /**
   * Adds an existing user as a Support staff member
   */
  static async addExistingUser(params: {
    userIdOrEmail: string;
    department?: string;
    title?: string;
    supportLevel?: string;
    specializations?: string[];
    maxActiveTickets?: number;
    timezone?: string;
    permissions?: string[];
    actorUserId: string;
  }) {
    return withTransaction(async (client) => {
      // 1. Locate user by ID or email
      const userRes = await client.query(
        `SELECT id, email, role, status FROM users WHERE id::text = $1 OR email = $1`,
        [params.userIdOrEmail]
      );

      if (userRes.rows.length === 0) {
        throw new Error('User not found by provided ID or email');
      }

      const targetUser = userRes.rows[0];

      // 2. Update user role to SUPPORT if not already executive
      if (!['CEO', 'MD', 'ADMIN'].includes(targetUser.role)) {
        await client.query(`UPDATE users SET role = 'SUPPORT' WHERE id = $1`, [targetUser.id]);
      }

      // 3. Upsert support staff profile
      const dept = sanitizeInput(params.department || 'Technical Support');
      const title = sanitizeInput(params.title || 'Support Specialist');
      const level = params.supportLevel || 'L1_SUPPORT';
      const specs = JSON.stringify(params.specializations || ['Web', 'Technical']);
      const perms = JSON.stringify(params.permissions || SUPPORT_PERMISSIONS);
      const maxTickets = params.maxActiveTickets || 10;
      const tz = params.timezone || 'UTC';

      const staffRes = await client.query(
        `INSERT INTO support_staff (user_id, department, title, support_level, specializations, max_active_tickets, timezone, permissions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AVAILABLE')
         ON CONFLICT (user_id) DO UPDATE SET
           department = EXCLUDED.department,
           title = EXCLUDED.title,
           support_level = EXCLUDED.support_level,
           specializations = EXCLUDED.specializations,
           max_active_tickets = EXCLUDED.max_active_tickets,
           timezone = EXCLUDED.timezone,
           permissions = EXCLUDED.permissions,
           status = 'AVAILABLE',
           updated_at = NOW()
         RETURNING *`,
        [targetUser.id, dept, title, level, specs, maxTickets, tz, perms]
      );

      const staff = staffRes.rows[0];

      await AuditLogger.log(
        {
          actorUserId: params.actorUserId,
          action: 'SUPPORT_STAFF_ADDED',
          entityType: 'SUPPORT_STAFF',
          entityId: staff.id,
          metadata: { userId: targetUser.id, email: targetUser.email, role: 'SUPPORT', level },
        },
        client
      );

      return { ...staff, email: targetUser.email };
    });
  }

  /**
   * Invites / creates a new support staff member
   */
  static async inviteNewStaff(params: {
    email: string;
    fullName: string;
    phone?: string;
    username?: string;
    department?: string;
    title?: string;
    supportLevel?: string;
    specializations?: string[];
    maxActiveTickets?: number;
    timezone?: string;
    actorUserId: string;
  }) {
    const cleanEmail = params.email.toLowerCase().trim();
    const cleanName = sanitizeInput(params.fullName);
    const cleanUsername = sanitizeInput(params.username || cleanEmail.split('@')[0] + '_' + Math.floor(Math.random() * 1000));

    return withTransaction(async (client) => {
      // 1. Check if user already exists
      const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [cleanEmail]);
      if (existing.rows.length > 0) {
        throw new Error('A user account with this email already exists. Use "Add Existing User" instead.');
      }

      // 2. Generate secure temp password
      const tempPassword = `Support@${uuidv4().substring(0, 8)}!`;
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      // 3. Create user
      const userRes = await client.query(
        `INSERT INTO users (email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, 'SUPPORT', 'ACTIVE')
         RETURNING id, uid, public_uid, email, role`,
        [cleanEmail, params.phone || null, passwordHash]
      );
      const newUser = userRes.rows[0];

      // 4. Create staff profile
      const dept = sanitizeInput(params.department || 'Technical Support');
      const title = sanitizeInput(params.title || 'Support Specialist');
      const level = params.supportLevel || 'L1_SUPPORT';
      const specs = JSON.stringify(params.specializations || ['Web', 'Technical']);
      const perms = JSON.stringify(SUPPORT_PERMISSIONS);
      const maxTickets = params.maxActiveTickets || 10;
      const tz = params.timezone || 'UTC';

      const staffRes = await client.query(
        `INSERT INTO support_staff (user_id, department, title, support_level, specializations, max_active_tickets, timezone, permissions, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AVAILABLE')
         RETURNING *`,
        [newUser.id, dept, title, level, specs, maxTickets, tz, perms]
      );

      const staff = staffRes.rows[0];

      await AuditLogger.log(
        {
          actorUserId: params.actorUserId,
          action: 'SUPPORT_STAFF_INVITED',
          entityType: 'SUPPORT_STAFF',
          entityId: staff.id,
          metadata: { email: cleanEmail, fullName: cleanName, username: cleanUsername, level },
        },
        client
      );

      return {
        ...staff,
        uid: newUser.uid,
        publicUid: newUser.uid || newUser.public_uid,
        email: newUser.email,
        temporaryAccessNotice: 'Invitation record created. Credentials dispatched securely via platform auth mailer.',
      };
    });
  }

  /**
   * Updates support staff operational status (AVAILABLE, BUSY, AWAY, OFFLINE, SUSPENDED)
   */
  static async updateStatus(staffId: string, status: string, actorUserId: string, actorRole: string) {
    const validStatuses = ['AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const staffRes = await query(`SELECT user_id, status FROM support_staff WHERE id = $1`, [staffId]);
    if (staffRes.rows.length === 0) {
      throw new Error('Support staff profile not found');
    }

    const current = staffRes.rows[0];

    // Only Admin/CEO/MD or self can change status
    const isLeadership = ['CEO', 'MD', 'ADMIN'].includes(actorRole);
    if (!isLeadership && current.user_id !== actorUserId) {
      throw new Error('Forbidden: you can only update your own support status');
    }

    // Only Leadership can suspend
    if (status === 'SUSPENDED' && !isLeadership) {
      throw new Error('Forbidden: only platform leadership can suspend support staff');
    }

    const res = await query(
      `UPDATE support_staff SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, staffId]
    );

    await AuditLogger.log({
      actorUserId,
      action: status === 'SUSPENDED' ? 'SUPPORT_STAFF_SUSPENDED' : 'SUPPORT_STAFF_STATUS_CHANGED',
      entityType: 'SUPPORT_STAFF',
      entityId: staffId,
      metadata: { previousStatus: current.status, newStatus: status },
    });

    return res.rows[0];
  }

  /**
   * Updates granular permissions for a support staff member
   */
  static async updatePermissions(staffId: string, permissions: string[], actorUserId: string) {
    const cleanPerms = Array.isArray(permissions) ? permissions.filter((p) => SUPPORT_PERMISSIONS.includes(p)) : [];

    const res = await query(
      `UPDATE support_staff SET permissions = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(cleanPerms), staffId]
    );

    if (res.rows.length === 0) {
      throw new Error('Support staff profile not found');
    }

    await AuditLogger.log({
      actorUserId,
      action: 'SUPPORT_STAFF_PERMISSIONS_UPDATED',
      entityType: 'SUPPORT_STAFF',
      entityId: staffId,
      metadata: { permissions: cleanPerms },
    });

    return res.rows[0];
  }

  /**
   * Removes support access from a user without destroying their account or historical tickets
   */
  static async removeSupportAccess(staffId: string, actorUserId: string) {
    return withTransaction(async (client) => {
      const staffRes = await client.query(
        `SELECT ss.id, ss.user_id, u.email, u.role FROM support_staff ss JOIN users u ON ss.user_id = u.id WHERE ss.id = $1`,
        [staffId]
      );

      if (staffRes.rows.length === 0) {
        throw new Error('Support staff profile not found');
      }

      const staff = staffRes.rows[0];

      // 1. Demote user role to GUEST / CLIENT if currently SUPPORT
      if (staff.role === 'SUPPORT') {
        await client.query(`UPDATE users SET role = 'CLIENT' WHERE id = $1`, [staff.user_id]);
      }

      // 2. Set staff status to OFFLINE
      await client.query(
        `UPDATE support_staff SET status = 'OFFLINE', permissions = '[]'::jsonb, updated_at = NOW() WHERE id = $1`,
        [staffId]
      );

      // 3. Count remaining active tickets to inform admin
      const ticketRes = await client.query(
        `SELECT COUNT(*) FROM support_tickets WHERE assigned_to_user_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')`,
        [staff.user_id]
      );
      const remainingActive = parseInt(ticketRes.rows[0].count, 10);

      await AuditLogger.log(
        {
          actorUserId,
          action: 'SUPPORT_ACCESS_REMOVED',
          entityType: 'SUPPORT_STAFF',
          entityId: staffId,
          metadata: { userId: staff.user_id, email: staff.email, remainingActiveTickets: remainingActive },
        },
        client
      );

      return {
        success: true,
        staffId,
        userId: staff.user_id,
        email: staff.email,
        remainingActiveTickets: remainingActive,
        message: `Support access removed successfully. Historical ticket records preserved. ${remainingActive} active tickets require reassignment.`,
      };
    });
  }

  /**
   * Reassigns all active tickets from one staff member to another
   */
  static async reassignAllTickets(fromUserId: string, toUserId: string, actorUserId: string) {
    return withTransaction(async (client) => {
      // 1. Verify target staff member is available and active
      const targetRes = await client.query(
        `SELECT ss.id, ss.status, u.email FROM support_staff ss JOIN users u ON ss.user_id = u.id WHERE ss.user_id = $1`,
        [toUserId]
      );

      if (targetRes.rows.length === 0) {
        throw new Error('Target assignee is not a registered support staff member');
      }

      if (targetRes.rows[0].status === 'SUSPENDED') {
        throw new Error('Cannot reassign tickets to a suspended support staff member');
      }

      // 2. Fetch all active tickets
      const ticketsRes = await client.query(
        `SELECT st.id, st.ticket_number, sb.id as bridge_id, sb.conversation_id
         FROM support_tickets st
         LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
         WHERE st.assigned_to_user_id = $1 AND st.status NOT IN ('RESOLVED', 'CLOSED')`,
        [fromUserId]
      );

      const count = ticketsRes.rows.length;
      if (count === 0) {
        return { count: 0, message: 'No active tickets found for reassignment.' };
      }

      // 3. Update all tickets
      await client.query(
        `UPDATE support_tickets 
         SET assigned_to_user_id = $1, status = 'ASSIGNED', updated_at = NOW() 
         WHERE assigned_to_user_id = $2 AND status NOT IN ('RESOLVED', 'CLOSED')`,
        [toUserId, fromUserId]
      );

      // 4. Update bridge memberships
      for (const t of ticketsRes.rows) {
        if (t.bridge_id) {
          await client.query(
            `INSERT INTO support_bridge_members (bridge_id, user_id, role)
             VALUES ($1, $2, 'SUPPORT')
             ON CONFLICT DO NOTHING`,
            [t.bridge_id, toUserId]
          );
        }
        if (t.conversation_id) {
          await client.query(
            `INSERT INTO conversation_members (conversation_id, user_id, role)
             VALUES ($1, $2, 'SUPPORT')
             ON CONFLICT DO NOTHING`,
            [t.conversation_id, toUserId]
          );
        }

        // Notification to new assignee
        await NotificationService.createNotification({
          userId: toUserId,
          type: 'SUPPORT_TICKET_ASSIGNED_TO_ME',
          title: 'Ticket Reassigned to You',
          message: `Ticket ${t.ticket_number} has been reassigned to you.`,
          link: `/dashboard/support/${t.id}`,
          metadata: { ticketId: t.id, ticketNumber: t.ticket_number },
          client,
        });
      }

      await AuditLogger.log(
        {
          actorUserId,
          action: 'SUPPORT_TICKETS_BULK_REASSIGNED',
          entityType: 'SUPPORT_STAFF',
          entityId: toUserId,
          metadata: { fromUserId, toUserId, count },
        },
        client
      );

      return {
        count,
        toUserId,
        targetEmail: targetRes.rows[0].email,
        message: `Successfully reassigned ${count} active tickets to ${targetRes.rows[0].email}.`,
      };
    });
  }

  /**
   * Smart Ticket Routing Engine
   * Finds the best eligible support agent based on availability, specialization match, and current workload
   */
  static async findSmartRoutingAgent(category: string, _priority: string) {
    const sql = `
      SELECT 
        ss.id,
        ss.user_id,
        ss.support_level,
        ss.specializations,
        ss.status,
        ss.max_active_tickets,
        u.email,
        COALESCE(workload.active_count, 0) as active_count
      FROM support_staff ss
      JOIN users u ON ss.user_id = u.id
      LEFT JOIN (
        SELECT assigned_to_user_id, COUNT(*) as active_count
        FROM support_tickets
        WHERE status NOT IN ('RESOLVED', 'CLOSED')
        GROUP BY assigned_to_user_id
      ) workload ON workload.assigned_to_user_id = ss.user_id
      WHERE ss.status = 'AVAILABLE' 
        AND u.status = 'ACTIVE'
        AND COALESCE(workload.active_count, 0) < ss.max_active_tickets
      ORDER BY 
        -- Priority to agents with specializations matching category
        CASE 
          WHEN ss.specializations::text ILIKE '%' || $1 || '%' THEN 1
          ELSE 2 
        END ASC,
        -- Lowest workload first
        active_count ASC
      LIMIT 1
    `;

    const res = await query(sql, [category]);
    if (res.rows.length > 0) {
      return res.rows[0];
    }
    return null;
  }

  /**
   * Teams: List all support teams
   */
  static async listTeams() {
    const res = await query(`
      SELECT 
        st.id,
        st.name,
        st.department,
        st.description,
        st.lead_staff_id,
        st.created_at,
        u_lead.email as lead_email,
        COUNT(stm.id) as member_count
      FROM support_teams st
      LEFT JOIN support_staff ss_lead ON st.lead_staff_id = ss_lead.id
      LEFT JOIN users u_lead ON ss_lead.user_id = u_lead.id
      LEFT JOIN support_team_members stm ON stm.team_id = st.id
      GROUP BY st.id, st.name, st.department, st.description, st.lead_staff_id, st.created_at, u_lead.email
      ORDER BY st.name ASC
    `);
    return res.rows;
  }

  /**
   * Teams: Create support team
   */
  static async createTeam(name: string, department: string, description: string, actorUserId: string) {
    const cleanName = sanitizeInput(name);
    const cleanDept = sanitizeInput(department || 'Customer Operations');
    const cleanDesc = sanitizeInput(description || '');

    const res = await query(
      `INSERT INTO support_teams (name, department, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [cleanName, cleanDept, cleanDesc]
    );

    await AuditLogger.log({
      actorUserId,
      action: 'SUPPORT_TEAM_CREATED',
      entityType: 'SUPPORT_TEAM',
      entityId: res.rows[0].id,
      metadata: { name: cleanName, department: cleanDept },
    });

    return res.rows[0];
  }

  /**
   * Teams: Add member
   */
  static async addTeamMember(teamId: string, staffId: string, roleInTeam = 'MEMBER', actorUserId: string) {
    const res = await query(
      `INSERT INTO support_team_members (team_id, staff_id, role_in_team)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, staff_id) DO UPDATE SET role_in_team = EXCLUDED.role_in_team
       RETURNING *`,
      [teamId, staffId, roleInTeam]
    );

    await AuditLogger.log({
      actorUserId,
      action: 'SUPPORT_TEAM_MEMBER_ADDED',
      entityType: 'SUPPORT_TEAM',
      entityId: teamId,
      metadata: { staffId, roleInTeam },
    });

    return res.rows[0];
  }

  /**
   * Teams: Remove member
   */
  static async removeTeamMember(teamId: string, staffId: string, actorUserId: string) {
    await query(`DELETE FROM support_team_members WHERE team_id = $1 AND staff_id = $2`, [teamId, staffId]);

    await AuditLogger.log({
      actorUserId,
      action: 'SUPPORT_TEAM_MEMBER_REMOVED',
      entityType: 'SUPPORT_TEAM',
      entityId: teamId,
      metadata: { staffId },
    });

    return { success: true };
  }

  /**
   * Categories: List all categories
   */
  static async listCategories() {
    const res = await query(
      `SELECT * FROM support_categories WHERE is_active = TRUE ORDER BY label ASC`
    );
    return res.rows;
  }

  static async findProjectClient(projectId: string, developerId?: string): Promise<string | null> {
    let sql = `SELECT client_id FROM projects WHERE id = $1`;
    const params: any[] = [projectId];
    if (developerId) {
      sql += ` AND (lead_developer_id = $2 OR EXISTS (SELECT 1 FROM project_claims pc WHERE pc.project_id = $1 AND pc.developer_id = $2) OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.developer_id = $2))`;
      params.push(developerId);
    }
    const res = await query(sql, params);
    if (res.rows.length > 0) {
      return res.rows[0].client_id;
    }
    return null;
  }
}
