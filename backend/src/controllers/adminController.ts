import { Response } from 'express';
import { query, withTransaction } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';
import { AuditLogger } from '../utils/auditLogger.js';

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
         WHERE d.verification_status IN ('PENDING', 'PENDING_VERIFICATION')
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
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'DEVELOPER_VERIFIED', 'Profile Verified!', 'Congratulations! Your developer profile has been verified by platform executive leadership. 10 credits have been added to your wallet.')`,
          [dev.user_id]
        );

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
        `SELECT u.id, u.email, u.phone, u.role, u.status, u.created_at,
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
        `SELECT a.*, u.email as actor_email, u.role as actor_role
         FROM audit_logs a
         LEFT JOIN users u ON a.actor_user_id = u.id
         ORDER BY a.created_at DESC LIMIT 100`
      );
      res.json({ logs: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
