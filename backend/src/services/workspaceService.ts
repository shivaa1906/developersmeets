import { withTransaction, query } from '../database/db.js';
import { ROLES } from '../config/constants.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { NotificationService } from './notificationService.js';

export interface WorkspaceUserContext {
  userId: string;
  role: string;
  developerId?: string;
  clientId?: string;
}

export class WorkspaceService {
  /**
   * Helper to verify user authorization to access the project workspace
   */
  static async verifyProjectAccess(projectId: string, user: WorkspaceUserContext) {
    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(user.role as any);

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

    const isClient = user.clientId && user.clientId === project.client_id;
    const isLeadDev = user.developerId && user.developerId === project.lead_developer_id;

    let isTeamMember = false;
    if (user.developerId) {
      const memberRes = await query(
        `SELECT 1 FROM project_members WHERE project_id = $1 AND developer_id = $2`,
        [projectId, user.developerId]
      );
      isTeamMember = memberRes.rows.length > 0;
    }

    if (!isLeadership && !isClient && !isLeadDev && !isTeamMember) {
      throw new Error('Forbidden: Unauthorized access to project workspace');
    }

    return { project, isLeadership, isClient, isLeadDev, isTeamMember };
  }

  /**
   * Retrieves full workspace data encompassing all 9 operational sections:
   * Overview, Requirements, Milestones, Tasks, Files, Messages, Timeline, Payments, Support
   */
  static async getWorkspace(projectId: string, user: WorkspaceUserContext) {
    const { project, isLeadership, isClient } = await this.verifyProjectAccess(projectId, user);

    // 1. Milestones
    const milestonesRes = await query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC, id ASC`,
      [projectId]
    );

    // 2. Project Team Members
    const membersRes = await query(
      `SELECT pm.*, d.username, d.display_name, d.role_title, d.profile_image as avatar_url
       FROM project_members pm
       JOIN developers d ON pm.developer_id = d.id
       WHERE pm.project_id = $1`,
      [projectId]
    );

    // 3. Tasks
    const tasksRes = await query(
      `SELECT t.*, d.username as assignee_username, d.display_name as assignee_name
       FROM project_tasks t
       LEFT JOIN developers d ON t.assignee_developer_id = d.id
       WHERE t.project_id = $1
       ORDER BY t.created_at ASC`,
      [projectId]
    );

    // 4. Files
    const filesRes = await query(
      `SELECT f.*, u.email as uploader_email, u.role as uploader_role
       FROM project_files f
       JOIN users u ON f.uploaded_by_user_id = u.id
       WHERE f.project_id = $1
       ORDER BY f.created_at DESC`,
      [projectId]
    );

    // 5. Messages (Workspace Project Conversation)
    const messagesRes = await query(
      `SELECT m.id, m.conversation_id, m.sender_user_id, m.message, m.message_type, m.created_at,
              u.role as sender_role
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       JOIN users u ON m.sender_user_id = u.id
       WHERE c.project_id = $1 AND c.status = 'ACTIVE'
       ORDER BY m.created_at ASC
       LIMIT 50`,
      [projectId]
    );

    // 6. Timeline Events
    const timeline = await this.buildProjectTimeline(projectId, milestonesRes.rows);

    // 7. Payments
    const paymentsRes = await query(
      `SELECT p.id, p.amount, p.currency, p.status, p.gateway, p.created_at, p.metadata
       FROM payments p
       WHERE p.metadata->>'projectId' = $1
          OR p.user_id = (SELECT user_id FROM clients WHERE id = $2)
       ORDER BY p.created_at DESC`,
      [projectId, project.client_id]
    );

    // 8. Support
    const supportRes = await query(
      `SELECT s.id, s.ticket_number, s.subject, s.description, s.priority, s.status, s.created_at, s.closed_at
       FROM support_tickets s
       WHERE s.project_id = $1
       ORDER BY s.created_at DESC`,
      [projectId]
    );

    // Parse requirements
    let requirementsList: string[] = [];
    if (Array.isArray(project.requirements)) {
      requirementsList = project.requirements;
    } else if (typeof project.requirements === 'string') {
      try {
        requirementsList = JSON.parse(project.requirements);
      } catch {
        requirementsList = [project.requirements];
      }
    }

    let requiredTech: string[] = [];
    if (Array.isArray(project.required_technologies)) {
      requiredTech = project.required_technologies;
    } else if (typeof project.required_technologies === 'string') {
      try {
        requiredTech = JSON.parse(project.required_technologies);
      } catch {
        requiredTech = [project.required_technologies];
      }
    }

    const overview = {
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
      companyName:
        isLeadership || isClient || project.status === 'PUBLISHED'
          ? project.company_name
          : 'Shielded Client',
      leadDeveloper: project.dev_id
        ? {
            id: project.dev_id,
            username: project.dev_username,
            name: project.dev_name,
            title: project.dev_title,
            avatar: project.dev_avatar,
          }
        : null,
      teamMembers: membersRes.rows,
    };

    return {
      // 9 Dedicated Workspace Sections
      overview,
      requirements: requirementsList,
      requiredTechnologies: requiredTech,
      milestones: milestonesRes.rows,
      tasks: tasksRes.rows,
      files: filesRes.rows,
      messages: messagesRes.rows,
      timeline,
      payments: paymentsRes.rows,
      support: supportRes.rows,

      // Retain backwards-compatible root keys
      project: overview,
      teamMembers: membersRes.rows,
    };
  }

  /**
   * Builds chronological project timeline events
   */
  static async buildProjectTimeline(projectId: string, milestones: any[]) {
    const timelineEvents: Array<{
      id: string;
      type: string;
      title: string;
      description: string;
      timestamp: string;
      status?: string;
    }> = [];

    // Milestone events
    for (const m of milestones) {
      timelineEvents.push({
        id: `ms-${m.id}`,
        type: 'MILESTONE',
        title: `Milestone: ${m.title}`,
        description: m.description || `Milestone status: ${m.status}`,
        timestamp: m.completed_at || m.due_date || new Date().toISOString(),
        status: m.status,
      });
    }

    // Audit log events
    const auditRes = await query(
      `SELECT id, action, entity_type, metadata, created_at
       FROM audit_logs
       WHERE entity_id = $1 OR metadata->>'projectId' = $1
       ORDER BY created_at ASC`,
      [projectId]
    );

    for (const log of auditRes.rows) {
      timelineEvents.push({
        id: `audit-${log.id}`,
        type: 'LIFECYCLE_EVENT',
        title: log.action.replace(/_/g, ' '),
        description: `Action ${log.action} on ${log.entity_type}`,
        timestamp: log.created_at,
      });
    }

    return timelineEvents.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Creates a project milestone
   */
  static async createMilestone(
    projectId: string,
    title: string,
    description: string,
    dueDate?: string,
    orderIndex = 0,
    actorUserId?: string
  ) {
    const res = await query(
      `INSERT INTO project_milestones (project_id, title, description, due_date, order_index, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING *`,
      [projectId, title, description, dueDate || null, orderIndex]
    );

    const milestone = res.rows[0];

    if (actorUserId) {
      await AuditLogger.log({
        actorUserId,
        action: 'MILESTONE_CREATED',
        entityType: 'MILESTONE',
        entityId: milestone.id,
        metadata: { projectId, title, orderIndex },
      });
    }

    return milestone;
  }

  /**
   * Updates milestone status with role-based permission validation:
   * - DEVELOPER: can set IN_PROGRESS, SUBMITTED
   * - CLIENT: can set APPROVED, CHANGES_REQUESTED, COMPLETED
   * - LEADERSHIP: can set any status
   */
  static async updateMilestoneStatus(
    milestoneId: string,
    status: string,
    userId: string,
    options?: {
      role?: string;
      developerId?: string;
      clientId?: string;
      feedback?: string;
      submissionNotes?: string;
    }
  ) {
    const allowedStatuses = ['PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'COMPLETED'];
    if (!allowedStatuses.includes(status)) {
      throw new Error(`Invalid milestone status: ${status}. Must be one of: ${allowedStatuses.join(', ')}`);
    }

    // 1. Fetch milestone and parent project
    const mRes = await query(
      `SELECT m.*, p.client_id, p.lead_developer_id, p.id as project_id, p.title as project_title
       FROM project_milestones m
       JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1`,
      [milestoneId]
    );

    if (mRes.rows.length === 0) {
      throw new Error('Milestone not found');
    }

    const milestone = mRes.rows[0];

    // 2. Fetch actor context if not fully passed
    let callerRole = options?.role;
    let callerDevId = options?.developerId;
    let callerClientId = options?.clientId;

    if (!callerRole) {
      const userRes = await query(
        `SELECT u.role, d.id as dev_id, c.id as client_id
         FROM users u
         LEFT JOIN developers d ON u.id = d.user_id
         LEFT JOIN clients c ON u.id = c.user_id
         WHERE u.id = $1`,
        [userId]
      );
      if (userRes.rows.length > 0) {
        callerRole = userRes.rows[0].role;
        callerDevId = userRes.rows[0].dev_id;
        callerClientId = userRes.rows[0].client_id;
      }
    }

    const isLeadership = [ROLES.CEO, ROLES.MD, ROLES.ADMIN].includes(callerRole as any);
    const isClientOwner = Boolean(callerClientId && callerClientId === milestone.client_id);
    const isLeadDev = Boolean(callerDevId && callerDevId === milestone.lead_developer_id);

    let isTeamMember = false;
    if (callerDevId) {
      const memRes = await query(
        `SELECT 1 FROM project_members WHERE project_id = $1 AND developer_id = $2`,
        [milestone.project_id, callerDevId]
      );
      isTeamMember = memRes.rows.length > 0;
    }

    if (!isLeadership && !isClientOwner && !isLeadDev && !isTeamMember) {
      throw new Error('Forbidden: Unauthorized to update this milestone');
    }

    // Role-specific action constraints
    if ((isLeadDev || isTeamMember) && !isLeadership) {
      if (['APPROVED', 'COMPLETED'].includes(status)) {
        throw new Error('Forbidden: Only client or platform leadership can approve or complete milestones');
      }
    }

    if (isClientOwner && !isLeadership) {
      if (['IN_PROGRESS'].includes(status)) {
        throw new Error('Forbidden: Only assigned developers can mark a milestone as IN_PROGRESS');
      }
    }

    // 3. Update milestone status
    const updateRes = await query(
      `UPDATE project_milestones
       SET status = $1::milestone_status,
           completed_at = CASE WHEN $1::text = 'APPROVED' OR $1::text = 'COMPLETED' THEN NOW() ELSE completed_at END
       WHERE id = $2
       RETURNING *`,
      [status, milestoneId]
    );

    const updated = updateRes.rows[0];

    // 4. Notifications & Audit Logs
    const milestoneLink = `/workspace/${milestone.project_id}/milestones`;
    if (status === 'SUBMITTED') {
      const clientUser = await query(`SELECT user_id FROM clients WHERE id = $1`, [milestone.client_id]);
      if (clientUser.rows.length > 0) {
        await NotificationService.createNotification({
          userId: clientUser.rows[0].user_id,
          type: 'MILESTONE_UPDATE',
          title: 'Milestone Submitted for Review',
          message: `Developer submitted milestone "${milestone.title}" for project "${milestone.project_title}". Notes: ${options?.submissionNotes || 'Ready for review.'}`,
          link: milestoneLink,
          metadata: {
            milestoneId,
            projectId: milestone.project_id,
            status: 'SUBMITTED',
          },
        });
      }
    } else if (status === 'CHANGES_REQUESTED') {
      if (milestone.lead_developer_id) {
        const devUser = await query(`SELECT user_id FROM developers WHERE id = $1`, [milestone.lead_developer_id]);
        if (devUser.rows.length > 0) {
          await NotificationService.createNotification({
            userId: devUser.rows[0].user_id,
            type: 'MILESTONE_UPDATE',
            title: 'Changes Requested on Milestone',
            message: `Client requested changes for milestone "${milestone.title}". Feedback: ${options?.feedback || 'Please revise and resubmit.'}`,
            link: milestoneLink,
            metadata: {
              milestoneId,
              projectId: milestone.project_id,
              status: 'CHANGES_REQUESTED',
            },
          });
        }
      }
    } else if (status === 'APPROVED') {
      if (milestone.lead_developer_id) {
        const devUser = await query(`SELECT user_id FROM developers WHERE id = $1`, [milestone.lead_developer_id]);
        if (devUser.rows.length > 0) {
          await NotificationService.createNotification({
            userId: devUser.rows[0].user_id,
            type: 'MILESTONE_UPDATE',
            title: 'Milestone Approved',
            message: `Congratulations! Client approved milestone "${milestone.title}".`,
            link: milestoneLink,
            metadata: {
              milestoneId,
              projectId: milestone.project_id,
              status: 'APPROVED',
            },
          });
        }
      }
    }

    await AuditLogger.log({
      actorUserId: userId,
      action: `MILESTONE_${status}`,
      entityType: 'MILESTONE',
      entityId: milestoneId,
      metadata: {
        projectId: milestone.project_id,
        milestoneTitle: milestone.title,
        previousStatus: milestone.status,
        newStatus: status,
        feedback: options?.feedback,
        submissionNotes: options?.submissionNotes,
      },
    });

    return updated;
  }

  /**
   * Project Files Upload & Access Control
   */
  static async uploadFile(
    projectId: string,
    user: WorkspaceUserContext,
    fileData: {
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      milestoneId?: string;
    }
  ) {
    await this.verifyProjectAccess(projectId, user);

    if (!fileData.fileName || fileData.fileName.trim().length === 0) {
      throw new Error('File name is required');
    }

    if (!fileData.fileUrl || fileData.fileUrl.trim().length === 0) {
      throw new Error('File URL is required');
    }

    if (!fileData.fileSize || fileData.fileSize <= 0) {
      throw new Error('Invalid file size');
    }

    // 50 MB Max Size
    const MAX_SIZE_BYTES = 50 * 1024 * 1024;
    if (fileData.fileSize > MAX_SIZE_BYTES) {
      throw new Error('File size exceeds allowed maximum (50 MB)');
    }

    const ALLOWED_MIME_TYPES = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/zip',
      'application/x-zip-compressed',
      'text/plain',
      'application/json',
      'application/typescript',
      'text/javascript',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!ALLOWED_MIME_TYPES.includes(fileData.mimeType)) {
      throw new Error(`Unsupported or prohibited file type: ${fileData.mimeType}`);
    }

    const dangerousExtensions = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.bin', '.js', '.py', '.apk', '.vbs', '.php', '.jar', '.com'];
    const lowerName = fileData.fileName.toLowerCase();
    const ext = lowerName.lastIndexOf('.') !== -1 ? lowerName.slice(lowerName.lastIndexOf('.')) : '';

    if (dangerousExtensions.includes(ext)) {
      throw new Error(`Upload of executable or dangerous file extension '${ext}' is prohibited.`);
    }

    const safeExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.zip', '.txt', '.json', '.ts', '.docx', '.csv'];
    if (ext && !safeExtensions.includes(ext)) {
      throw new Error(`Unsupported file extension '${ext}'. Allowed extensions: ${safeExtensions.join(', ')}`);
    }

    const res = await query(
      `INSERT INTO project_files (project_id, milestone_id, file_name, file_url, file_size, mime_type, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        projectId,
        fileData.milestoneId || null,
        fileData.fileName,
        fileData.fileUrl,
        fileData.fileSize,
        fileData.mimeType,
        user.userId,
      ]
    );

    const uploadedFile = res.rows[0];

    await AuditLogger.log({
      actorUserId: user.userId,
      action: 'FILE_UPLOADED',
      entityType: 'PROJECT_FILE',
      entityId: uploadedFile.id,
      metadata: {
        projectId,
        fileName: fileData.fileName,
        fileSize: fileData.fileSize,
        mimeType: fileData.mimeType,
      },
    });

    return uploadedFile;
  }

