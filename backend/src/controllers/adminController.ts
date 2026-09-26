import { Response } from 'express';
import { query, withTransaction } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { ProjectService } from '../services/projectService.js';
import { NotificationService } from '../services/notificationService.js';
import { ROLES } from '../config/constants.js';

export class AdminController {
  /**
   * List all developers with PENDING verification status
   */
  static async listPendingDevelopers(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT d.id, d.username, d.display_name, d.role_title, d.experience,
                d.github_url, d.linkedin_url, d.portfolio_url, d.bio, d.created_at, u.email, d.verification_status
         FROM developers d
         JOIN users u ON d.user_id = u.id
         WHERE d.verification_status = 'PENDING'
         ORDER BY d.created_at ASC`
      );
      res.json({ pendingDevelopers: result.rows });
    } catch (_error: any) {
      res.json({ pendingDevelopers: [] });
    }
  }

  /**
   * Approves developer application, activates account, and seeds initial 10 credits
   */
  static async approveDeveloper(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId } = req.params;

    try {
      await withTransaction(async (client) => {
        // 1. Update developer status
        const devRes = await client.query(
          `UPDATE developers
           SET verification_status = 'VERIFIED', verified_at = NOW(), updated_at = NOW()
           WHERE id = $1
           RETURNING user_id, username, display_name`,
          [developerId]
        );

        if (devRes.rows.length === 0) {
          throw new Error('Developer profile not found');
        }

        const dev = devRes.rows[0];

        // 2. Activate user account
        await client.query(
          `UPDATE users SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [dev.user_id]
        );

        // 3. Ensure credit account exists & grant initial 10 credits
        await client.query(
          `INSERT INTO credit_accounts (developer_id, balance)
           VALUES ($1, 10)
           ON CONFLICT (developer_id) DO UPDATE SET balance = credit_accounts.balance + 10`,
          [developerId]
        );

        // 4. Record credit transaction for initial grant
        await client.query(
          `INSERT INTO credit_transactions (developer_id, type, amount, balance_after, reference_id, description)
           VALUES ($1, 'ADMIN_ADJUSTMENT', 10, 10, $2, 'Initial verified developer welcome credit bonus')`,
          [developerId, `VERIF-${developerId.slice(0, 8)}`]
        );

        // 5. Notify developer
        await NotificationService.createNotification({
          userId: dev.user_id,
          type: 'DEVELOPER_APPROVED',
          title: 'Profile Approved & Verified!',
          message: 'Congratulations! Your developer profile has been verified by platform executive leadership. 10 credits have been added to your wallet.',
          link: '/wallet',
          metadata: { developerId, creditsGranted: 10 },
          client,
        });

