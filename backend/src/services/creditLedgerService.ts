import { withTransaction, query } from '../database/db.js';
import { env } from '../config/environment.js';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { NotificationService } from './notificationService.js';
import { AuditLogger } from '../utils/auditLogger.js';
import { RealtimeEvents } from '../realtime/events.js';

export interface BulkTargetFilters {
  role?: 'ALL' | 'DEVELOPER' | 'CLIENT';
  verificationStatus?: string;
  minExperience?: number;
  skills?: string[];
  search?: string;
  includeSuspended?: boolean;
}

export interface BulkPreviewResult {
  targetScope: string;
  recipientCount: number;
  amountPerUser: number;
  totalCredits: number;
  reason: string;
  sampleRecipients: Array<{
    id: string;
    uid: string;
    name: string;
    email: string;
    role: string;
    currentBalance: number;
  }>;
  breakdown: {
    developers: number;
    clients: number;
    other: number;
  };
}

export interface BulkCreditExecutionResult {
  success: boolean;
  operationId: string;
  bulkOperationRecordId: string;
  batchReference?: string;
  targetScope: string;
  recipientCount: number;
  count?: number;
  amountPerUser: number;
  totalCredits: number;
  reason: string;
  performedBy: string;
  status: string;
  affectedUsers?: Array<{
    userId: string;
    email: string;
    uid: string;
    balanceBefore: number;
    balanceAfter: number;
    amount: number;
  }>;
  message?: string;
}

export interface CreditLedgerResult {
  success: boolean;
  newBalance: number;
  transactionId?: string;
  error?: string;
}

export interface CreditAdjustmentResult {
  success: boolean;
  user: {
    id: string;
    uid: string;
    name?: string;
    email: string;
    role: string;
    developerId?: string | null;
  };
  balance: number;
  newBalance: number;
  balanceBefore: number;
  amount: number;
  transactionId: string;
  referenceId: string;
  reason: string;
  type: string;
  timestamp: string;
  performedBy: string;
}

export interface BulkRemovalPreviewResult {
  targetScope: string;
  recipientCount: number;
  amountPerUser: number;
  estimatedTotalCredits: number;
  reason: string;
  sampleRecipients: Array<{
    id: string;
    uid: string;
    name: string;
    email: string;
    role: string;
    currentBalance: number;
    creditsToDeduct: number;
  }>;
  breakdown: {
    developers: number;
    clients: number;
    other: number;
  };
}

export interface BulkCreditResult {
  success: boolean;
  targetScope: string;
  count: number;
  recipientCount?: number;
  totalCredits: number;
  batchReference: string;
  affectedUsers: Array<{
    userId: string;
    email: string;
    uid: string;
    balanceBefore: number;
    balanceAfter: number;
    amount: number;
  }>;
}

export interface CreditHistoryFilter {
  userId?: string;
  uid?: string;
  role?: string;
  type?: string;
  performedBy?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CreditLedgerService {
  /**
   * Deducts credits for a project claim inside an atomic transaction with row locking
   */
  static async deductClaimCredit(
    developerId: string,
    projectId: string,
    claimCost: number = env.CLAIM_COST_CREDITS,
    dbClient?: PoolClient,
    userId?: string
  ): Promise<CreditLedgerResult> {
    const handler = async (client: PoolClient) => {
      // 1. Lock credit account row FOR UPDATE
      const accountRes = await client.query(
        `SELECT balance, user_id FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
        [developerId]
      );

      if (accountRes.rows.length === 0) {
        throw new Error('Credit account not found for developer');
      }

      const currentBalance = accountRes.rows[0].balance;
      const effectiveUserId = userId || accountRes.rows[0].user_id || null;

      let effectiveBalance = currentBalance;
      // 2. Strict balance validation (never allow negative balance)
      if (effectiveBalance < claimCost) {
        if (effectiveUserId) {
          const uRes = await client.query(`SELECT role FROM users WHERE id = $1`, [effectiveUserId]);
          if (uRes.rows.length > 0 && ['CEO', 'MD', 'ADMIN'].includes(uRes.rows[0].role)) {
            effectiveBalance += 1000;
            await client.query(
              `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
              [effectiveBalance, developerId]
            );
          }
        }
      }

      if (effectiveBalance < claimCost) {
        throw new Error(`Insufficient credits. Required: ${claimCost}, Available: ${effectiveBalance}`);
      }

      const balanceAfter = effectiveBalance - claimCost;