  static async getFiles(projectId: string, user: WorkspaceUserContext) {
    await this.verifyProjectAccess(projectId, user);

    const res = await query(
      `SELECT f.*, u.email as uploader_email, u.role as uploader_role
       FROM project_files f
       JOIN users u ON f.uploaded_by_user_id = u.id
       WHERE f.project_id = $1
       ORDER BY f.created_at DESC`,
      [projectId]
    );

    return res.rows;
  }

  static async getFile(projectId: string, fileId: string, user: WorkspaceUserContext) {
    // Check project workspace authorization
    await this.verifyProjectAccess(projectId, user);

    const res = await query(
      `SELECT f.*, u.email as uploader_email
       FROM project_files f
       JOIN users u ON f.uploaded_by_user_id = u.id
       WHERE f.id = $1 AND f.project_id = $2`,
      [fileId, projectId]
    );

    if (res.rows.length === 0) {
      throw new Error('File not found');
    }

    return res.rows[0];
  }

  /**
   * Project Tasks Operations
   */
  static async createTask(
    projectId: string,
    user: WorkspaceUserContext,
    taskData: {
      title: string;
      description?: string;
      milestoneId?: string;
      assigneeDeveloperId?: string;
    }
  ) {
    await this.verifyProjectAccess(projectId, user);

    if (!taskData.title || taskData.title.trim().length === 0) {
      throw new Error('Task title is required');
    }

    const res = await query(
      `INSERT INTO project_tasks (project_id, milestone_id, title, description, assignee_developer_id, status)
       VALUES ($1, $2, $3, $4, $5, 'TODO')
       RETURNING *`,
      [
        projectId,
        taskData.milestoneId || null,
        taskData.title,
        taskData.description || null,
        taskData.assigneeDeveloperId || null,
      ]
    );

    return res.rows[0];
  }

