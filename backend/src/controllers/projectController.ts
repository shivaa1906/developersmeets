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
        `SELECT p.*, c.client_number, c.company_name,
                d.username as lead_dev_username, d.display_name as lead_dev_name
         FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         LEFT JOIN developers d ON p.lead_developer_id = d.id
         WHERE p.id = $1 OR p.slug = $1`,
        [id]
      );

      if (projRes.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const project = projRes.rows[0];

      // Identity Shielding: Mask client company if uncompleted and caller is not owner/admin
      const isClientOwner = req.user?.clientId === project.client_id;
      const isAdmin = ['CEO', 'MD', 'ADMIN'].includes(req.user?.role || '');

      if (!isClientOwner && !isAdmin && project.status !== 'PUBLISHED') {
        project.company_name = undefined; // Shielded
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
   * Client project submission
   */
  static async submit(req: AuthenticatedRequest, res: Response): Promise<void> {
    const clientId = req.user?.clientId;
    if (!clientId) {
      res.status(403).json({ error: 'Client account required to submit project.' });
      return;
    }

    try {
      const { title, category, description, budgetMin, budgetMax, timeline, requirements, requiredTechnologies } =
        req.body;

      if (!title || !category || !description) {
        res.status(400).json({ error: 'Title, category, and description are required.' });
        return;
      }

      const result = await ProjectService.submitProject(clientId, req.user!.userId, {
        title,
        category,
        description,
        budgetMin: Number(budgetMin) || 0,
        budgetMax: Number(budgetMax) || 0,
        timeline: timeline || '30 Days',
        requirements: requirements || [],
        requiredTechnologies: requiredTechnologies || [],
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
   * Admin approves project
   */
  static async approve(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { maxClaims, deadlineDays } = req.body;

    try {
      await ProjectService.approveProject(
        projectId,
        req.user!.userId,
        Number(maxClaims) || 5,
        Number(deadlineDays) || 7
      );
      res.json({ message: 'Project approved and opened for developer claims.' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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
          `SELECT p.*, pc.status as claim_status, pc.anonymous_tag
           FROM projects p
           JOIN project_claims pc ON p.id = pc.project_id
           WHERE pc.developer_id = $1
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
