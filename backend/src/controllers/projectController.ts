import { Request, Response } from 'express';
import { ProjectService } from '../services/projectService.js';
import { query } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';

export class ProjectController {
  /**
   * Public route: Completed/Published projects showcase
   */
  static async listPublished(req: Request, res: Response): Promise<void> {
    try {
      const category = req.query.category as string;
      const search = req.query.search as string;

      let sql = `
        SELECT p.id, p.project_number, p.slug, p.title, p.description, p.category, 
               p.timeline, p.required_technologies, p.status, p.created_at,
               d.username as lead_dev_username, d.display_name as lead_dev_name,
               d.profile_image as lead_dev_avatar, d.role_title as lead_dev_title
        FROM projects p
        LEFT JOIN developers d ON p.lead_developer_id = d.id
        WHERE p.status = 'PUBLISHED'
      `;
      const params: any[] = [];
      if (category && category !== 'ALL') {
        params.push(category);
        sql += ` AND p.category = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        sql += ` AND (p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`;
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
  static async marketplace(req: Request, res: Response): Promise<void> {
    try {
      const category = req.query.category as string;
      const search = req.query.search as string;
      const projects = await ProjectService.getMarketplaceProjects({ category, search });
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

      // Multi-tenant privacy guard: Non-owners and non-admins cannot view projects under review
      const isClientOwner = req.user?.clientId === project.client_id;
      const isAdmin = ['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '');
      const isPubliclyVisibleStatus = [
        'OPEN_FOR_CLAIMS',
        'CLAIMS_ACTIVE',
        'SELECTION_PENDING',
        'DEVELOPER_SELECTED',
        'IN_PROGRESS',
        'COMPLETED',
        'PUBLISHED',
      ].includes(project.status);

      if (!isClientOwner && !isAdmin) {
        if (!isPubliclyVisibleStatus) {
          res.status(403).json({ error: 'Access denied: Project is under administrative review.' });
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
    const clientId = req.user?.clientId;
    if (!clientId) {
      res.status(403).json({ error: 'Client account required to submit project.' });
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

      res.status(201).json({
        message: 'Project submitted successfully for administrative review.',
        ...result,
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
   * Developer claims a project slot (-1 Credit)
   */
  static async claim(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const developerId = req.user?.developerId;

    if (!developerId) {
      res.status(403).json({ error: 'Verified developer profile required to claim project' });
      return;
    }

    try {
      const result = await ProjectService.claimProject(projectId, developerId, req.user!.userId);
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
    const developerId = req.user?.developerId;

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
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * User's projects (client projects or developer claimed/member projects)
   */
  static async myProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (req.user?.clientId) {
        const rows = await query(
          `SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC`,
          [req.user.clientId]
        );
        res.json({ projects: rows.rows });
        return;
      }

      if (req.user?.developerId) {
        const rows = await query(
          `SELECT DISTINCT p.*, COALESCE(pc.status, 'ASSIGNED') as claim_status, pc.anonymous_tag
           FROM projects p
           LEFT JOIN project_claims pc ON (p.id = pc.project_id AND pc.developer_id = $1)
           LEFT JOIN project_members pm ON (p.id = pm.project_id AND pm.developer_id = $1)
           WHERE pc.developer_id = $1 OR pm.developer_id = $1 OR p.lead_developer_id = $1
           ORDER BY p.created_at DESC`,
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
}