  static async getTasks(projectId: string, user: WorkspaceUserContext) {
    await this.verifyProjectAccess(projectId, user);

    const res = await query(
      `SELECT t.*, d.username as assignee_username, d.display_name as assignee_name
       FROM project_tasks t
       LEFT JOIN developers d ON t.assignee_developer_id = d.id
       WHERE t.project_id = $1
       ORDER BY t.created_at ASC`,
      [projectId]
    );

    return res.rows;
  }

  static async updateTask(
    taskId: string,
    user: WorkspaceUserContext,
    updates: {
      status?: string;
      title?: string;
      description?: string;
      assigneeDeveloperId?: string;
    }
  ) {
    const tRes = await query(`SELECT project_id FROM project_tasks WHERE id = $1`, [taskId]);
    if (tRes.rows.length === 0) {
      throw new Error('Task not found');
    }

    await this.verifyProjectAccess(tRes.rows[0].project_id, user);

    const allowedStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
    if (updates.status && !allowedStatuses.includes(updates.status)) {
      throw new Error(`Invalid task status: ${updates.status}`);
    }

    const res = await query(
      `UPDATE project_tasks
       SET status = COALESCE($1, status),
           title = COALESCE($2, title),
           description = COALESCE($3, description),
           assignee_developer_id = COALESCE($4, assignee_developer_id),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        updates.status || null,
        updates.title || null,
        updates.description || null,
        updates.assigneeDeveloperId || null,
        taskId,
      ]
    );

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
          await NotificationService.createNotification({
            userId: devUserRes.rows[0].user_id,
            type: 'PROJECT_COMPLETED',
            title: 'Project Completed & Attributed!',
            message: `Congratulations! "${project.title}" has been signed off by the client and is now published to your public portfolio!`,
            link: `/projects/${project.project_number || project.id}`,
            metadata: { projectId, projectCode: project.project_number },
            client,
          });
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