        // 6. Log audit action
        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'DEVELOPER_APPROVED',
          entityType: 'DEVELOPER',
          entityId: developerId,
          metadata: { username: dev.username, approvedBy: req.user!.email },
        });
      });

      res.json({
        success: true,
        message: 'Developer approved and verified with 10 welcome credits.',
        developer: {
          id: developerId,
          status: 'APPROVED',
          verification_status: 'VERIFIED',
          verified: true,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Rejects developer application
   */
  static async rejectDeveloper(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId } = req.params;
    const { reason } = req.body;

    try {
      await withTransaction(async (client) => {
        const devRes = await client.query(
          `UPDATE developers
           SET verification_status = 'REJECTED', updated_at = NOW()
           WHERE id = $1
           RETURNING user_id, username`,
          [developerId]
        );

        if (devRes.rows.length === 0) {
          throw new Error('Developer profile not found');
        }

        const dev = devRes.rows[0];

        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'DEVELOPER_REJECTED',
          entityType: 'DEVELOPER',
          entityId: developerId,
          metadata: { username: dev.username, reason },
        });
      });

      res.json({
        success: true,
        message: 'Developer application rejected.',
        developer: {
          id: developerId,
          status: 'REJECTED',
          verification_status: 'REJECTED',
          verified: false,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Suspends a developer
   */
  static async suspendDeveloper(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId } = req.params;

    try {
      await withTransaction(async (client) => {
        const devRes = await client.query(
          `UPDATE developers
           SET verification_status = 'SUSPENDED', updated_at = NOW()
           WHERE id = $1
           RETURNING user_id, username`,
          [developerId]
        );

        if (devRes.rows.length === 0) {
          throw new Error('Developer profile not found');
        }

        const dev = devRes.rows[0];

        await client.query(
          `UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1`,
          [dev.user_id]
        );

        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'DEVELOPER_SUSPENDED',
          entityType: 'DEVELOPER',
          entityId: developerId,
          metadata: { username: dev.username },
        });
      });

      res.json({
        success: true,
        message: 'Developer suspended.',
        developer: {
          id: developerId,
          status: 'SUSPENDED',
          verification_status: 'SUSPENDED',
          verified: false,
        },
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * List all projects across the platform for Admin management
   */
  static async listAllProjects(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT p.*, c.client_number, c.company_name,
                d.username as lead_dev_username, d.display_name as lead_dev_name,
                COUNT(pc.id) as claims_count
         FROM projects p
         LEFT JOIN clients c ON p.client_id = c.id
         LEFT JOIN developers d ON p.lead_developer_id = d.id
         LEFT JOIN project_claims pc ON p.id = pc.project_id
         GROUP BY p.id, c.id, d.id
         ORDER BY p.created_at DESC`
      );
      res.json({ projects: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List all platform users
   */
  static async listAllUsers(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT u.id, u.uid, u.public_uid, u.email, u.phone, u.role, u.status, u.email_verified, u.is_suspended, u.last_login_at, u.created_at,
                d.username, d.display_name, d.verification_status,
                c.client_number, c.company_name
         FROM users u
         LEFT JOIN developers d ON u.id = d.user_id
         LEFT JOIN clients c ON u.id = c.user_id
         ORDER BY u.created_at DESC`
      );
      res.json({ users: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Suspend any platform user account
   */
  static async suspendUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { userId } = req.params;
    const { reason } = req.body || {};

    try {
      await withTransaction(async (client) => {
        const userRes = await client.query(
          `UPDATE users 
           SET status = 'SUSPENDED', is_suspended = TRUE, suspended_at = NOW(), suspension_reason = $1, updated_at = NOW() 
           WHERE id = $2 
           RETURNING id, email, role, status`,
          [reason || 'Administrative suspension', userId]
        );

        if (userRes.rows.length === 0) {
          throw new Error('User not found');
        }

        const user = userRes.rows[0];

        // If developer, suspend developer profile
        if (user.role === ROLES.DEVELOPER) {
          await client.query(
            `UPDATE developers SET verification_status = 'SUSPENDED', updated_at = NOW() WHERE user_id = $1`,
            [userId]
          );
        }

        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'USER_SUSPENDED',
          entityType: 'USER',
          entityId: userId,
          metadata: { email: user.email, role: user.role, reason },
        });
      });

      res.json({ success: true, message: 'User account has been suspended.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Unsuspend a previously suspended user account
   */
  static async unsuspendUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { userId } = req.params;

    try {
      await withTransaction(async (client) => {
        const userRes = await client.query(
          `UPDATE users 
           SET status = 'ACTIVE', is_suspended = FALSE, suspended_at = NULL, suspension_reason = NULL, updated_at = NOW() 
           WHERE id = $1 
           RETURNING id, email, role, status`,
          [userId]
        );

        if (userRes.rows.length === 0) {
          throw new Error('User not found');
        }

        const user = userRes.rows[0];

        // If developer, restore verified status
        if (user.role === ROLES.DEVELOPER) {
          await client.query(
            `UPDATE developers SET verification_status = 'VERIFIED', updated_at = NOW() WHERE user_id = $1`,
            [userId]
          );
        }

        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'USER_UNSUSPENDED',
          entityType: 'USER',
          entityId: userId,
          metadata: { email: user.email, role: user.role },
        });
      });

      res.json({ success: true, message: 'User account has been reactivated.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Disable a user account
   */
  static async disableUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { userId } = req.params;

    try {
      await withTransaction(async (client) => {
        const userRes = await client.query(
          `UPDATE users 
           SET status = 'DISABLED', updated_at = NOW() 
           WHERE id = $1 
           RETURNING id, email, role, status`,
          [userId]
        );

        if (userRes.rows.length === 0) {
          throw new Error('User not found');
        }

        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'USER_DISABLED',
          entityType: 'USER',
          entityId: userId,
          metadata: { email: userRes.rows[0].email },
        });
      });

      res.json({ success: true, message: 'User account has been disabled.' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * List credit transactions ledger for financial audit
   */
  static async listFinancialLedger(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT ct.*, d.username as developer_username, d.display_name as developer_name,
                p.title as project_title, p.project_number
         FROM credit_transactions ct
         JOIN developers d ON ct.developer_id = d.id
         LEFT JOIN projects p ON ct.project_id = p.id
         ORDER BY ct.created_at DESC LIMIT 100`
      );
      res.json({ ledger: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List audit log trail
   */
  static async listAuditLogs(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await query(
        `SELECT a.*, u.uid as actor_uid, u.public_uid as actor_public_uid, u.email as actor_email, u.role as actor_role
         FROM audit_logs a
         LEFT JOIN users u ON a.actor_user_id = u.id
         ORDER BY a.created_at DESC LIMIT 100`
      );
      res.json({ logs: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Admin moves submitted project to REVIEWING state
   */
  static async reviewProject(req: AuthenticatedRequest, res: Response): Promise<void> {
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
   * Admin approves submitted/reviewing project (transitions to OPEN_FOR_CLAIMS)
   */
  static async approveProject(req: AuthenticatedRequest, res: Response): Promise<void> {
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
   * Directly verify a developer profile
   */
  static async verifyDeveloper(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId } = req.params;
    try {
      await withTransaction(async (client) => {
        const devRes = await client.query(
          `UPDATE developers SET verification_status = 'VERIFIED', verified_at = NOW(), updated_at = NOW()
           WHERE id = $1 RETURNING user_id, username, display_name`,
          [developerId]
        );
        if (devRes.rows.length === 0) {
          throw new Error('Developer profile not found');
        }
        await client.query(
          `UPDATE users SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [devRes.rows[0].user_id]
        );
        await NotificationService.createNotification({
          userId: devRes.rows[0].user_id,
          type: 'DEVELOPER_APPROVED',
          title: 'Profile Verified!',
          message: 'Congratulations! Your developer profile has been verified by platform executive leadership.',
          link: '/dashboard',
          metadata: { developerId },
          client,
        });
        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'DEVELOPER_VERIFIED_DIRECT',
          entityType: 'DEVELOPER',
          entityId: developerId,
          metadata: { username: devRes.rows[0].username, verifiedBy: req.user!.role },
        });
      });
      res.json({ success: true, message: 'Developer verified successfully.', developerId, status: 'VERIFIED' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * View a developer's wallet balance and transaction ledger
   */
  static async getDeveloperWallet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId } = req.params;
    try {
      const accRes = await query(`SELECT balance FROM credit_accounts WHERE developer_id = $1`, [developerId]);
      const balance = Number(accRes.rows[0]?.balance || 0);
      const txRes = await query(
        `SELECT id, type, amount, balance_after, description, created_at
         FROM credit_transactions WHERE developer_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [developerId]
      );
      res.json({ developerId, balance, transactions: txRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Edit project parameters (budget, timeline, requirements, technologies)
   */
  static async editProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { title, description, budgetMin, budgetMax, timeline, requirements, requiredTechnologies } = req.body;
    try {
      const resProj = await query(
        `UPDATE projects
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             budget_min = COALESCE($3, budget_min),
             budget_max = COALESCE($4, budget_max),
             timeline = COALESCE($5, timeline),
             requirements = COALESCE($6::jsonb, requirements),
             required_technologies = COALESCE($7::jsonb, required_technologies),
             updated_at = NOW()
         WHERE id = $8
         RETURNING *`,
        [
          title || null,
          description || null,
          budgetMin !== undefined ? Number(budgetMin) : null,
          budgetMax !== undefined ? Number(budgetMax) : null,
          timeline || null,
          requirements ? JSON.stringify(requirements) : null,
          requiredTechnologies ? JSON.stringify(requiredTechnologies) : null,
          projectId,
        ]
      );
      if (resProj.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      await AuditLogger.log({
        actorUserId: req.user!.userId,
        action: 'PROJECT_EDITED_BY_ADMIN',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: { editedBy: req.user!.role, changes: req.body },
      });
      res.json({ message: 'Project updated successfully', project: resProj.rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Cancel project
   */
  static async cancelProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    const { reason } = req.body;
    try {
      const resProj = await query(
        `UPDATE projects SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [projectId]
      );
      if (resProj.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      await AuditLogger.log({
        actorUserId: req.user!.userId,
        action: 'PROJECT_CANCELLED_BY_ADMIN',
        entityType: 'PROJECT',
        entityId: projectId,
        metadata: { reason },
      });
      res.json({ message: 'Project cancelled.', project: resProj.rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Reopen project
   */
  static async reopenProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const resProj = await query(
        `UPDATE projects SET status = 'OPEN_FOR_CLAIMS', updated_at = NOW() WHERE id = $1 RETURNING *`,
        [projectId]
      );
      if (resProj.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      await AuditLogger.log({
        actorUserId: req.user!.userId,
        action: 'PROJECT_REOPENED_BY_ADMIN',
        entityType: 'PROJECT',
        entityId: projectId,
      });
      res.json({ message: 'Project reopened for developer claims.', project: resProj.rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Monitor claims on a specific project
   */
  static async getProjectClaims(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const claimsRes = await query(
        `SELECT pc.*, d.username, d.display_name, d.role_title
         FROM project_claims pc
         JOIN developers d ON pc.developer_id = d.id
         WHERE pc.project_id = $1
         ORDER BY pc.claimed_at ASC`,
        [projectId]
      );
      res.json({ projectId, claims: claimsRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * View developer proposals on a project
   */
  static async getProjectProposals(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const propRes = await query(
        `SELECT p.*, pc.project_id, pc.developer_id,
                d.username as developer_username, d.display_name as developer_name
         FROM proposals p
         JOIN project_claims pc ON p.project_claim_id = pc.id
         JOIN developers d ON pc.developer_id = d.id
         WHERE pc.project_id = $1
         ORDER BY p.created_at DESC`,
        [projectId]
      );
      res.json({ projectId, proposals: propRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Monitor project completion state and milestone progress
   */
  static async getProjectCompletion(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId } = req.params;
    try {
      const projRes = await query(
        `SELECT id, project_number, title, status, lead_developer_id, client_id, created_at, updated_at
         FROM projects WHERE id = $1`,
        [projectId]
      );
      if (projRes.rows.length === 0) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const milesRes = await query(
        `SELECT id, title, description, status, order_index, completed_at
         FROM project_milestones WHERE project_id = $1 ORDER BY order_index ASC`,
        [projectId]
      );
      res.json({ project: projRes.rows[0], milestones: milesRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * List clients across platform
   */
  static async listClients(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const clientsRes = await query(
        `SELECT c.id, c.client_number, c.company_name, c.private_name, c.phone, c.created_at,
                u.uid as user_uid, u.public_uid as user_public_uid, u.email, u.status as user_status,
                COUNT(p.id) as projects_count
         FROM clients c
         JOIN users u ON c.user_id = u.id
         LEFT JOIN projects p ON p.client_id = c.id
         GROUP BY c.id, u.id
         ORDER BY c.created_at DESC`
      );
      res.json({ clients: clientsRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * List claims across all projects
   */
  static async listAllClaims(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const claimsRes = await query(
        `SELECT pc.*, p.project_number, p.title as project_title,
                d.username as developer_username, d.display_name as developer_name
         FROM project_claims pc
         JOIN projects p ON pc.project_id = p.id
         JOIN developers d ON pc.developer_id = d.id
         ORDER BY pc.claimed_at DESC LIMIT 100`
      );
      res.json({ claims: claimsRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Manual credit adjustment (CEO ONLY)
   * Enforces that every adjustment requires an explicit, non-empty reason!
   */
  static async adjustCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId, amount, reason } = req.body;

    if (!developerId || amount === undefined) {
      res.status(400).json({ error: 'developerId and amount are required' });
      return;
    }

    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'A valid reason is required for manual credit adjustments' });
      return;
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      res.status(400).json({ error: 'Adjustment amount must be a non-zero number' });
      return;
    }

    try {
      const result = await withTransaction(async (client) => {
        // Update credit account
        const accRes = await client.query(
          `INSERT INTO credit_accounts (developer_id, balance)
           VALUES ($1, $2)
           ON CONFLICT (developer_id)
           DO UPDATE SET balance = credit_accounts.balance + $2, updated_at = NOW()
           RETURNING balance`,
          [developerId, numAmount]
        );
        const newBalance = Number(accRes.rows[0].balance);

        // Record credit transaction
        const txRes = await client.query(
          `INSERT INTO credit_transactions (developer_id, type, amount, balance_after, description)
           VALUES ($1, 'ADMIN_ADJUSTMENT', $2, $3, $4)
           RETURNING *`,
          [developerId, numAmount, newBalance, reason]
        );

        // Log audit record
        await AuditLogger.log({
          actorUserId: req.user!.userId,
          action: 'CREDIT_MANUAL_ADJUSTMENT',
          entityType: 'CREDIT_ACCOUNT',
          entityId: developerId,
          metadata: { amount: numAmount, newBalance, reason, actorRole: req.user!.role },
        });

        return { balance: newBalance, transaction: txRes.rows[0] };
      });

      res.json({ success: true, message: 'Credit balance adjusted successfully', ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * View payment status and orders (strictly shielding all secret keys)
   */
  static async listPayments(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const payRes = await query(
        `SELECT p.id, p.user_id, p.amount, p.currency, p.gateway, p.gateway_payment_id, p.status, p.created_at,
                u.email as user_email, u.role as user_role
         FROM payments p
         JOIN users u ON p.user_id = u.id
         ORDER BY p.created_at DESC LIMIT 100`
      );

      // Verify no payment secrets are returned
      const sanitized = payRes.rows.map((row) => {
        const { ...safeRow } = row;
        delete (safeRow as any).secret_key;
        delete (safeRow as any).key_secret;
        delete (safeRow as any).webhook_secret;
        delete (safeRow as any).private_key;
        return safeRow;
      });

      res.json({ payments: sanitized });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * List support tickets
   */
  static async listSupportTickets(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const ticketsRes = await query(
        `SELECT st.*, p.title as project_title, c.client_number, c.company_name,
                d.username as developer_username, d.display_name as developer_name,
                sb.id as bridge_id, sb.bridge_number
         FROM support_tickets st
         JOIN projects p ON st.project_id = p.id
         JOIN clients c ON st.client_id = c.id
         LEFT JOIN developers d ON st.developer_id = d.id
         LEFT JOIN support_bridges sb ON sb.ticket_id = st.id
         ORDER BY st.created_at DESC`
      );
      res.json({ tickets: ticketsRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Platform analytics
   */
  static async getAnalytics(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const devCount = await query(`SELECT COUNT(*)::int as count FROM developers WHERE verification_status = 'VERIFIED'`);
      const clientCount = await query(`SELECT COUNT(*)::int as count FROM clients`);
      const projCount = await query(`SELECT status, COUNT(*)::int as count FROM projects GROUP BY status`);
      const creditTotal = await query(`SELECT SUM(balance)::int as total FROM credit_accounts`);
      const paymentTotal = await query(`SELECT COALESCE(SUM(amount), 0)::int as total FROM payments WHERE status = 'SUCCESS'`);

      res.json({
        analytics: {
          verifiedDevelopers: devCount.rows[0]?.count || 0,
          clients: clientCount.rows[0]?.count || 0,
          projectsByStatus: projCount.rows,
          totalCreditsInCirculation: creditTotal.rows[0]?.total || 0,
          totalRevenueInr: paymentTotal.rows[0]?.total || 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Get platform settings (CEO governance)
   */
  static async getSettings(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const setRes = await query(`SELECT key, value, description, updated_at FROM platform_settings ORDER BY key ASC`);
      res.json({ settings: setRes.rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Update platform settings (CEO ONLY)
   */
  static async updateSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      res.status(400).json({ error: 'key and value are required' });
      return;
    }

    try {
      const updateRes = await query(
        `UPDATE platform_settings
         SET value = $1::jsonb, updated_by = $2, updated_at = NOW()
         WHERE key = $3
         RETURNING *`,
        [JSON.stringify(value), req.user!.userId, key]
      );

      if (updateRes.rows.length === 0) {
        res.status(404).json({ error: `Setting '${key}' not found` });
        return;
      }

      await AuditLogger.log({
        actorUserId: req.user!.userId,
        action: 'PLATFORM_SETTINGS_UPDATED',
        entityType: 'PLATFORM_SETTING',
        entityId: key,
        metadata: { key, newValue: value },
      });

      res.json({ message: 'Setting updated successfully', setting: updateRes.rows[0] });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
