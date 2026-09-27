import { Response } from 'express';
import { query } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';

export class AnalyticsController {
  /**
   * Executive analytics for CEO M. Shiva Gopi & MD Ritesh Lingamallu
   */
  static async getPlatformOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // 1. User counts
      const userStats = await query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE role = 'DEVELOPER') as total_developers,
          COUNT(*) FILTER (WHERE role = 'CLIENT') as total_clients
        FROM users
      `);

      // 2. Developer verification stats
      const devStats = await query(`
        SELECT 
          COUNT(*) FILTER (WHERE verification_status = 'VERIFIED') as verified_devs,
          COUNT(*) FILTER (WHERE verification_status = 'PENDING_VERIFICATION') as pending_devs
        FROM developers
      `);

      // 3. Project stats
      const projectStats = await query(`
        SELECT 
          COUNT(*) as total_projects,
          COUNT(*) FILTER (WHERE status = 'SUBMITTED') as pending_approval_projects,
          COUNT(*) FILTER (WHERE status IN ('OPEN_FOR_CLAIMS', 'CLAIMS_ACTIVE')) as open_marketplace_projects,
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') as active_workspace_projects,
          COUNT(*) FILTER (WHERE status = 'PUBLISHED') as completed_projects,
          COALESCE(SUM(budget_max), 0) as total_pipeline_value
        FROM projects
      `);

      // 4. Ledger & Financial volume
      const ledgerStats = await query(`
        SELECT 
          COUNT(*) as total_credit_transactions,
          COALESCE(SUM(ABS(amount)), 0) as total_credits_circulated
        FROM credit_transactions
      `);

      const revenueStats = await query(`
        SELECT 
          COALESCE(SUM(amount), 0) as total_revenue_inr,
          COUNT(*) as successful_payments
        FROM payments
        WHERE status = 'SUCCESS'
      `);

      res.json({
        users: {
          total: parseInt(userStats.rows[0].total_users, 10),
          developers: parseInt(userStats.rows[0].total_developers, 10),
          clients: parseInt(userStats.rows[0].total_clients, 10),
          verifiedDevelopers: parseInt(devStats.rows[0].verified_devs || '0', 10),
          pendingDevelopers: parseInt(devStats.rows[0].pending_devs || '0', 10),
        },
        projects: {
          total: parseInt(projectStats.rows[0].total_projects, 10),
          pendingApproval: parseInt(projectStats.rows[0].pending_approval_projects, 10),
          openMarketplace: parseInt(projectStats.rows[0].open_marketplace_projects, 10),
          activeWorkspace: parseInt(projectStats.rows[0].active_workspace_projects, 10),
          completed: parseInt(projectStats.rows[0].completed_projects, 10),
          pipelineValueInr: parseFloat(projectStats.rows[0].total_pipeline_value),
        },
        economy: {
          totalCreditTransactions: parseInt(ledgerStats.rows[0].total_credit_transactions, 10),
          totalCreditsCirculated: parseInt(ledgerStats.rows[0].total_credits_circulated, 10),
          totalRevenueInr: parseFloat(revenueStats.rows[0].total_revenue_inr),
          successfulPaymentsCount: parseInt(revenueStats.rows[0].successful_payments, 10),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Analytics for single developer
   */
  static async getDeveloperMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    const devId = req.user?.developerId;
    if (!devId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    try {
      const claimsStats = await query(`
        SELECT 
          COUNT(*) as total_claims,
          COUNT(*) FILTER (WHERE status = 'SELECTED') as winning_claims,
          COUNT(*) FILTER (WHERE status = 'CLAIMED') as active_claims
        FROM project_claims
        WHERE developer_id = $1
      `, [devId]);

      const balanceRes = await query(`
        SELECT balance FROM credit_accounts WHERE developer_id = $1
      `, [devId]);

      const completedRes = await query(`
        SELECT COUNT(*) as completed_count
        FROM project_members pm
        JOIN projects p ON pm.project_id = p.id
        WHERE pm.developer_id = $1 AND p.status = 'PUBLISHED'
      `, [devId]);

      const totalClaims = parseInt(claimsStats.rows[0].total_claims, 10);
      const winningClaims = parseInt(claimsStats.rows[0].winning_claims, 10);
      const winRate = totalClaims > 0 ? Math.round((winningClaims / totalClaims) * 100) : 0;

      res.json({
        balance: balanceRes.rows.length > 0 ? balanceRes.rows[0].balance : 0,
        totalClaims,
        winningClaims,
        activeClaims: parseInt(claimsStats.rows[0].active_claims, 10),
        winRatePercent: winRate,
        completedProjects: parseInt(completedRes.rows[0].completed_count, 10),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
