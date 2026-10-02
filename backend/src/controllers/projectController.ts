import { Request, Response } from 'express';
import { ProjectService } from '../services/projectService.js';
import { query } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';
import { ROLES } from '../config/constants.js';
import { RealtimeEvents } from '../realtime/events.js';

export class ProjectController {
  /**
   * Public route: Completed/Published projects showcase
   */
  static async listPublished(req: Request, res: Response): Promise<void> {
    try {
      const category = req.query.category as string;
      const search = req.query.search as string;
      const skill = req.query.skill as string;

      let sql = `
        SELECT p.id, p.project_number, p.slug, p.title, p.description, p.category, 
               p.timeline, p.required_technologies, p.status, p.created_at,
               d.username as lead_dev_username, d.display_name as lead_dev_name,
               COALESCE(d.profile_photo, d.profile_image, d.avatar_url) as lead_dev_avatar, d.role_title as lead_dev_title
        FROM projects p
        LEFT JOIN developers d ON p.lead_developer_id = d.id
        WHERE p.status = 'PUBLISHED'
      `;
      const params: any[] = [];
      if (category && category !== 'ALL') {
        params.push(`%${category}%`);
        sql += ` AND p.category ILIKE $${params.length}`;
      }
      if (skill) {
        params.push(`%${skill}%`);
        sql += ` AND p.required_technologies::text ILIKE $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        sql += ` AND (p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.category ILIKE $${params.length} OR p.required_technologies::text ILIKE $${params.length})`;
      }
      sql += ` ORDER BY p.created_at DESC`;

      const projects = await query(sql, params);
      res.json({ projects: projects.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Protected route: Developer marketplace listing
   */
  static async marketplace(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = req.query.category as string;
      const search = req.query.search as string;
      const skill = req.query.skill as string;
      const developerId = (req.query.developerId as string) || req.user?.developerId;
      const eligibleOnly = req.query.eligibleOnly === 'true' || req.query.eligible === 'true';

      const projects = await ProjectService.getMarketplaceProjects({
        category,
        search,
        skill,
        developerId,
        eligibleOnly,
      });
      res.json({ projects });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Single project details by id or slug
   */
  static async getById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const projRes = await query(
        `SELECT p.*, c.client_number, c.company_name, c.private_name, c.phone, u.email as client_email,
                d.username as lead_dev_username, d.display_name as lead_dev_name
         FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         LEFT JOIN users u ON c.user_id = u.id
         LEFT JOIN developers d ON p.lead_developer_id = d.id
         WHERE p.id::text = $1 OR p.slug = $1`,
        [id]
      );

      if (projRes.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const project = projRes.rows[0];

      // Multi-tenant authorization & privacy guard
      const isClientOwner = Boolean(req.user?.clientId && req.user.clientId === project.client_id);
      const isAdmin = ['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '');
      const isPublished = project.status === 'PUBLISHED';

      if (!isAdmin) {
        if (req.user?.role === ROLES.CLIENT) {
          if (!isClientOwner && !isPublished) {
            res.status(403).json({ error: 'Access denied: You do not have permission to view this project.' });
            return;
          }
        } else if (req.user?.role === ROLES.DEVELOPER) {
          if (!isPublished) {
            const isOpenMarketplace = project.status === 'OPEN_FOR_CLAIMS' || project.status === 'CLAIMS_ACTIVE';
            let isAuthorizedDev = false;
            if (req.user?.developerId) {
              if (project.lead_developer_id === req.user.developerId) {
                isAuthorizedDev = true;
              } else {
                const [claimCheck, memberCheck] = await Promise.all([
                  query('SELECT 1 FROM project_claims WHERE project_id = $1 AND developer_id = $2', [project.id, req.user.developerId]),
                  query('SELECT 1 FROM project_members WHERE project_id = $1 AND developer_id = $2', [project.id, req.user.developerId]),
                ]);
                isAuthorizedDev = claimCheck.rows.length > 0 || memberCheck.rows.length > 0;
              }
            }

            if (!isOpenMarketplace && !isAuthorizedDev) {
              res.status(403).json({ error: 'Access denied: You are not authorized to view this project.' });
              return;
            }
          }
        } else if (!isClientOwner && !isPublished) {
          res.status(403).json({ error: 'Access denied: Insufficient permissions to view this project.' });
          return;
        }
      }

      // Identity Shielding: Developers / unprivileged callers must NEVER see real client PII
      if (!isClientOwner && !isAdmin) {
        delete project.private_name;
        delete project.phone;
        delete project.client_email;
        delete project.client_id;

        // Mask company_name unless project has been completed and published to the showcase
        if (project.status !== 'PUBLISHED') {
          delete project.company_name;
        }
      }

      // Check if logged in developer has claimed this project
      let userClaim: any = null;
      if (req.user?.developerId) {
        const claimRes = await query(
          `SELECT * FROM project_claims WHERE project_id = $1 AND developer_id = $2`,
          [project.id, req.user.developerId]
        );
        if (claimRes.rows.length > 0) {
          userClaim = claimRes.rows[0];
        }
      }

      res.json({ project, userClaim });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Client project submission with comprehensive input validation
   */
  static async submit(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user?.role === ROLES.DEVELOPER || req.user?.role === ROLES.SUPPORT) {
      res.status(403).json({
        error:
          req.user.role === ROLES.DEVELOPER
            ? 'Your current account is registered as a Developer. To submit a client project, create or use a Client account.'
            : 'Start a project is available to client accounts.',
      });
      return;
    }

    let clientId = req.user?.clientId;
    if (!clientId && req.user?.userId) {
      // Resolve client from DB or auto-create client record for CLIENT or EXECUTIVE accounts
      const clientRes = await query('SELECT id FROM clients WHERE user_id = $1', [req.user.userId]);
      if (clientRes.rows.length > 0) {
        clientId = clientRes.rows[0].id;
      } else {
        const clientNumSeq = await query(
          `SELECT COALESCE(MAX(SUBSTRING(client_number FROM 10)::int), 0) + 1 AS next_seq FROM clients WHERE client_number ~ '^CLT-2026-[0-9]+$'`
        );
        const nextSeq = clientNumSeq.rows[0]?.next_seq || 1;
        const newClientNumber = `CLT-2026-${String(nextSeq).padStart(4, '0')}`;
        const newClient = await query(
          `INSERT INTO clients (user_id, client_number, company_name, private_name)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [
            req.user.userId,
            newClientNumber,
            req.user.role === ROLES.CLIENT ? 'Client Organization' : `${req.user.role} Executive Office`,
            req.user.email.split('@')[0],
          ]
        );
        clientId = newClient.rows[0].id;
      }
    }