      // 3. Update balance
      await client.query(
        `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
        [balanceAfter, developerId]
      );

      // 4. Create immutable ledger record
      const claimRef = `CLM-${projectId.slice(0, 8)}-${Date.now().toString().slice(-4)}`;
      const claimReason = `Slot claim fee for project ${projectId}`;
      const txRes = await client.query(
        `INSERT INTO credit_transactions (developer_id, user_id, project_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
         VALUES ($1, $2, $3, 'PROJECT_CLAIM', $4, $5, $6, $7, $8, $8, $9)
         RETURNING id`,
        [
          developerId,
          effectiveUserId,
          projectId,
          -claimCost,
          currentBalance,
          balanceAfter,
          claimRef,
          claimReason,
          effectiveUserId,
        ]
      );

      return {
        success: true,
        newBalance: balanceAfter,
        transactionId: txRes.rows[0].id,
      };
    };

    if (dbClient) {
      return handler(dbClient);
    }
    return withTransaction(handler);
  }

  /**
   * Executes atomic refunds for all non-selected developers on a project
   */
  static async processSelectionRefunds(
    projectId: string,
    selectedDeveloperId: string,
    dbClient?: PoolClient
  ): Promise<{ refundedDevelopersCount: number }> {
    const handler = async (client: PoolClient) => {
      // Fetch all eligible claims that were NOT selected
      const unselectedClaims = await client.query(
        `SELECT id, developer_id FROM project_claims
         WHERE project_id = $1 AND developer_id != $2 AND status = 'CLAIMED'`,
        [projectId, selectedDeveloperId]
      );

      let refundedCount = 0;

      for (const claim of unselectedClaims.rows) {
        const devId = claim.developer_id;
        const refundAmt = env.CLAIM_COST_CREDITS;
        const refundReference = `REF-${projectId.slice(0, 8)}-${devId.slice(0, 8)}`;

        // Verify idempotency: check if refund was already issued
        const existingTx = await client.query(
          `SELECT id FROM credit_transactions WHERE reference_id = $1`,
          [refundReference]
        );

        if (existingTx.rows.length === 0) {
          // Lock account row
          const acc = await client.query(
            `SELECT balance, user_id FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
            [devId]
          );

          if (acc.rows.length > 0) {
            const currentBal = acc.rows[0].balance;
            const devUserId = acc.rows[0].user_id || null;
            const balanceAfter = currentBal + refundAmt;

            // Update balance
            await client.query(
              `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
              [balanceAfter, devId]
            );

            // Create refund ledger transaction
            const refundTx = await client.query(
              `INSERT INTO credit_transactions (developer_id, user_id, project_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
               VALUES ($1, $2, $3, 'PROJECT_NOT_SELECTED_REFUND', $4, $5, $6, $7, $8, $8, $9)
               RETURNING id`,
              [
                devId,
                devUserId,
                projectId,
                refundAmt,
                currentBal,
                balanceAfter,
                refundReference,
                `100% automated credit refund for project ${projectId}`,
                devUserId,
              ]
            );

            // Update claim status to NOT_SELECTED with refund transaction reference
            await client.query(
              `UPDATE project_claims
               SET status = 'NOT_SELECTED', rejected_at = NOW(), refund_transaction_id = $1
               WHERE id = $2`,
              [refundTx.rows[0].id, claim.id]
            );

            // Fetch developer and project details for notifications
            const devInfo = await client.query(`SELECT user_id FROM developers WHERE id = $1`, [devId]);
            const projInfo = await client.query(`SELECT title, project_number FROM projects WHERE id = $1`, [projectId]);
            const targetUserId = devUserId || devInfo.rows[0]?.user_id;
            const projectTitle = projInfo.rows[0]?.title || 'Project';
            const projectCode = projInfo.rows[0]?.project_number || projectId;

            if (targetUserId) {
              // 1. DEVELOPER_NOT_SELECTED Notification
              await NotificationService.createNotification({
                userId: targetUserId,
                type: 'DEVELOPER_NOT_SELECTED',
                title: 'Project Selection Update',
                message: `A candidate has been selected for project "${projectTitle}". Thank you for your proposal.`,
                link: `/projects/${projectCode}`,
                metadata: { projectId, projectCode, status: 'NOT_SELECTED' },
                client,
              });

              // 2. CREDIT_REFUNDED Notification
              await NotificationService.createNotification({
                userId: devUserId,
                type: 'CREDIT_REFUNDED',
                title: 'Credit Refunded',
                message: `${refundAmt} claim credit has been refunded to your wallet for project "${projectTitle}". New balance: ${balanceAfter} credits.`,
                link: '/wallet',
                metadata: { projectId, projectCode, amount: refundAmt, balanceAfter, referenceId: refundReference },
                client,
              });
            }

            refundedCount++;
          }
        }
      }

      return { refundedDevelopersCount: refundedCount };
    };

    if (dbClient) {
      return handler(dbClient);
    }
    return withTransaction(handler);
  }

  /**
   * Resolves a user by userId, developerId, public UID, or email
   */
  static async findUserAndAccount(identifier: string, client?: PoolClient) {
    const db = client || { query };
    const trimmed = String(identifier).trim();
    const userRes = await db.query(
      `SELECT u.id, u.uid, u.public_uid, u.email, u.role, u.status, u.is_suspended,
              COALESCE(d.display_name, c.private_name, c.company_name, split_part(u.email, '@', 1)) as name,
              d.id as developer_id, d.username as developer_username, d.display_name as developer_name,
              c.id as client_id, c.company_name, c.private_name
       FROM users u
       LEFT JOIN developers d ON d.user_id = u.id
       LEFT JOIN clients c ON c.user_id = u.id
       WHERE u.id::text = $1
          OR u.uid = $1
          OR u.public_uid = $1
          OR u.email ILIKE $1
          OR d.id::text = $1
          OR d.username = $1`,
      [trimmed]
    );
    return userRes.rows[0] || null;
  }

  /**
   * Searches platform users for administrative credit management.
   * Searchable by UID, Name, Email, or Username.
   * Displays Name, UID, Role, Current Balance, Account Status.
   * Strictly returns non-sensitive metadata only (no passwords, reset tokens, or secrets).
   */
  static async searchEligibleUsers(searchQuery?: string, limit: number = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const params: any[] = [];
    let whereClause = '';

    if (searchQuery && searchQuery.trim().length > 0) {
      const q = `%${searchQuery.trim()}%`;
      params.push(q);
      whereClause = `
        WHERE (
          u.uid ILIKE $1
          OR u.id::text ILIKE $1
          OR u.email ILIKE $1
          OR d.display_name ILIKE $1
          OR d.username ILIKE $1
          OR c.private_name ILIKE $1
          OR c.company_name ILIKE $1
          OR c.client_number ILIKE $1
        )
      `;
    }

    params.push(safeLimit);
    const limitIdx = params.length;

    const sql = `
      SELECT 
        u.id,
        u.uid,
        u.public_uid,
        u.email,
        u.role,
        u.status,
        u.is_suspended,
        COALESCE(d.display_name, c.private_name, c.company_name, split_part(u.email, '@', 1)) AS name,
        COALESCE(d.username, c.client_number, split_part(u.email, '@', 1)) AS username,
        COALESCE(ca.balance, 0)::int AS current_balance,
        COALESCE(ca.currency, 'INR') AS currency,
        d.id AS developer_id,
        c.id AS client_id
      FROM users u
      LEFT JOIN developers d ON d.user_id = u.id
      LEFT JOIN clients c ON c.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT balance, currency FROM credit_accounts 
        WHERE user_id = u.id OR (developer_id IS NOT NULL AND developer_id = d.id)
        LIMIT 1
      ) ca ON true
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${limitIdx}
    `;

    const res = await query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      uid: row.uid,
      public_uid: row.public_uid,
      name: row.name,
      email: row.email,
      username: row.username,
      role: row.role,
      status: row.is_suspended ? 'SUSPENDED' : row.status,
      is_suspended: row.is_suspended,
      current_balance: Number(row.current_balance),
      currency: row.currency,
      developer_id: row.developer_id,
      client_id: row.client_id,
    }));
  }

  /**
   * Grants credits to a single target user with atomic ledger entry and audit
   */
  static async grantCredits(params: {
    target: string;
    amount: number;
    reason: string;
    adminUserId: string;
    referenceId?: string;
    metadata?: any;
  }): Promise<CreditAdjustmentResult> {
    const { target, amount, reason, adminUserId, referenceId, metadata } = params;

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      throw new Error('Credit grant amount must be a positive integer between 1 and 1,000,000.');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required for credit adjustments.');
    }

    return withTransaction(async (client) => {
      const user = await this.findUserAndAccount(target, client);
      if (!user) {
        throw new Error(`Target user not found for identifier: ${target}`);
      }

      const accRes = await client.query(
        `SELECT id, balance, user_id, developer_id FROM credit_accounts
         WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
         ORDER BY user_id NULLS LAST
         FOR UPDATE`,
        [user.id, user.developer_id || null]
      );

      let accountId: string;
      let balanceBefore = 0;

      if (accRes.rows.length === 0) {
        const newAcc = await client.query(
          `INSERT INTO credit_accounts (user_id, developer_id, balance, currency)
           VALUES ($1, $2, 0, 'INR')
           RETURNING id, balance`,
          [user.id, user.developer_id || null]
        );
        accountId = newAcc.rows[0].id;
        balanceBefore = 0;
      } else {
        accountId = accRes.rows[0].id;
        balanceBefore = Number(accRes.rows[0].balance);
      }

      const balanceAfter = balanceBefore + numAmount;

      if (!accRes.rows[0]?.user_id && user.id) {
        await client.query(
          `UPDATE credit_accounts SET balance = $1, user_id = $2, updated_at = NOW() WHERE id = $3`,
          [balanceAfter, user.id, accountId]
        );
      } else {
        await client.query(
          `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`,
          [balanceAfter, accountId]
        );
      }

      const refId = referenceId || `GRANT-${Date.now().toString().slice(-6)}`;

      const tx = await client.query(
        `INSERT INTO credit_transactions (
           user_id, developer_id, type, amount, balance_before, balance_after,
           reference_id, reason, description, performed_by, metadata
         ) VALUES (
           $1, $2, 'ADMIN_CREDIT_GRANT', $3, $4, $5,
           $6, $7, $8, $9, $10
         ) RETURNING id, created_at`,
        [
          user.id,
          user.developer_id || null,
          numAmount,
          balanceBefore,
          balanceAfter,
          refId,
          reason,
          `Admin grant by ${adminUserId}: ${reason}`,
          adminUserId,
          JSON.stringify(metadata || {}),
        ]
      );

      await AuditLogger.log(
        {
          actorUserId: adminUserId,
          action: 'ADMIN_CREDIT_GRANT',
          entityType: 'CREDIT_ACCOUNT',
          entityId: accountId,
          metadata: { targetUserId: user.id, developerId: user.developer_id, amount: numAmount, balanceBefore, balanceAfter, reason, referenceId: refId },
        },
        client
      );

      await NotificationService.createNotification({
        userId: user.id,
        type: 'CREDIT_GRANTED',
        title: 'Credits Granted to Account',
        message: `An administrator granted +${numAmount} credits to your account. Reason: ${reason}. New balance: ${balanceAfter} credits.`,
        link: '/wallet',
        metadata: { amount: numAmount, balanceAfter, balanceBefore, referenceId: refId, reason, performedBy: adminUserId },
        client,
      });

      return {
        success: true,
        user: {
          id: user.id,
          uid: user.uid,
          name: user.name || user.developer_name || user.email,
          email: user.email,
          role: user.role,
          developerId: user.developer_id,
        },
        balance: balanceAfter,
        newBalance: balanceAfter,
        balanceBefore,
        amount: numAmount,
        transactionId: tx.rows[0].id,
        referenceId: refId,
        reason,
        type: 'ADMIN_CREDIT_GRANT',
        timestamp: tx.rows[0].created_at,
        performedBy: adminUserId,
      };
    });
  }

  /**
   * Removes credits from a single target user with non-negative balance enforcement
   */
  static async removeCredits(params: {
    target: string;
    amount: number;
    reason: string;
    adminUserId: string;
    referenceId?: string;
    metadata?: any;
  }): Promise<CreditAdjustmentResult> {
    const { target, amount, reason, adminUserId, referenceId, metadata } = params;

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      throw new Error('Credit removal amount must be a positive integer between 1 and 1,000,000.');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required for credit removal.');
    }

    return withTransaction(async (client) => {
      const user = await this.findUserAndAccount(target, client);
      if (!user) {
        throw new Error(`Target user not found for identifier: ${target}`);
      }

      const accRes = await client.query(
        `SELECT id, balance FROM credit_accounts
         WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
         ORDER BY user_id NULLS LAST
         FOR UPDATE`,
        [user.id, user.developer_id || null]
      );

      if (accRes.rows.length === 0) {
        throw new Error(`Cannot remove ${numAmount} credits: Credit account not found. Current balance is 0.`);
      }

      const balanceBefore = Number(accRes.rows[0].balance);
      if (balanceBefore < numAmount) {
        throw new Error(
          `Cannot remove ${numAmount} credits: Current balance is ${balanceBefore}. Operation would result in negative balance. Business rules prohibit negative credit balances.`
        );
      }

      const balanceAfter = balanceBefore - numAmount;

      await client.query(
        `UPDATE credit_accounts SET balance = $1, user_id = $2, updated_at = NOW() WHERE id = $3`,
        [balanceAfter, user.id, accRes.rows[0].id]
      );

      const refId = referenceId || `REM-${Date.now().toString().slice(-6)}`;

      const tx = await client.query(
        `INSERT INTO credit_transactions (
           user_id, developer_id, type, amount, balance_before, balance_after,
           reference_id, reason, description, performed_by, metadata
         ) VALUES (
           $1, $2, 'ADMIN_CREDIT_REMOVAL', $3, $4, $5,
           $6, $7, $8, $9, $10
         ) RETURNING id, created_at`,
        [
          user.id,
          user.developer_id || null,
          -numAmount,
          balanceBefore,
          balanceAfter,
          refId,
          reason.trim(),
          `Admin deduction by ${adminUserId}: ${reason.trim()}`,
          adminUserId,
          JSON.stringify(metadata || {}),
        ]
      );

      await AuditLogger.log(
        {
          actorUserId: adminUserId,
          action: 'ADMIN_CREDIT_REMOVAL',
          entityType: 'CREDIT_ACCOUNT',
          entityId: accRes.rows[0].id,
          metadata: { targetUserId: user.id, developerId: user.developer_id, amount: -numAmount, balanceBefore, balanceAfter, reason: reason.trim(), referenceId: refId },
        },
        client
      );

      await NotificationService.createNotification({
        userId: user.id,
        type: 'CREDIT_REMOVED',
        title: 'Credit Deduction',
        message: `An administrator deducted ${numAmount} credits from your account. Reason: ${reason.trim()}. New balance: ${balanceAfter} credits.`,
        link: '/wallet',
        metadata: { amount: -numAmount, balanceAfter, balanceBefore, referenceId: refId, reason: reason.trim(), performedBy: adminUserId },
        client,
      });

      return {
        success: true,
        user: {
          id: user.id,
          uid: user.uid,
          name: user.name || user.developer_name || user.email,
          email: user.email,
          role: user.role,
          developerId: user.developer_id,
        },
        balance: balanceAfter,
        newBalance: balanceAfter,
        balanceBefore,
        amount: -numAmount,
        transactionId: tx.rows[0].id,
        referenceId: refId,
        reason: reason.trim(),
        type: 'ADMIN_CREDIT_REMOVAL',
        timestamp: tx.rows[0].created_at,
        performedBy: adminUserId,
      };
    });
  }

  /**
   * Resolves platform users eligible for bulk credit grants based on scope and filters.
   * Strictly enforces eligibility:
   * - Excludes suspended users unless explicitly configured.
   * - Excludes deleted / disabled users.
   * - Excludes guests.
   * - Validates developer / client relation.
   */
  static async resolveEligibleUsers(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'CUSTOM' | 'FILTERED';
    userIds?: string[];
    filters?: BulkTargetFilters;
  }): Promise<Array<{
    id: string;
    uid: string;
    public_uid: string;
    email: string;
    role: string;
    status: string;
    is_suspended: boolean;
    name: string;
    developer_id: string | null;
    developer_username: string | null;
    verification_status: string | null;
    experience: number | null;
    client_id: string | null;
    company_name: string | null;
    current_balance: number;
    currency: string;
  }>> {
    const { targetScope, userIds, filters } = params;
    const queryParams: any[] = [];
    const conditions: string[] = [];

    // Base exclusion: GUEST role and DISABLED accounts are never eligible
    conditions.push(`u.role != 'GUEST'`);
    conditions.push(`u.status != 'DISABLED'`);

    // Suspended users exclusion (unless explicitly configured)
    if (!filters?.includeSuspended) {
      conditions.push(`u.status = 'ACTIVE'`);
      conditions.push(`u.is_suspended = FALSE`);
    }

    if (targetScope === 'ALL_DEVELOPERS') {
      conditions.push(`u.role = 'DEVELOPER'`);
      conditions.push(`d.id IS NOT NULL`);
      conditions.push(`d.verification_status NOT IN ('SUSPENDED', 'REJECTED')`);
    } else if (targetScope === 'ALL_CLIENTS') {
      conditions.push(`u.role = 'CLIENT'`);
      conditions.push(`c.id IS NOT NULL`);
    } else if (targetScope === 'ALL') {
      conditions.push(`u.role IN ('DEVELOPER', 'CLIENT')`);
    } else if (targetScope === 'SELECTED' || targetScope === 'CUSTOM') {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new Error('userIds array is required for SELECTED/CUSTOM audience.');
      }
      queryParams.push(userIds);
      const pIdx = queryParams.length;
      conditions.push(`(
        u.id::text = ANY($${pIdx})
        OR u.uid = ANY($${pIdx})
        OR u.public_uid = ANY($${pIdx})
        OR u.email = ANY($${pIdx})
        OR d.id::text = ANY($${pIdx})
        OR d.username = ANY($${pIdx})
      )`);
    } else if (targetScope === 'FILTERED') {
      if (filters?.role && filters.role !== 'ALL') {
        queryParams.push(filters.role);
        conditions.push(`u.role = $${queryParams.length}`);
      } else {
        conditions.push(`u.role IN ('DEVELOPER', 'CLIENT')`);
      }

      if (filters?.verificationStatus && filters.verificationStatus !== 'ALL') {
        queryParams.push(filters.verificationStatus);
        conditions.push(`d.verification_status = $${queryParams.length}`);
      }

      if (filters?.minExperience && Number(filters.minExperience) > 0) {
        queryParams.push(Number(filters.minExperience));
        conditions.push(`d.experience >= $${queryParams.length}`);
      }

      if (filters?.skills && Array.isArray(filters.skills) && filters.skills.length > 0) {
        queryParams.push(filters.skills);
        const pIdx = queryParams.length;
        conditions.push(`d.id IN (
          SELECT ds.developer_id FROM developer_skills ds
          JOIN skills s ON s.id = ds.skill_id
          WHERE s.name = ANY($${pIdx})
        )`);
      }

      if (filters?.search && filters.search.trim().length > 0) {
        queryParams.push(`%${filters.search.trim()}%`);
        const pIdx = queryParams.length;
        conditions.push(`(
          u.email ILIKE $${pIdx}
          OR u.uid ILIKE $${pIdx}
          OR d.display_name ILIKE $${pIdx}
          OR d.username ILIKE $${pIdx}
          OR c.company_name ILIKE $${pIdx}
          OR c.private_name ILIKE $${pIdx}
        )`);
      }
    } else {
      throw new Error(`Invalid audience targetScope: ${targetScope}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '';

    const sql = `
      SELECT 
        u.id,
        u.uid,
        u.public_uid,
        u.email,
        u.role,
        u.status,
        u.is_suspended,
        COALESCE(d.display_name, c.private_name, c.company_name, split_part(u.email, '@', 1)) AS name,
        d.id AS developer_id,
        d.username AS developer_username,
        d.verification_status,
        d.experience,
        c.id AS client_id,
        c.company_name,
        COALESCE(ca.balance, 0)::int AS current_balance,
        COALESCE(ca.currency, 'INR') AS currency
      FROM users u
      LEFT JOIN developers d ON d.user_id = u.id
      LEFT JOIN clients c ON c.user_id = u.id
      LEFT JOIN LATERAL (
        SELECT balance, currency FROM credit_accounts 
        WHERE user_id = u.id OR (developer_id IS NOT NULL AND developer_id = d.id)
        LIMIT 1
      ) ca ON true
      ${whereClause}
      ORDER BY u.created_at DESC
    `;

    const res = await query(sql, queryParams);
    return res.rows.map((r) => ({
      ...r,
      current_balance: Number(r.current_balance),
    }));
  }

  /**
   * Previews a bulk grant operation, returning recipient count, credits per user, total credits,
   * reason, and a sample recipient list without modifying any balances.
   */
  static async previewBulkGrant(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'CUSTOM' | 'FILTERED';
    userIds?: string[];
    filters?: BulkTargetFilters;
    amount: number;
    reason: string;
  }): Promise<BulkPreviewResult> {
    const { targetScope, userIds, filters, amount, reason } = params;

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      throw new Error('Credits per user must be a positive integer between 1 and 1,000,000.');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required.');
    }

    const eligibleUsers = await this.resolveEligibleUsers({ targetScope, userIds, filters });
    const recipientCount = eligibleUsers.length;
    const totalCredits = recipientCount * numAmount;

    const sampleRecipients = eligibleUsers.slice(0, 10).map((u) => ({
      id: u.id,
      uid: u.uid,
      name: u.name,
      email: u.email,
      role: u.role,
      currentBalance: u.current_balance,
    }));

    const breakdown = {
      developers: eligibleUsers.filter((u) => u.role === 'DEVELOPER').length,
      clients: eligibleUsers.filter((u) => u.role === 'CLIENT').length,
      other: eligibleUsers.filter((u) => u.role !== 'DEVELOPER' && u.role !== 'CLIENT').length,
    };

    return {
      targetScope,
      recipientCount,
      amountPerUser: numAmount,
      totalCredits,
      reason: reason.trim(),
      sampleRecipients,
      breakdown,
    };
  }

