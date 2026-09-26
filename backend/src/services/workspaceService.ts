import { withTransaction, query } from '../database/db.js';
import { ROLES } from '../config/constants.js';
import { AuditLogger } from '../utils/auditLogger.js';

export class WorkspaceService {
  /**
   * Retrieves workspace data: project, milestones, team members, deliverables
   */
  static async getWorkspace(projectId: string, user: { userId: string; role: string; developerId?: string; clientId?: string }) {
    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);

    // 1. Fetch project
    const projRes = await query(
      `SELECT p.*, c.client_number, c.company_name,
              d.id as dev_id, d.username as dev_username, d.display_name as dev_name,
              d.role_title as dev_title, d.profile_image as dev_avatar
       FROM projects p
       JOIN clients c ON p.client_id = c.id
       LEFT JOIN developers d ON p.lead_developer_id = d.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projRes.rows.length === 0) {
      throw new Error('Project not found');
    }

    const project = projRes.rows[0];

    // Authorization check
    const isClient = user.clientId && user.clientId === project.client_id;
    const isLeadDev = user.developerId && user.developerId === project.lead_developer_id;
    if (!isLeadership && !isClient && !isLeadDev) {
      throw new Error('Unauthorized access to project workspace');
    }

    // 2. Fetch milestones
    const milestonesRes = await query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC`,
      [projectId]
    );

    // 3. Fetch project members
    const membersRes = await query(
      `SELECT pm.*, d.username, d.display_name, d.role_title, d.profile_image as avatar_url
       FROM project_members pm
       JOIN developers d ON pm.developer_id = d.id
       WHERE pm.project_id = $1`,
      [projectId]
    );

    return {
      project: {
        id: project.id,
        projectNumber: project.project_number,
        title: project.title,
        description: project.description,
        status: project.status,
        category: project.category,
        timeline: project.timeline,
        budgetMin: project.budget_min,
        budgetMax: project.budget_max,
        clientNumber: project.client_number,
        companyName: isLeadership || isClient || project.status === 'PUBLISHED' ? project.company_name : 'Shielded Client',
        leadDeveloper: project.dev_id
          ? {
              id: project.dev_id,
              username: project.dev_username,
              name: project.dev_name,
              title: project.dev_title,
              avatar: project.dev_avatar,
            }
          : null,
      },
      milestones: milestonesRes.rows,
      teamMembers: membersRes.rows,
    };
  }

  /**
   * Creates a project milestone
   */
  static async createMilestone(
    projectId: string,
    title: string,
    description: string,
    dueDate?: string,
    orderIndex = 0
  ) {
    const res = await query(
      `INSERT INTO project_milestones (project_id, title, description, due_date, order_index, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING *`,
      [projectId, title, description, dueDate || null, orderIndex]
    );
    return res.rows[0];
  }

  /**
   * Updates milestone status
   */
  static async updateMilestoneStatus(milestoneId: string, status: string, userId: string) {
    const res = await query(
      `UPDATE project_milestones
       SET status = $1::milestone_status,
           completed_at = CASE WHEN $1::text = 'APPROVED' OR $1::text = 'COMPLETED' THEN NOW() ELSE completed_at END
       WHERE id = $2
       RETURNING *`,
      [status, milestoneId]
    );

    if (res.rows.length === 0) {
      throw new Error('Milestone not found');
    }

    await AuditLogger.log({
      actorUserId: userId,
      action: 'MILESTONE_UPDATED',
      entityType: 'MILESTONE',
      entityId: milestoneId,
      metadata: { newStatus: status },
    });

    return res.rows[0];
  }

  /**
   * Client completes project & unmasks developer attribution
   * Transitions project to COMPLETED and PUBLISHED
   */
  static async completeProject(
    projectId: string,
    clientId: string,
    rating?: number,
    feedback?: string
  ) {
    return withTransaction(async (client) => {
      // 1. Fetch project with lock
      const projRes = await client.query(
        `SELECT id, client_id, lead_developer_id, title FROM projects WHERE id = $1 FOR UPDATE`,
        [projectId]
      );

      if (projRes.rows.length === 0) {
        throw new Error('Project not found');
      }

      const project = projRes.rows[0];
      if (project.client_id !== clientId) {
        throw new Error('Forbidden: Only the project owner can complete the project');
      }

      // 2. Mark all milestones completed
      await client.query(
        `UPDATE project_milestones 
         SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW()) 
         WHERE project_id = $1`,
        [projectId]
      );

      // 3. Update project status to COMPLETED and PUBLISHED for public portfolio attribution
      await client.query(
        `UPDATE projects
         SET status = 'PUBLISHED', updated_at = NOW()
         WHERE id = $1`,
        [projectId]
      );

      // 4. Notify Developer of project completion & public attribution
      if (project.lead_developer_id) {
        const devUserRes = await client.query(
          `SELECT user_id FROM developers WHERE id = $1`,
          [project.lead_developer_id]
        );
        if (devUserRes.rows.length > 0) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, message)
             VALUES ($1, 'PROJECT_COMPLETED', 'Project Completed & Attributed!', $2)`,
            [
              devUserRes.rows[0].user_id,
              `Congratulations! "${project.title}" has been signed off by the client and is now published to your public portfolio!`,
            ]
          );
        }
      }

      // Record client signoff & rating in audit log
      let actorUserId: string | null = null;
      const clientOwnerRes = await client.query(`SELECT user_id FROM clients WHERE id = $1`, [clientId]);
      if (clientOwnerRes.rows.length > 0) {
        actorUserId = clientOwnerRes.rows[0].user_id;
      }

      await AuditLogger.log({
        actorUserId,
        action: 'PROJECT_COMPLETED_AND_ATTRIBUTED',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: { rating: rating || 5, feedback: feedback || 'Completed successfully' },
      });

      return {
        success: true,
        status: 'PUBLISHED',
        message: 'Project successfully completed and published to the public showcase.',
      };
    });
  }
}