    if (!clientId) {
      res.status(403).json({ error: 'Start a project is available to client accounts.' });
      return;
    }

    try {
      const {
        title,
        category,
        description,
        budgetMin,
        budgetMax,
        timeline,
        requirements,
        requiredTechnologies,
        attachments,
        preferredProjectNumber,
      } = req.body;

      // 1. Title validation (reject empty title)
      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Project title is required and cannot be empty.' });
        return;
      }

      // 2. Category & Description validation
      if (!category || typeof category !== 'string' || !category.trim()) {
        res.status(400).json({ error: 'Project category is required and cannot be empty.' });
        return;
      }

      if (!description || typeof description !== 'string' || !description.trim()) {
        res.status(400).json({ error: 'Project description is required and cannot be empty.' });
        return;
      }

      // 3. Requirements validation (reject empty requirements)
      if (
        !requirements ||
        !Array.isArray(requirements) ||
        requirements.length === 0 ||
        requirements.every((r) => typeof r !== 'string' || !r.trim())
      ) {
        res.status(400).json({
          error: 'Requirements are required and must contain at least one valid specification.',
        });
        return;
      }

      // 4. Budget validation (reject invalid budget, negative budget, budgetMin > budgetMax)
      const parsedMin = Number(budgetMin);
      const parsedMax = Number(budgetMax);