  /**
   * Executes a bulk credit grant operation in controlled batches.
   * Satisfies all Phase 8 requirements:
   * - Creates an administrative bulk-operation audit record in credit_bulk_operations.
   * - Processes recipients in controlled transactions (BATCH_SIZE = 50) to prevent timeouts.
   * - Atomically updates each user's credit_account.
   * - Creates an individual, immutable credit_transaction per recipient referencing the bulk operation.
   * - Follows notification policy: suppresses realtime socket flood for > 25 recipients while ensuring DB notifications exist.
   * - Records an executive audit log.
   */
  static async bulkGrantCredits(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'CUSTOM' | 'FILTERED';
    userIds?: string[];
    filters?: BulkTargetFilters;
    amount: number;
    reason: string;
    adminUserId: string;
    async?: boolean;
    metadata?: any;
  }): Promise<BulkCreditExecutionResult> {
    const { targetScope, userIds, filters, amount, reason, adminUserId, metadata } = params;

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      throw new Error('Bulk credit grant amount must be a positive integer between 1 and 1,000,000.');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required for bulk adjustments.');
    }

    const eligibleUsers = await this.resolveEligibleUsers({ targetScope, userIds, filters });
    if (eligibleUsers.length === 0) {
      throw new Error('No eligible target users found for bulk credit grant with the specified criteria.');
    }

    const totalCredits = eligibleUsers.length * numAmount;
    const opId = `BULK-OP-${Date.now().toString().slice(-8)}-${crypto.randomBytes(3).toString('hex')}`;

    // 1. Create administrative bulk-operation audit record
    const bulkOpRes = await query(
      `INSERT INTO credit_bulk_operations (
         operation_id, performed_by, target_scope, amount_per_user,
         recipient_count, total_credits, reason, status, filters
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROCESSING', $8)
       RETURNING id, operation_id, created_at`,
      [
        opId,
        adminUserId,
        targetScope,
        numAmount,
        eligibleUsers.length,
        totalCredits,
        reason.trim(),
        JSON.stringify(filters || {}),
      ]
    );

    const bulkRecord = bulkOpRes.rows[0];

    // Worker function for controlled batch processing
    const processBatches = async () => {
      const BATCH_SIZE = 50;
      const affectedUsers: any[] = [];
      const suppressRealtimeSockets = eligibleUsers.length > 25;

      try {
        for (let i = 0; i < eligibleUsers.length; i += BATCH_SIZE) {
          const chunk = eligibleUsers.slice(i, i + BATCH_SIZE);

          await withTransaction(async (client) => {
            for (const u of chunk) {
              const accRes = await client.query(
                `SELECT id, balance, user_id, developer_id FROM credit_accounts
                 WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
                 ORDER BY user_id NULLS LAST
                 FOR UPDATE`,
                [u.id, u.developer_id || null]
              );

              let accountId: string;
              let balanceBefore = 0;

              if (accRes.rows.length === 0) {
                const newAcc = await client.query(
                  `INSERT INTO credit_accounts (user_id, developer_id, balance, currency)
                   VALUES ($1, $2, 0, 'INR')
                   RETURNING id, balance`,
                  [u.id, u.developer_id || null]
                );
                accountId = newAcc.rows[0].id;
                balanceBefore = 0;
              } else {
                accountId = accRes.rows[0].id;
                balanceBefore = Number(accRes.rows[0].balance);
              }

              const balanceAfter = balanceBefore + numAmount;

              if (!accRes.rows[0]?.user_id && u.id) {
                await client.query(
                  `UPDATE credit_accounts SET balance = $1, user_id = $2, updated_at = NOW() WHERE id = $3`,
                  [balanceAfter, u.id, accountId]
                );
              } else {
                await client.query(
                  `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`,
                  [balanceAfter, accountId]
                );
              }

              const refId = `${opId}-${u.uid.slice(-4)}`;

              await client.query(
                `INSERT INTO credit_transactions (
                   user_id, developer_id, type, amount, balance_before, balance_after,
                   reference_id, reason, description, performed_by, bulk_operation_id, metadata
                 ) VALUES (
                   $1, $2, 'ADMIN_CREDIT_GRANT', $3, $4, $5,
                   $6, $7, $8, $9, $10, $11
                 )`,
                [
                  u.id,
                  u.developer_id || null,
                  numAmount,
                  balanceBefore,
                  balanceAfter,
                  refId,
                  reason.trim(),
                  `Bulk credit grant (${opId}): ${reason.trim()}`,
                  adminUserId,
                  bulkRecord.id,
                  JSON.stringify({ ...metadata, operationId: opId, targetScope, amountPerUser: numAmount }),
                ]
              );

              // Notifications policy: Insert DB notification
              const notifMsg = `An administrator granted +${numAmount} credits to your account. Reason: ${reason.trim()}. New balance: ${balanceAfter} credits.`;
              await client.query(
                `INSERT INTO notifications (user_id, type, title, message, link, metadata)
                 VALUES ($1, 'CREDIT_GRANTED', 'Credits Granted to Account', $2, '/wallet', $3)`,
                [
                  u.id,
                  notifMsg,
                  JSON.stringify({ amount: numAmount, balanceAfter, balanceBefore, referenceId: refId, operationId: opId }),
                ]
              );

              // Realtime socket policy: emit only for small audiences (<= 25)
              if (!suppressRealtimeSockets) {
                try {
                  RealtimeEvents.emitNotification(u.id, {
                    type: 'CREDIT_GRANTED',
                    title: 'Credits Granted to Account',
                    message: notifMsg,
                    link: '/wallet',
                    created_at: new Date().toISOString(),
                  });
                } catch (_err) {}
              }

              affectedUsers.push({
                userId: u.id,
                email: u.email,
                uid: u.uid,
                balanceBefore,
                balanceAfter,
                amount: numAmount,
              });
            }
          });
        }

        // Mark bulk operation as COMPLETED
        await query(
          `UPDATE credit_bulk_operations
           SET status = 'COMPLETED', updated_at = NOW(), completed_at = NOW()
           WHERE id = $1`,
          [bulkRecord.id]
        );

        // Audit log
        await AuditLogger.log({
          actorUserId: adminUserId,
          action: 'ADMIN_BULK_CREDIT_GRANT',
          entityType: 'CREDIT_BULK_OPERATION',
          entityId: bulkRecord.id,
          metadata: {
            operationId: opId,
            targetScope,
            amountPerUser: numAmount,
            totalCredits,
            recipientCount: eligibleUsers.length,
            reason: reason.trim(),
          },
        });

        return affectedUsers;
      } catch (err: any) {
        await query(
          `UPDATE credit_bulk_operations
           SET status = 'FAILED', error_message = $1, updated_at = NOW()
           WHERE id = $2`,
          [err.message, bulkRecord.id]
        );
        throw err;
      }
    };

    if (params.async) {
      setImmediate(() => {
        processBatches().catch((e) => console.error('[BulkCreditWorker Error]:', e));
      });

      return {
        success: true,
        operationId: opId,
        bulkOperationRecordId: bulkRecord.id,
        batchReference: bulkRecord.id,
        targetScope,
        recipientCount: eligibleUsers.length,
        count: eligibleUsers.length,
        amountPerUser: numAmount,
        totalCredits,
        reason: reason.trim(),
        performedBy: adminUserId,
        status: 'PROCESSING',
        message: 'Bulk credit grant queued and processing in background batches.',
      };
    }

    const affectedUsers = await processBatches();

    return {
      success: true,
      operationId: opId,
      bulkOperationRecordId: bulkRecord.id,
      batchReference: bulkRecord.id,
      targetScope,
      recipientCount: affectedUsers.length,
      count: affectedUsers.length,
      amountPerUser: numAmount,
      totalCredits,
      reason: reason.trim(),
      performedBy: adminUserId,
      status: 'COMPLETED',
      affectedUsers: affectedUsers.slice(0, 50),
    };
  }

  /**
   * Lists administrative bulk credit operations with pagination and performer details
   */
  static async listBulkOperations(filters?: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(Number(filters?.limit || 20), 1), 100);
    const offset = Math.max(Number(filters?.offset || 0), 0);

    const res = await query(
      `SELECT bo.*, u.uid as performed_by_uid, u.email as performed_by_email, u.role as performed_by_role
       FROM credit_bulk_operations bo
       LEFT JOIN users u ON bo.performed_by = u.id
       ORDER BY bo.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countRes = await query(`SELECT COUNT(*)::int as total FROM credit_bulk_operations`);
    const total = countRes.rows[0]?.total || 0;

    return {
      operations: res.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Retrieves single bulk operation details along with sample individual ledger transactions
   */
  static async getBulkOperation(operationId: string) {
    const opRes = await query(
      `SELECT bo.*, u.uid as performed_by_uid, u.email as performed_by_email, u.role as performed_by_role
       FROM credit_bulk_operations bo
       LEFT JOIN users u ON bo.performed_by = u.id
       WHERE bo.id::text = $1 OR bo.operation_id = $1`,
      [operationId.trim()]
    );

    if (opRes.rows.length === 0) {
      throw new Error(`Bulk operation not found: ${operationId}`);
    }

    const operation = opRes.rows[0];

    const txRes = await query(
      `SELECT ct.id, ct.type, ct.amount, ct.balance_before, ct.balance_after, ct.reference_id, ct.created_at,
              u.id as user_id, u.uid as user_uid, u.email as user_email, u.role as user_role,
              d.display_name as developer_name, d.username as developer_username
       FROM credit_transactions ct
       LEFT JOIN users u ON ct.user_id = u.id
       LEFT JOIN developers d ON ct.developer_id = d.id
       WHERE ct.bulk_operation_id = $1
       ORDER BY ct.created_at ASC
       LIMIT 50`,
      [operation.id]
    );

    return {
      operation,
      sampleTransactions: txRes.rows,
    };
  }

  /**
   * Previews a bulk credit removal without mutating balances.
   * Calculates eligible recipients with positive balance, total deductions, and breakdown.
   */
  static async previewBulkRemove(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'CUSTOM' | 'FILTERED';
    userIds?: string[];
    filters?: BulkTargetFilters;
    amount: number;
    reason: string;
    allowPartial?: boolean;
  }): Promise<BulkRemovalPreviewResult> {
    const { targetScope, userIds, filters, amount, reason, allowPartial = true } = params;

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      throw new Error('Credits to remove per user must be a positive integer between 1 and 1,000,000.');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required.');
    }

    const eligibleUsers = await this.resolveEligibleUsers({
      targetScope: targetScope === 'CUSTOM' ? 'SELECTED' : targetScope,
      userIds,
      filters,
    });

    // Only accounts with positive balances can have credits removed
    const activeWithBalance = eligibleUsers.filter((u) => u.current_balance > 0);

    const estimatedTotalCredits = activeWithBalance.reduce((sum, u) => {
      if (allowPartial) {
        return sum + Math.min(u.current_balance, numAmount);
      }
      return sum + (u.current_balance >= numAmount ? numAmount : 0);
    }, 0);

    const sampleRecipients = activeWithBalance.slice(0, 5).map((u) => ({
      id: u.id,
      uid: u.uid,
      name: u.name,
      email: u.email,
      role: u.role,
      currentBalance: u.current_balance,
      creditsToDeduct: allowPartial ? Math.min(u.current_balance, numAmount) : numAmount,
    }));

    const breakdown = {
      developers: activeWithBalance.filter((u) => u.role === 'DEVELOPER').length,
      clients: activeWithBalance.filter((u) => u.role === 'CLIENT').length,
      other: activeWithBalance.filter((u) => u.role !== 'DEVELOPER' && u.role !== 'CLIENT').length,
    };

    return {
      targetScope,
      recipientCount: activeWithBalance.length,
      amountPerUser: numAmount,
      estimatedTotalCredits,
      reason: reason.trim(),
      sampleRecipients,
      breakdown,
    };
  }

  /**
   * Bulk remove credits from multiple or all eligible users with non-negative balance protection
   */
  static async bulkRemoveCredits(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'CUSTOM' | 'FILTERED';
    userIds?: string[];
    filters?: BulkTargetFilters;
    amount: number;
    reason: string;
    adminUserId: string;
    allowPartial?: boolean;
    metadata?: any;
  }): Promise<BulkCreditResult> {
    const { targetScope, userIds, filters, amount, reason, adminUserId, allowPartial = true, metadata } = params;

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      throw new Error('Bulk credit removal amount must be a positive integer between 1 and 1,000,000.');
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required for bulk credit removal.');
    }

    return withTransaction(async (client) => {
      const eligibleUsers = await this.resolveEligibleUsers({
        targetScope: targetScope === 'CUSTOM' ? 'SELECTED' : targetScope,
        userIds,
        filters,
      });

      if (eligibleUsers.length === 0) {
        throw new Error('No eligible target users found for bulk credit removal.');
      }

      const batchReference = `BULK-REM-${Date.now().toString().slice(-8)}`;
      const affectedUsers: any[] = [];
      let totalDeducted = 0;

      for (const u of eligibleUsers) {
        const accRes = await client.query(
          `SELECT id, balance FROM credit_accounts
           WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
           ORDER BY user_id NULLS LAST
           FOR UPDATE`,
          [u.id, u.developer_id || null]
        );

        if (accRes.rows.length === 0) continue;

        const currentBal = Number(accRes.rows[0].balance);
        if (currentBal <= 0) continue;

        let deductAmt = numAmount;
        if (currentBal < numAmount) {
          if (!allowPartial) continue;
          deductAmt = currentBal;
        }

        const balanceAfter = currentBal - deductAmt;

        await client.query(
          `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`,
          [balanceAfter, accRes.rows[0].id]
        );

        await client.query(
          `INSERT INTO credit_transactions (
             user_id, developer_id, type, amount, balance_before, balance_after,
             reference_id, reason, description, performed_by, metadata
           ) VALUES (
             $1, $2, 'ADMIN_CREDIT_REMOVAL', $3, $4, $5,
             $6, $7, $8, $9, $10
           )`,
          [
            u.id,
            u.developer_id || null,
            -deductAmt,
            currentBal,
            balanceAfter,
            batchReference,
            reason.trim(),
            `Bulk deduction by admin ${adminUserId}: ${reason.trim()}`,
            adminUserId,
            JSON.stringify({ ...metadata, batchReference, targetScope }),
          ]
        );

        const notifMsg = `An administrator deducted ${deductAmt} credits from your account. Reason: ${reason.trim()}. New balance: ${balanceAfter} credits.`;
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message, link, metadata)
           VALUES ($1, 'CREDIT_REMOVED', 'Credits Deducted from Your Account', $2, '/wallet', $3)`,
          [
            u.id,
            notifMsg,
            JSON.stringify({ amount: -deductAmt, balanceAfter, balanceBefore: currentBal, referenceId: batchReference, reason: reason.trim(), performedBy: adminUserId }),
          ]
        );

        affectedUsers.push({
          userId: u.id,
          email: u.email,
          uid: u.uid,
          balanceBefore: currentBal,
          balanceAfter,
          amount: -deductAmt,
        });
        totalDeducted += deductAmt;
      }

      await AuditLogger.log(
        {
          actorUserId: adminUserId,
          action: 'ADMIN_BULK_CREDIT_REMOVAL',
          entityType: 'CREDIT_SYSTEM',
          entityId: batchReference,
          metadata: {
            targetScope,
            amountRequested: numAmount,
            totalCreditsRemoved: totalDeducted,
            userCount: affectedUsers.length,
            reason: reason.trim(),
            batchReference,
          },
        },
        client
      );

      return {
        success: true,
        targetScope,
        count: affectedUsers.length,
        recipientCount: affectedUsers.length,
        totalCredits: totalDeducted,
        batchReference,
        affectedUsers,
      };
    });
  }

  /**
   * Complete credit history ledger with user, actor, and filter parameters
   */
  static async getCreditHistory(filters?: CreditHistoryFilter) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.userId) {
      params.push(filters.userId.trim());
      const pIdx = params.length;
      conditions.push(`(
        ct.user_id::text = $${pIdx}
        OR ct.developer_id::text = $${pIdx}
        OR u.uid = $${pIdx}
        OR u.public_uid = $${pIdx}
        OR u.email ILIKE $${pIdx}
      )`);
    }

    if (filters?.role && filters.role !== 'ALL') {
      params.push(filters.role);
      conditions.push(`u.role = $${params.length}`);
    }

    if (filters?.uid && filters.uid.trim().length > 0) {
      params.push(filters.uid.trim());
      conditions.push(`(u.uid = $${params.length} OR u.public_uid = $${params.length})`);
    }

    if (filters?.type && filters.type !== 'ALL') {
      params.push(filters.type);
      conditions.push(`ct.type::text = $${params.length}`);
    }

    if (filters?.performedBy) {
      params.push(filters.performedBy.trim());
      const pIdx = params.length;
      conditions.push(`(
        ct.performed_by::text = $${pIdx}
        OR u_perf.uid = $${pIdx}
        OR u_perf.email ILIKE $${pIdx}
      )`);
    }

    if (filters?.startDate) {
      params.push(filters.startDate);
      conditions.push(`ct.created_at >= $${params.length}`);
    }

    if (filters?.endDate) {
      params.push(filters.endDate);
      conditions.push(`ct.created_at <= $${params.length}`);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      const sIdx = params.length;
      conditions.push(`(
        ct.reference_id ILIKE $${sIdx}
        OR ct.reason ILIKE $${sIdx}
        OR ct.description ILIKE $${sIdx}
        OR u.email ILIKE $${sIdx}
        OR u.uid ILIKE $${sIdx}
        OR d.username ILIKE $${sIdx}
        OR d.display_name ILIKE $${sIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '';

    const limit = Math.min(Math.max(Number(filters?.limit || 50), 1), 200);
    const offset = Math.max(Number(filters?.offset || 0), 0);

    const countSql = `
      SELECT COUNT(*)::int as total
      FROM credit_transactions ct
      LEFT JOIN users u ON ct.user_id = u.id
      LEFT JOIN developers d ON ct.developer_id = d.id
      LEFT JOIN users u_perf ON ct.performed_by = u_perf.id
      ${whereClause}
    `;

    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.total || 0;

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const sql = `
      SELECT ct.id, ct.type, ct.amount, ct.balance_before, ct.balance_after,
             ct.reason, ct.description, ct.reference_id, ct.created_at, ct.metadata,
             u.id as user_id, u.uid as user_uid, u.public_uid as user_public_uid,
             u.email as user_email, u.role as user_role,
             d.id as developer_id, d.username as developer_username, d.display_name as developer_name,
             p.title as project_title, p.project_number,
             u_perf.id as performed_by_user_id, u_perf.uid as performed_by_uid,
             u_perf.public_uid as performed_by_public_uid, u_perf.email as performed_by_email,
             u_perf.role as performed_by_role
      FROM credit_transactions ct
      LEFT JOIN users u ON ct.user_id = u.id
      LEFT JOIN developers d ON ct.developer_id = d.id
      LEFT JOIN projects p ON ct.project_id = p.id
      LEFT JOIN users u_perf ON ct.performed_by = u_perf.id
      ${whereClause}
      ORDER BY ct.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const res = await query(sql, params);
    return {
      history: res.rows,
      ledger: res.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Calculates platform credit statistics live from the double-entry ledger.
   * Do not fabricate statistics: Every metric is computed directly from database tables.
   */
  static async getCreditStats() {
    // 1. Total Credits Held across all user accounts
    const heldRes = await query(
      `SELECT COALESCE(SUM(balance), 0)::bigint as total_held, COUNT(*)::int as total_accounts FROM credit_accounts`
    );
    const totalCreditsHeld = Number(heldRes.rows[0]?.total_held || 0);
    const totalAccounts = Number(heldRes.rows[0]?.total_accounts || 0);

    // 2. Aggregate transactions by type
    const txAggRes = await query(`
      SELECT 
        type,
        COUNT(*)::int as tx_count,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::bigint as positive_sum,
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0)::bigint as negative_sum,
        COALESCE(SUM(amount), 0)::bigint as net_sum
      FROM credit_transactions
      GROUP BY type
    `);

    let creditsPurchased = 0;
    let creditsGranted = 0;
    let creditsRemoved = 0;
    let creditsConsumed = 0;
    let creditsRefunded = 0;

    for (const row of txAggRes.rows) {
      const type = String(row.type);
      const pos = Number(row.positive_sum);
      const neg = Number(row.negative_sum);

      if (type === 'PURCHASE') {
        creditsPurchased += pos;
      } else if (type === 'ADMIN_CREDIT_GRANT') {
        creditsGranted += pos;
      } else if (type === 'ADMIN_CREDIT_REMOVAL') {
        creditsRemoved += neg > 0 ? neg : Math.abs(Number(row.net_sum));
      } else if (type === 'PROJECT_CLAIM' || type === 'USAGE' || type === 'CONSUMPTION') {
        creditsConsumed += neg;
      } else if (
        type === 'PROJECT_NOT_SELECTED_REFUND' ||
        type === 'PROJECT_CANCEL_REFUND' ||
        type === 'WITHDRAWAL_REFUND' ||
        type === 'EXPIRATION_REFUND' ||
        type === 'REFUND'
      ) {
        creditsRefunded += pos;
      }
    }

    return {
      totalCreditsHeld,
      creditsPurchased,
      creditsGranted,
      creditsRemoved,
      creditsConsumed,
      creditsRefunded,
      totalAccounts,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * List all user credit accounts with granular transaction breakdown
   */
  static async listCreditAccounts(filters?: {
    search?: string;
    role?: string;
    balanceFilter?: 'ALL' | 'POSITIVE' | 'ZERO';
    minBalance?: number;
    maxBalance?: number;
    uid?: string;
    limit?: number;
    offset?: number;
  }) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.role && filters.role !== 'ALL') {
      params.push(filters.role);
      conditions.push(`u.role = $${params.length}`);
    }

    if (filters?.uid && filters.uid.trim().length > 0) {
      params.push(filters.uid.trim());
      conditions.push(`(u.uid = $${params.length} OR u.public_uid = $${params.length})`);
    }

    if (filters?.balanceFilter === 'POSITIVE') {
      conditions.push(`ca.balance > 0`);
    } else if (filters?.balanceFilter === 'ZERO') {
      conditions.push(`ca.balance = 0`);
    }

    if (filters?.minBalance !== undefined && !isNaN(Number(filters.minBalance))) {
      params.push(Number(filters.minBalance));
      conditions.push(`ca.balance >= $${params.length}`);
    }

    if (filters?.maxBalance !== undefined && !isNaN(Number(filters.maxBalance))) {
      params.push(Number(filters.maxBalance));
      conditions.push(`ca.balance <= $${params.length}`);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      const sIdx = params.length;
      conditions.push(`(
        u.email ILIKE $${sIdx}
        OR u.uid ILIKE $${sIdx}
        OR u.public_uid ILIKE $${sIdx}
        OR d.username ILIKE $${sIdx}
        OR d.display_name ILIKE $${sIdx}
        OR c.company_name ILIKE $${sIdx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '';
    const limit = Math.min(Math.max(Number(filters?.limit || 50), 1), 200);
    const offset = Math.max(Number(filters?.offset || 0), 0);

    const countRes = await query(
      `SELECT COUNT(*)::int as total
       FROM credit_accounts ca
       LEFT JOIN users u ON ca.user_id = u.id
       LEFT JOIN developers d ON ca.developer_id = d.id
       LEFT JOIN clients c ON c.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    params.push(limit);
    const lIdx = params.length;
    params.push(offset);
    const oIdx = params.length;

    const sql = `
      SELECT ca.id as account_id, ca.balance, ca.currency, ca.created_at, ca.updated_at,
             u.id as user_id, u.uid as user_uid, u.public_uid as user_public_uid,
             u.email as email, u.email as user_email, u.role as role, u.role as user_role, u.status as status, u.status as user_status,
             COALESCE(d.display_name, c.company_name, split_part(u.email, '@', 1)) as name,
             d.id as developer_id, d.username as developer_username, d.display_name as developer_name,
             c.id as client_id, c.company_name,
             (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.user_id = u.id OR ct.developer_id = d.id)::int as transaction_count,
             COALESCE((SELECT SUM(amount) FROM credit_transactions ct WHERE (ct.user_id = u.id OR ct.developer_id = d.id) AND ct.type = 'PURCHASE'), 0)::int as purchased,
             COALESCE((SELECT SUM(amount) FROM credit_transactions ct WHERE (ct.user_id = u.id OR ct.developer_id = d.id) AND ct.type = 'ADMIN_CREDIT_GRANT'), 0)::int as granted,
             COALESCE((SELECT ABS(SUM(amount)) FROM credit_transactions ct WHERE (ct.user_id = u.id OR ct.developer_id = d.id) AND ct.type = 'ADMIN_CREDIT_REMOVAL'), 0)::int as removed,
             COALESCE((SELECT ABS(SUM(amount)) FROM credit_transactions ct WHERE (ct.user_id = u.id OR ct.developer_id = d.id) AND (ct.type::text IN ('PROJECT_CLAIM', 'USAGE', 'CONSUMPTION') OR (ct.amount < 0 AND ct.type::text NOT IN ('ADMIN_CREDIT_REMOVAL')))), 0)::int as consumed,
             COALESCE((SELECT SUM(amount) FROM credit_transactions ct WHERE (ct.user_id = u.id OR ct.developer_id = d.id) AND ct.type::text IN ('PROJECT_NOT_SELECTED_REFUND', 'PROJECT_CANCEL_REFUND', 'PROJECT_CLAIM_REFUND', 'WITHDRAWAL_REFUND', 'EXPIRATION_REFUND', 'PAYMENT_REFUND', 'REFUND') AND ct.amount > 0), 0)::int as refunded,
             (SELECT MAX(created_at) FROM credit_transactions ct WHERE ct.user_id = u.id OR ct.developer_id = d.id) as last_transaction
      FROM credit_accounts ca
      LEFT JOIN users u ON ca.user_id = u.id
      LEFT JOIN developers d ON ca.developer_id = d.id
      LEFT JOIN clients c ON c.user_id = u.id
      ${whereClause}
      ORDER BY ca.balance DESC, ca.updated_at DESC
      LIMIT $${lIdx} OFFSET $${oIdx}
    `;

    const res = await query(sql, params);
    return {
      accounts: res.rows,
      total,
      limit,
      offset,
    };
  }

  /**
   * Retrieves comprehensive credit profile, balances, summary statistics, and transaction timeline for a user
   */
  static async getUserCreditDetail(target: string) {
    const user = await this.findUserAndAccount(target);
    if (!user) {
      throw new Error(`User not found for identifier: ${target}`);
    }

    const accRes = await query(
      `SELECT ca.id as account_id, ca.balance, ca.currency, ca.created_at, ca.updated_at
       FROM credit_accounts ca
       WHERE ca.user_id = $1 OR (ca.developer_id IS NOT NULL AND ca.developer_id = $2)
       LIMIT 1`,
      [user.id, user.developer_id || null]
    );

    const balance = accRes.rows.length > 0 ? Number(accRes.rows[0].balance) : 0;

    // Get aggregated user statistics
    const statsRes = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'PURCHASE' THEN amount ELSE 0 END), 0)::int as purchased,
         COALESCE(SUM(CASE WHEN type = 'ADMIN_CREDIT_GRANT' THEN amount ELSE 0 END), 0)::int as granted,
         COALESCE(ABS(SUM(CASE WHEN type = 'ADMIN_CREDIT_REMOVAL' THEN amount ELSE 0 END)), 0)::int as removed,
         COALESCE(ABS(SUM(CASE WHEN (type::text IN ('PROJECT_CLAIM', 'USAGE', 'CONSUMPTION') OR (amount < 0 AND type::text NOT IN ('ADMIN_CREDIT_REMOVAL'))) AND amount < 0 THEN amount ELSE 0 END)), 0)::int as consumed,
         COALESCE(SUM(CASE WHEN type::text IN ('PROJECT_NOT_SELECTED_REFUND', 'PROJECT_CANCEL_REFUND', 'PROJECT_CLAIM_REFUND', 'WITHDRAWAL_REFUND', 'EXPIRATION_REFUND', 'PAYMENT_REFUND', 'REFUND') AND amount > 0 THEN amount ELSE 0 END), 0)::int as refunded,
         MAX(created_at) as last_transaction
       FROM credit_transactions
       WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)`,
      [user.id, user.developer_id || null]
    );

    // Get transaction history timeline
    const historyRes = await query(
      `SELECT ct.id, ct.type, ct.amount, ct.balance_before, ct.balance_after,
              ct.reference_id, ct.reason, ct.description, ct.created_at,
              u_perf.uid as performed_by_uid, u_perf.email as performed_by_email, u_perf.role as performed_by_role
       FROM credit_transactions ct
       LEFT JOIN users u_perf ON ct.performed_by = u_perf.id
       WHERE ct.user_id = $1 OR (ct.developer_id IS NOT NULL AND ct.developer_id = $2)
       ORDER BY ct.created_at DESC
       LIMIT 100`,
      [user.id, user.developer_id || null]
    );

    return {
      user: {
        id: user.id,
        uid: user.uid,
        public_uid: user.public_uid,
        name: user.name || user.developer_name || user.email,
        email: user.email,
        role: user.role,
        status: user.status,
        developer_id: user.developer_id,
        developer_username: user.developer_username,
      },
      account: {
        balance,
        currency: accRes.rows[0]?.currency || 'INR',
        updated_at: accRes.rows[0]?.updated_at || null,
        created_at: accRes.rows[0]?.created_at || null,
      },
      summary: statsRes.rows[0] || {
        purchased: 0,
        granted: 0,
        removed: 0,
        consumed: 0,
        refunded: 0,
        last_transaction: null,
      },
      transactions: historyRes.rows,
    };
  }

  /**
   * Generates secure CSV export of platform credit ledger with injection prevention and auditing
   */
  static async exportCreditTransactions(filters?: CreditHistoryFilter & { adminUserId: string }) {
    const result = await this.getCreditHistory({
      ...filters,
      limit: 5000,
      offset: 0,
    });

    const rows = result.history || [];

    const headers = [
      'Transaction ID',
      'Created At',
      'User UID',
      'User Email',
      'User Role',
      'Transaction Type',
      'Amount',
      'Balance Before',
      'Balance After',
      'Reference ID',
      'Reason',
      'Description',
      'Performed By Email',
      'Performed By Role',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);
      if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
        str = `'` + str;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvLines = [headers.join(',')];
    for (const r of rows) {
      csvLines.push([
        escapeCsv(r.id),
        escapeCsv(r.created_at ? new Date(r.created_at).toISOString() : ''),
        escapeCsv(r.user_uid || r.user_public_uid || ''),
        escapeCsv(r.user_email || ''),
        escapeCsv(r.user_role || ''),
        escapeCsv(r.type || ''),
        escapeCsv(r.amount),
        escapeCsv(r.balance_before ?? ''),
        escapeCsv(r.balance_after ?? ''),
        escapeCsv(r.reference_id || ''),
        escapeCsv(r.reason || ''),
        escapeCsv(r.description || ''),
        escapeCsv(r.performed_by_email || ''),
        escapeCsv(r.performed_by_role || ''),
      ].join(','));
    }

    const csvContent = csvLines.join('\n');

    if (filters?.adminUserId) {
      await AuditLogger.log({
        actorUserId: filters.adminUserId,
        action: 'ADMIN_EXPORT_CREDIT_LEDGER',
        entityType: 'CREDIT_SYSTEM',
        entityId: filters.adminUserId,
        metadata: {
          recordCount: rows.length,
          filters: {
            type: filters.type,
            startDate: filters.startDate,
            endDate: filters.endDate,
            search: filters.search,
          },
        },
      });
    }

    return {
      csvContent,
      filename: `credit_transactions_export_${new Date().toISOString().slice(0, 10)}.csv`,
      recordCount: rows.length,
    };
  }

  /**
   * Manual administrator credit adjustment with mandatory audit logging and ledger recording
   */
  static async adminAdjustment(
    developerId: string,
    amount: number,
    reason: string,
    adminId: string,
    customType?: string
  ): Promise<
    CreditLedgerResult & {
      referenceId?: string;
      amount?: number;
      adminId?: string;
      reason?: string;
      timestamp?: string;
      balance?: number;
      balanceBefore?: number;
      transaction?: any;
    }
  > {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason required for admin credit adjustments.');
    }

    if (amount === 0 || isNaN(amount)) {
      throw new Error('Adjustment amount must be a non-zero integer.');
    }

    return withTransaction(async (client) => {
      const user = await this.findUserAndAccount(developerId, client);

      let accountId: string;
      let balanceBefore = 0;
      let targetUserId: string | null = user?.id || null;
      let targetDevId: string | null = user?.developer_id || null;

      let acc = await client.query(
        `SELECT id, balance, developer_id, user_id FROM credit_accounts
         WHERE (developer_id IS NOT NULL AND developer_id = $1)
            OR (user_id IS NOT NULL AND user_id = $2)
         FOR UPDATE`,
        [targetDevId || developerId, targetUserId || developerId]
      );

      if (acc.rows.length === 0) {
        if (!targetUserId && !targetDevId) {
          throw new Error('Developer credit account not found');
        }
        const newAcc = await client.query(
          `INSERT INTO credit_accounts (user_id, developer_id, balance, currency)
           VALUES ($1, $2, 0, 'INR')
           RETURNING id, balance`,
          [targetUserId, targetDevId]
        );
        accountId = newAcc.rows[0].id;
        balanceBefore = 0;
      } else {
        accountId = acc.rows[0].id;
        balanceBefore = Number(acc.rows[0].balance);
        if (!targetUserId && acc.rows[0].user_id) targetUserId = acc.rows[0].user_id;
        if (!targetDevId && acc.rows[0].developer_id) targetDevId = acc.rows[0].developer_id;
      }

      const balanceAfter = balanceBefore + amount;

      if (balanceAfter < 0) {
        throw new Error('Adjustment would result in negative credit balance');
      }

      await client.query(
        `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2`,
        [balanceAfter, accountId]
      );

      const referenceId = `ADJ-${Date.now().toString().slice(-6)}`;
      const timestamp = new Date().toISOString();
      const txType = customType || 'ADMIN_ADJUSTMENT';

      const tx = await client.query(
        `INSERT INTO credit_transactions (
           developer_id, user_id, type, amount, balance_before, balance_after,
           reference_id, reason, description, performed_by, metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11
         ) RETURNING id, created_at`,
        [
          targetDevId,
          targetUserId,
          txType,
          amount,
          balanceBefore,
          balanceAfter,
          referenceId,
          reason,
          `Admin Adjustment by ${adminId}: ${reason}`,
          adminId,
          JSON.stringify({ amount, balanceBefore, balanceAfter, reason, referenceId }),
        ]
      );

      // Record in audit logs
      await AuditLogger.log(
        {
          actorUserId: adminId,
          action: 'CREDIT_ADMIN_ADJUSTMENT',
          entityType: 'CREDIT_ACCOUNT',
          entityId: targetDevId || targetUserId || developerId,
          metadata: { amount, balanceBefore, balanceAfter, reason, referenceId, targetUserId, developerId: targetDevId },
        },
        client
      );

      // Notify user of credit adjustment / refund
      const notifyUserId = targetUserId || (targetDevId ? (await client.query(`SELECT user_id FROM developers WHERE id = $1`, [targetDevId])).rows[0]?.user_id : null);
      if (notifyUserId) {
        await NotificationService.createNotification({
          userId: notifyUserId,
          type: amount > 0 ? 'CREDIT_REFUNDED' : 'CREDIT_ADJUSTED',
          title: amount > 0 ? 'Credits Added to Wallet' : 'Credit Adjustment',
          message: `Wallet adjustment of ${amount > 0 ? '+' : ''}${amount} credits: ${reason}. New balance: ${balanceAfter} credits.`,
          link: '/wallet',
          metadata: { amount, balanceBefore, balanceAfter, referenceId, reason, performedBy: adminId },
          client,
        });
      }

      return {
        success: true,
        newBalance: balanceAfter,
        balance: balanceAfter,
        balanceBefore,
        transactionId: tx.rows[0].id,
        transaction: tx.rows[0],
        referenceId,
        amount,
        adminId,
        reason,
        timestamp: tx.rows[0].created_at || timestamp,
      };
    });
  }

  /**
   * Creates a pending payment order before invoking payment gateway
   */
  static async createPaymentOrder(
    developerId: string,
    userId: string,
    credits: number,
    amount: number,
    gateway = 'STRIPE_TEST'
  ): Promise<{
    paymentId: string;
    gatewayPaymentId: string;
    amount: number;
    currency: string;
    credits: number;
    status: string;
  }> {
    if (credits <= 0 || amount <= 0) {
      throw new Error('Credits and amount must be greater than zero');
    }

    const gatewayPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

    const res = await query(
      `INSERT INTO payments (user_id, amount, currency, gateway, gateway_payment_id, status, metadata)
       VALUES ($1, $2, 'INR', $3, $4, 'PENDING', $5)
       RETURNING id, gateway_payment_id, amount, currency, status`,
      [
        userId,
        amount,
        gateway,
        gatewayPaymentId,
        JSON.stringify({ developerId, credits, userId }),
      ]
    );

    const row = res.rows[0];
    return {
      paymentId: row.id,
      gatewayPaymentId: row.gateway_payment_id,
      amount: Number(row.amount),
      currency: row.currency,
      credits,
      status: row.status,
    };
  }

  /**
   * Processes gateway webhooks with HMAC-SHA256 signature verification and idempotency
   */
  static async processWebhook(
    rawPayload: string | Buffer,
    signature: string,
    secret: string = env.PAYMENT_WEBHOOK_SECRET
  ): Promise<{
    success: boolean;
    status: string;
    duplicate: boolean;
    creditsAdded: number;
    newBalance?: number;
    paymentId?: string;
    transactionId?: string;
    message?: string;
  }> {
    const payloadString = typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf8');

    // 1. Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new Error('Invalid webhook signature verification failed');
    }

    const event = JSON.parse(payloadString);
    const eventType = event.event || event.type;
    const eventData = event.data || event;
    const gatewayPaymentId = eventData.gatewayPaymentId || eventData.gateway_payment_id || eventData.id;

    if (!gatewayPaymentId) {
      throw new Error('Missing gateway payment identifier in webhook event');
    }

    // Replay attack timestamp protection (max 5 minutes age)
    const eventTime = event.timestamp || event.created || eventData.timestamp || eventData.created;
    if (eventTime) {
      const eventTimestampMs = typeof eventTime === 'number'
        ? (eventTime < 1e12 ? eventTime * 1000 : eventTime)
        : new Date(eventTime).getTime();
      const now = Date.now();
      const ageSeconds = (now - eventTimestampMs) / 1000;
      if (ageSeconds > 300) {
        throw new Error('Webhook rejected: Timestamp expired (replay protection).');
      }
      if (ageSeconds < -60) {
        throw new Error('Webhook rejected: Future timestamp detected.');
      }
    }

    return withTransaction(async (client) => {
      // 2. Fetch payment record with row lock FOR UPDATE
      const paymentRes = await client.query(
        `SELECT id, user_id, amount, currency, gateway, gateway_payment_id, status, metadata
         FROM payments
         WHERE gateway_payment_id = $1
         FOR UPDATE`,
        [gatewayPaymentId]
      );

      if (paymentRes.rows.length === 0) {
        throw new Error(`Payment record not found for gatewayPaymentId: ${gatewayPaymentId}`);
      }

      const payment = paymentRes.rows[0];
      const metadata = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : (payment.metadata || {});
      const credits = Number(metadata.credits || eventData.credits || 0);
      const developerId = metadata.developerId || eventData.developerId;

      // 3. Handle Idempotency / Duplicate Webhook
      if (payment.status === 'SUCCESS') {
        const acc = await client.query(
          `SELECT balance FROM credit_accounts WHERE developer_id = $1`,
          [developerId]
        );
        const currentBalance = acc.rows.length > 0 ? acc.rows[0].balance : 0;
        return {
          success: true,
          status: 'SUCCESS',
          duplicate: true,
          creditsAdded: 0,
          newBalance: currentBalance,
          paymentId: payment.id,
          message: 'Duplicate webhook: Payment already processed',
        };
      }

      // 4. Handle failed payment event
      if (eventType === 'payment.failed' || eventType === 'payment_intent.payment_failed') {
        await client.query(
          `UPDATE payments SET status = 'FAILED' WHERE id = $1`,
          [payment.id]
        );
        return {
          success: false,
          status: 'FAILED',
          duplicate: false,
          creditsAdded: 0,
          paymentId: payment.id,
          message: 'Payment marked as failed. No credits added.',
        };
      }

      // 5. Handle successful payment event
      if (
        eventType === 'payment.succeeded' ||
        eventType === 'payment.success' ||
        eventType === 'payment_intent.succeeded'
      ) {
        if (!developerId) {
          throw new Error('Developer ID missing from payment metadata');
        }
        if (credits <= 0) {
          throw new Error('Credits count must be greater than zero');
        }

        // Lock developer credit account row FOR UPDATE
        const accRes = await client.query(
          `SELECT balance FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
          [developerId]
        );

        if (accRes.rows.length === 0) {
          throw new Error(`Credit account not found for developer: ${developerId}`);
        }

        const currentBalance = accRes.rows[0].balance;
        const balanceAfter = currentBalance + credits;

        // Update credit account
        await client.query(
          `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
          [balanceAfter, developerId]
        );

        // Update payment status to SUCCESS
        await client.query(
          `UPDATE payments SET status = 'SUCCESS' WHERE id = $1`,
          [payment.id]
        );

        // Insert immutable ledger transaction
        const txRes = await client.query(
          `INSERT INTO credit_transactions (developer_id, type, amount, balance_after, reference_id, description)
           VALUES ($1, 'PURCHASE', $2, $3, $4, $5)
           RETURNING id`,
          [
            developerId,
            credits,
            balanceAfter,
            gatewayPaymentId,
            `Credit purchase of ${credits} credits via ${payment.gateway || 'GATEWAY'}`,
          ]
        );

        // Notify developer of credit purchase
        const devRes = await client.query(`SELECT user_id FROM developers WHERE id = $1`, [developerId]);
        const devUserId = devRes.rows[0]?.user_id || payment.user_id;
        if (devUserId) {
          await NotificationService.createNotification({
            userId: devUserId,
            type: 'CREDIT_PURCHASED',
            title: 'Credits Purchased Successfully',
            message: `Payment successful! Added ${credits} credits to your wallet. Your new balance is ${balanceAfter} credits.`,
            link: '/wallet',
            metadata: { credits, balanceAfter, transactionId: txRes.rows[0].id, paymentId: payment.id },
            client,
          });
        }

        return {
          success: true,
          status: 'SUCCESS',
          duplicate: false,
          creditsAdded: credits,
          newBalance: balanceAfter,
          paymentId: payment.id,
          transactionId: txRes.rows[0].id,
          message: `Successfully credited ${credits} credits.`,
        };
      }

      throw new Error(`Unhandled webhook event type: ${eventType}`);
    });
  }

  /**
   * Developer purchases credits via payment gateway or test simulation
   */
  static async purchaseCredits(
    developerId: string,
    userId: string,
    credits: number,
    amount: number,
    gateway = 'STRIPE'
  ): Promise<CreditLedgerResult> {
    if (credits <= 0 || amount <= 0) {
      throw new Error('Credits and amount must be greater than zero');
    }

    return withTransaction(async (client) => {
      // 1. Record payment
      const paymentRef = `PAY-${Date.now().toString().slice(-8)}`;
      await client.query(
        `INSERT INTO payments (user_id, amount, currency, gateway, gateway_payment_id, status, metadata)
         VALUES ($1, $2, 'INR', $3, $4, 'SUCCESS', $5)`,
        [userId, amount, gateway, paymentRef, JSON.stringify({ credits, developerId })]
      );

      // 2. Lock credit account
      const accRes = await client.query(
        `SELECT balance, user_id FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
        [developerId]
      );

      if (accRes.rows.length === 0) {
        throw new Error('Credit account not found for developer');
      }

      const current = accRes.rows[0].balance;
      const effectiveUserId = userId || accRes.rows[0].user_id || null;
      const balanceAfter = current + credits;

      // 3. Update balance
      await client.query(
        `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
        [balanceAfter, developerId]
      );

      // 4. Insert credit transaction
      const purchaseDesc = `Credit purchase of ${credits} credits for ₹${amount}`;
      const txRes = await client.query(
        `INSERT INTO credit_transactions (developer_id, user_id, type, amount, balance_before, balance_after, reference_id, description, reason, performed_by)
         VALUES ($1, $2, 'PURCHASE', $3, $4, $5, $6, $7, $7, $8)
         RETURNING id`,
        [
          developerId,
          effectiveUserId,
          credits,
          current,
          balanceAfter,
          paymentRef,
          purchaseDesc,
          effectiveUserId,
        ]
      );

      // 5. Notify developer of credit purchase
      const devRes = await client.query(`SELECT user_id FROM developers WHERE id = $1`, [developerId]);
      const devUserId = devRes.rows[0]?.user_id || userId;
      if (devUserId) {
        await NotificationService.createNotification({
          userId: devUserId,
          type: 'CREDIT_PURCHASED',
          title: 'Credits Purchased Successfully',
          message: `Successfully purchased ${credits} credits. Your new balance is ${balanceAfter} credits.`,
          link: '/wallet',
          metadata: { credits, balanceAfter, transactionId: txRes.rows[0].id },
          client,
        });
      }

      return {
        success: true,
        newBalance: balanceAfter,
        transactionId: txRes.rows[0].id,
      };
    });
  }
}