      if (
        budgetMin === undefined ||
        budgetMax === undefined ||
        isNaN(parsedMin) ||
        isNaN(parsedMax) ||
        parsedMin <= 0 ||
        parsedMax <= 0
      ) {
        res.status(400).json({
          error: 'Invalid budget: Both budgetMin and budgetMax must be positive numbers greater than zero.',
        });
        return;
      }

      if (parsedMin > parsedMax) {
        res.status(400).json({
          error: 'Invalid budget: budgetMin cannot exceed budgetMax.',
        });
        return;
      }

      // 5. Timeline validation (reject invalid timeline)
      if (!timeline || typeof timeline !== 'string' || !timeline.trim()) {
        res.status(400).json({ error: 'Project timeline is required and cannot be empty.' });
        return;
      }

      // Validate timeline duration is not negative or zero
      const timelineDaysMatch = timeline.match(/(-?\d+)\s*(?:-|to)?\s*(-?\d+)?\s*days?/i);
      if (timelineDaysMatch) {
        const d1 = parseInt(timelineDaysMatch[1], 10);
        const d2 = timelineDaysMatch[2] ? parseInt(timelineDaysMatch[2], 10) : d1;
        if (d1 <= 0 || d2 <= 0 || d1 > d2) {
          res.status(400).json({
            error: 'Invalid timeline: Timeline duration must be positive and valid.',
          });
          return;
        }
      }

      // 6. Attachment validation (reject huge files > 10MB, unsupported file formats)
      if (attachments && Array.isArray(attachments)) {
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.csv'];
        const PROHIBITED_EXTENSIONS = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.bin', '.js', '.py', '.apk', '.vbs'];

        for (const file of attachments) {
          if (file.size && Number(file.size) > MAX_FILE_SIZE) {
            res.status(400).json({
              error: `File "${file.name || 'attachment'}" exceeds maximum allowed limit of 10MB.`,
            });
            return;
          }

          const filename = (file.name || file.filename || '').toLowerCase();
          const ext = filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';

          if (PROHIBITED_EXTENSIONS.includes(ext) || (ext && !ALLOWED_EXTENSIONS.includes(ext))) {
            res.status(400).json({
              error: `Unsupported file format "${ext}". Upload of executable or disallowed files is prohibited.`,
            });
            return;
          }
        }
      }

      const result = await ProjectService.submitProject(clientId, req.user!.userId, {
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        budgetMin: parsedMin,
        budgetMax: parsedMax,
        timeline: timeline.trim(),
        requirements: requirements.map((r: any) => String(r).trim()).filter(Boolean),
        requiredTechnologies: Array.isArray(requiredTechnologies) ? requiredTechnologies : [],
        attachments: Array.isArray(attachments) ? attachments : [],
        preferredProjectNumber,
      });

      // Broadcast project creation realtime event
      RealtimeEvents.emitProjectCreated({
        id: result.projectId,
        project_number: result.projectNumber,
        status: result.status,
        title: title.trim(),
        category: category.trim(),
        client_id: clientId,
        budget_min: parsedMin,
        budget_max: parsedMax,
      });

      res.status(201).json({
        message: 'Project submitted successfully for administrative review.',
        ...result,
        project: {
          id: result.projectId,
          projectNumber: result.projectNumber,
          status: result.status,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Admin moves project to REVIEWING state (SUBMITTED -> REVIEWING)
   */
  static async review(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { notes } = req.body;

    try {
      const result = await ProjectService.reviewProject(projectId, req.user!.userId, notes);
      res.json({ message: 'Project status transitioned to REVIEWING.', ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Admin approves project (REVIEWING/SUBMITTED -> OPEN_FOR_CLAIMS)
   */
  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { maxClaims, deadlineDays } = req.body;

    try {
      const result = await ProjectService.approveProject(
        projectId,
        req.user!.userId,
        Number(maxClaims) || 5,
        Number(deadlineDays) || 7
      );
      res.json({ message: 'Project approved and opened for developer claims.', ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Client / Leadership project update with strict state protection
   */
  static async updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const clientId = req.user?.clientId;
    const isLeadership = ['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '');

    try {
      const projRes = await query('SELECT * FROM projects WHERE id = $1', [projectId]);
      if (projRes.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const project = projRes.rows[0];

      // Ownership check for clients
      if (!isLeadership && project.client_id !== clientId) {
        res.status(403).json({ error: 'Forbidden: You do not have permission to update this project.' });
        return;
      }

      // State protection: Clients CANNOT manually change status to DEVELOPER_SELECTED, COMPLETED, or PUBLISHED
      const { status: requestedStatus, title, description } = req.body;

      if (!isLeadership && requestedStatus) {
        const protectedStatuses = ['DEVELOPER_SELECTED', 'COMPLETED', 'PUBLISHED', 'OPEN_FOR_CLAIMS', 'IN_PROGRESS'];
        if (protectedStatuses.includes(requestedStatus) || requestedStatus !== project.status) {
          res.status(403).json({
            error: `Forbidden: Clients cannot manually change project status to ${requestedStatus}. Status transitions must follow system workflow rules.`,
          });
          return;
        }
      }

      const updateRes = await query(
        `UPDATE projects
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [title || null, description || null, projectId]
      );

      res.json({ message: 'Project updated successfully.', project: updateRes.rows[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Check developer claim eligibility for project
   */
  static async checkEligibility(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    let developerId = req.user?.developerId;
    const userRole = req.user?.role;
    const isExecutive = userRole === ROLES.CEO || userRole === ROLES.MD || userRole === ROLES.ADMIN;

    if (!developerId && isExecutive && req.user?.userId) {
      developerId = await ProjectService.getOrCreateExecutiveDeveloperId(req.user.userId, userRole, req.user.email);
    }

    if (!developerId && !isExecutive) {
      res.status(403).json({ error: 'Verified developer profile required to check eligibility' });
      return;
    }

    try {
      const eligibility = await ProjectService.checkEligibility(projectId, developerId || '', undefined, isExecutive);
      res.json(eligibility);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Developer claims a project slot (-1 Credit)
   */
  static async claim(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    let developerId = req.user?.developerId;
    const userRole = req.user?.role;
    const isExecutive = userRole === ROLES.CEO || userRole === ROLES.MD || userRole === ROLES.ADMIN;

    if (!developerId && isExecutive && req.user?.userId) {
      developerId = await ProjectService.getOrCreateExecutiveDeveloperId(req.user.userId, userRole, req.user.email);
    }

    if (!developerId) {
      res.status(403).json({ error: 'Verified developer profile required to claim project' });
      return;
    }

    try {
      const result = await ProjectService.claimProject(projectId, developerId, req.user!.userId, isExecutive);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Developer submits a proposal
   */
  static async submitProposal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    let developerId = req.user?.developerId;
    const userRole = req.user?.role;
    const isExecutive = userRole === ROLES.CEO || userRole === ROLES.MD || userRole === ROLES.ADMIN;

    if (!developerId && isExecutive && req.user?.userId) {
      developerId = await ProjectService.getOrCreateExecutiveDeveloperId(req.user.userId, userRole, req.user.email);
    }

    if (!developerId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    try {
      const { approach, timeline, price, milestones, technologies, additionalNotes } = req.body;
      if (!approach || !timeline || !price) {
        res.status(400).json({ error: 'Approach, timeline, and price are required' });
        return;
      }

      const result = await ProjectService.submitProposal(projectId, developerId, {
        approach,
        timeline,
        price: Number(price),
        milestones,
        technologies,
        additionalNotes,
      });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Client / Leadership lists proposals with identity shields
   */
  static async listProposals(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const proposals = await ProjectService.getProposals(projectId, {
        role: req.user!.role,
        clientId: req.user?.clientId,
        developerId: req.user?.developerId,
      });
      res.json({ proposals });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Client selects winning developer
   */
  static async select(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { selectedDeveloperId } = req.body;
    const clientId = req.user?.clientId;

    if (!clientId) {
      res.status(403).json({ error: 'Client account required' });
      return;
    }

    if (!selectedDeveloperId) {
      res.status(400).json({ error: 'selectedDeveloperId is required' });
      return;
    }

    try {
      const result = await ProjectService.selectDeveloper(projectId, selectedDeveloperId, clientId);
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes('Conflict')) {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * User's projects (client projects or developer claimed/member projects)
   */
  static async myProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (req.user?.role === ROLES.CLIENT) {
        if (!req.user?.clientId) {
          res.json({ projects: [] });
          return;
        }
        let sql = `SELECT * FROM projects WHERE client_id = $1`;
        const params: any[] = [req.user.clientId];
        const search = req.query.search as string;
        if (search) {
          params.push(`%${search}%`);
          sql += ` AND (title ILIKE $2 OR description ILIKE $2 OR category ILIKE $2)`;
        }
        sql += ` ORDER BY created_at DESC`;
        const rows = await query(sql, params);
        res.json({ projects: rows.rows });
        return;
      }

      if (req.user?.role === ROLES.DEVELOPER) {
        if (!req.user?.developerId) {
          res.json({ projects: [] });
          return;
        }
        let sql = `
          SELECT DISTINCT p.*, COALESCE(pc.status, 'ASSIGNED') as claim_status, pc.anonymous_tag
          FROM projects p
          LEFT JOIN project_claims pc ON (p.id = pc.project_id AND pc.developer_id = $1)
          LEFT JOIN project_members pm ON (p.id = pm.project_id AND pm.developer_id = $1)
          WHERE pc.developer_id = $1 OR pm.developer_id = $1 OR p.lead_developer_id = $1
        `;
        const params: any[] = [req.user.developerId];
        const search = req.query.search as string;
        if (search) {
          params.push(`%${search}%`);
          sql += ` AND (p.title ILIKE $2 OR p.description ILIKE $2 OR p.category ILIKE $2)`;
        }
        sql += ` ORDER BY p.created_at DESC`;
        const rows = await query(sql, params);
        res.json({ projects: rows.rows });
        return;
      }

      if (req.user?.clientId) {
        const rows = await query(`SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC`, [req.user.clientId]);
        res.json({ projects: rows.rows });
        return;
      }
      if (req.user?.developerId) {
        const rows = await query(
          `SELECT DISTINCT p.* FROM projects p
           LEFT JOIN project_claims pc ON (p.id = pc.project_id AND pc.developer_id = $1)
           WHERE pc.developer_id = $1 OR p.lead_developer_id = $1 ORDER BY p.created_at DESC`,
          [req.user.developerId]
        );
        res.json({ projects: rows.rows });
        return;
      }

      res.json({ projects: [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Developer submits project for completion review
   */
  static async submitForReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { notes } = req.body;

    try {
      const result = await ProjectService.submitForReview(
        projectId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          developerId: req.user?.developerId,
        },
        notes
      );
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Client requests adjustments during project completion review
   */
  static async requestChanges(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { feedback } = req.body;

    try {
      const result = await ProjectService.requestChanges(
        projectId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          clientId: req.user?.clientId,
        },
        feedback
      );
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Client approves project completion
   */
  static async approveCompletion(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { feedback, rating, publishImmediately } = req.body;

    try {
      const result = await ProjectService.approveCompletion(
        projectId,
        {
          userId: req.user!.userId,
          role: req.user!.role,
          clientId: req.user?.clientId,
        },
        { feedback, rating, publishImmediately }
      );
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Client / Leadership publishes project to public portfolio showcase
   */
  static async publishProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;

    try {
      const result = await ProjectService.publishProject(projectId, {
        userId: req.user!.userId,
        role: req.user!.role,
        clientId: req.user?.clientId,
      });
      res.json(result);
    } catch (error: any) {
      if (error.message.includes('Forbidden') || error.message.includes('Unauthorized')) {
        res.status(403).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }

  /**
   * Public route: retrieve published project by slug or ID with privacy shielding
   */
  static async getPublishedBySlug(req: Request, res: Response): Promise<void> {
    const { slug } = req.params;

    try {
      const project = await ProjectService.getPublicProjectBySlug(slug);

      if (!project) {
        res.status(404).json({ error: 'Public project not found or not published' });
        return;
      }

      res.json({ project });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

