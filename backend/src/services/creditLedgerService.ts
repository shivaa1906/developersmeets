import { withTransaction, query } from '../database/db.js';
import { env } from '../config/environment.js';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { NotificationService } from './notificationService.js';
import { AuditLogger } from '../utils/auditLogger.js';

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

export interface BulkCreditResult {
  success: boolean;
  targetScope: string;
  count: number;
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
    dbClient?: PoolClient
  ): Promise<CreditLedgerResult> {
    const handler = async (client: PoolClient) => {
      // 1. Lock credit account row FOR UPDATE
      const accountRes = await client.query(
        `SELECT balance FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
        [developerId]
      );

      if (accountRes.rows.length === 0) {
        throw new Error('Credit account not found for developer');
      }

      const currentBalance = accountRes.rows[0].balance;

      // 2. Strict balance validation (never allow negative balance)
      if (currentBalance < claimCost) {
        throw new Error(`Insufficient credits. Required: ${claimCost}, Available: ${currentBalance}`);
      }

      const balanceAfter = currentBalance - claimCost;

      // 3. Update balance
      await client.query(
        `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
        [balanceAfter, developerId]
      );

      // 4. Create immutable ledger record
      const txRes = await client.query(
        `INSERT INTO credit_transactions (developer_id, project_id, type, amount, balance_after, reference_id, description)
         VALUES ($1, $2, 'PROJECT_CLAIM', $3, $4, $5, $6)
         RETURNING id`,
        [
          developerId,
          projectId,
          -claimCost,
          balanceAfter,
          `CLM-${projectId.slice(0, 8)}-${Date.now().toString().slice(-4)}`,
          `Slot claim fee for project ${projectId}`,
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
            `SELECT balance FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
            [devId]
          );

          if (acc.rows.length > 0) {
            const currentBal = acc.rows[0].balance;
            const balanceAfter = currentBal + refundAmt;

            // Update balance
            await client.query(
              `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
              [balanceAfter, devId]
            );

            // Create refund ledger transaction
            const refundTx = await client.query(
              `INSERT INTO credit_transactions (developer_id, project_id, type, amount, balance_after, reference_id, description)
               VALUES ($1, $2, 'PROJECT_NOT_SELECTED_REFUND', $3, $4, $5, $6)
               RETURNING id`,
              [
                devId,
                projectId,
                refundAmt,
                balanceAfter,
                refundReference,
                `100% automated credit refund for project ${projectId}`,
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
            const devUserId = devInfo.rows[0]?.user_id;
            const projectTitle = projInfo.rows[0]?.title || 'Project';
            const projectCode = projInfo.rows[0]?.project_number || projectId;

            if (devUserId) {
              // 1. DEVELOPER_NOT_SELECTED Notification
              await NotificationService.createNotification({
                userId: devUserId,
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
              d.id as developer_id, d.username as developer_username, d.display_name as developer_name,
              c.id as client_id, c.company_name
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

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Credit grant amount must be a positive integer greater than zero.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required for credit adjustments.');
    }

    return withTransaction(async (client) => {
      const user = await this.findUserAndAccount(target, client);
      if (!user) {
        throw new Error(`Target user not found for identifier: ${target}`);
      }

      const accRes = await client.query(
        `SELECT id, balance FROM credit_accounts
         WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
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

      const balanceAfter = balanceBefore + amount;

      await client.query(
        `UPDATE credit_accounts SET balance = $1, user_id = $2, updated_at = NOW() WHERE id = $3`,
        [balanceAfter, user.id, accountId]
      );

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
          amount,
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
          metadata: { targetUserId: user.id, developerId: user.developer_id, amount, balanceBefore, balanceAfter, reason, referenceId: refId },
        },
        client
      );

      await NotificationService.createNotification({
        userId: user.id,
        type: 'CREDIT_GRANTED',
        title: 'Credits Granted to Account',
        message: `An administrator granted +${amount} credits to your account. Reason: ${reason}. New balance: ${balanceAfter} credits.`,
        link: '/wallet',
        metadata: { amount, balanceAfter, balanceBefore, referenceId: refId, reason, performedBy: adminUserId },
        client,
      });

      return {
        success: true,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          role: user.role,
          developerId: user.developer_id,
        },
        balance: balanceAfter,
        newBalance: balanceAfter,
        balanceBefore,
        amount,
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

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Credit removal amount must be a positive integer greater than zero.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason required for credit removal.');
    }

    return withTransaction(async (client) => {
      const user = await this.findUserAndAccount(target, client);
      if (!user) {
        throw new Error(`Target user not found for identifier: ${target}`);
      }

      const accRes = await client.query(
        `SELECT id, balance FROM credit_accounts
         WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
         FOR UPDATE`,
        [user.id, user.developer_id || null]
      );

      if (accRes.rows.length === 0) {
        throw new Error(`Cannot remove ${amount} credits: Credit account not found. Current balance is 0.`);
      }

      const balanceBefore = Number(accRes.rows[0].balance);
      if (balanceBefore < amount) {
        throw new Error(
          `Cannot remove ${amount} credits: Current balance is ${balanceBefore}. Operation would result in negative balance. Business rules prohibit negative credit balances.`
        );
      }

      const balanceAfter = balanceBefore - amount;

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
          -amount,
          balanceBefore,
          balanceAfter,
          refId,
          reason,
          `Admin deduction by ${adminUserId}: ${reason}`,
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
          metadata: { targetUserId: user.id, developerId: user.developer_id, amount: -amount, balanceBefore, balanceAfter, reason, referenceId: refId },
        },
        client
      );

      await NotificationService.createNotification({
        userId: user.id,
        type: 'CREDIT_REMOVED',
        title: 'Credit Deduction',
        message: `An administrator deducted ${amount} credits from your account. Reason: ${reason}. New balance: ${balanceAfter} credits.`,
        link: '/wallet',
        metadata: { amount: -amount, balanceAfter, balanceBefore, referenceId: refId, reason, performedBy: adminUserId },
        client,
      });

      return {
        success: true,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          role: user.role,
          developerId: user.developer_id,
        },
        balance: balanceAfter,
        newBalance: balanceAfter,
        balanceBefore,
        amount: -amount,
        transactionId: tx.rows[0].id,
        referenceId: refId,
        reason,
        type: 'ADMIN_CREDIT_REMOVAL',
        timestamp: tx.rows[0].created_at,
        performedBy: adminUserId,
      };
    });
  }

  /**
   * Bulk grant credits to multiple or all eligible users inside an atomic ledger transaction
   */
  static async bulkGrantCredits(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'CUSTOM';
    userIds?: string[];
    amount: number;
    reason: string;
    adminUserId: string;
    metadata?: any;
  }): Promise<BulkCreditResult> {
    const { targetScope, userIds, amount, reason, adminUserId, metadata } = params;

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Bulk credit grant amount must be a positive integer.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason (at least 5 characters) required for bulk adjustments.');
    }

    return withTransaction(async (client) => {
      let usersQuery = '';
      let usersParams: any[] = [];

      if (targetScope === 'ALL_DEVELOPERS') {
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, d.id as developer_id
          FROM users u
          JOIN developers d ON d.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.is_suspended = FALSE
        `;
      } else if (targetScope === 'ALL_CLIENTS') {
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, NULL as developer_id
          FROM users u
          JOIN clients c ON c.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.is_suspended = FALSE
        `;
      } else if (targetScope === 'ALL') {
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, d.id as developer_id
          FROM users u
          LEFT JOIN developers d ON d.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.is_suspended = FALSE
            AND u.role IN ('DEVELOPER', 'CLIENT')
        `;
      } else if (targetScope === 'CUSTOM') {
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
          throw new Error('userIds array is required for CUSTOM target scope.');
        }
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, d.id as developer_id
          FROM users u
          LEFT JOIN developers d ON d.user_id = u.id
          WHERE u.id::text = ANY($1)
             OR u.uid = ANY($1)
             OR u.public_uid = ANY($1)
             OR u.email = ANY($1)
             OR d.id::text = ANY($1)
        `;
        usersParams = [userIds];
      } else {
        throw new Error(`Invalid target scope: ${targetScope}`);
      }

      const usersRes = await client.query(usersQuery, usersParams);
      const eligibleUsers = usersRes.rows;

      if (eligibleUsers.length === 0) {
        throw new Error('No eligible target users found for bulk credit grant.');
      }

      const batchReference = `BULK-GRANT-${Date.now().toString().slice(-8)}`;
      const affectedUsers: any[] = [];

      for (const u of eligibleUsers) {
        const accRes = await client.query(
          `SELECT id, balance FROM credit_accounts
           WHERE user_id = $1 OR (developer_id IS NOT NULL AND developer_id = $2)
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

        const balanceAfter = balanceBefore + amount;

        await client.query(
          `UPDATE credit_accounts SET balance = $1, user_id = $2, updated_at = NOW() WHERE id = $3`,
          [balanceAfter, u.id, accountId]
        );

        await client.query(
          `INSERT INTO credit_transactions (
             user_id, developer_id, type, amount, balance_before, balance_after,
             reference_id, reason, description, performed_by, metadata
           ) VALUES (
             $1, $2, 'ADMIN_CREDIT_GRANT', $3, $4, $5,
             $6, $7, $8, $9, $10
           )`,
          [
            u.id,
            u.developer_id || null,
            amount,
            balanceBefore,
            balanceAfter,
            batchReference,
            reason,
            `Bulk grant by admin ${adminUserId}: ${reason}`,
            adminUserId,
            JSON.stringify({ ...metadata, batchReference, targetScope }),
          ]
        );

        await NotificationService.createNotification({
          userId: u.id,
          type: 'CREDIT_GRANTED',
          title: 'Credits Granted to Your Account',
          message: `An administrator granted +${amount} credits to your account. Reason: ${reason}. New balance: ${balanceAfter} credits.`,
          link: '/wallet',
          metadata: { amount, balanceAfter, balanceBefore, referenceId: batchReference, reason, performedBy: adminUserId },
          client,
        });

        affectedUsers.push({
          userId: u.id,
          email: u.email,
          uid: u.uid,
          balanceBefore,
          balanceAfter,
          amount,
        });
      }

      await AuditLogger.log(
        {
          actorUserId: adminUserId,
          action: 'ADMIN_BULK_CREDIT_GRANT',
          entityType: 'CREDIT_SYSTEM',
          entityId: batchReference,
          metadata: {
            targetScope,
            amount,
            totalCredits: affectedUsers.length * amount,
            userCount: affectedUsers.length,
            reason,
            batchReference,
          },
        },
        client
      );

      return {
        success: true,
        targetScope,
        count: affectedUsers.length,
        totalCredits: affectedUsers.length * amount,
        batchReference,
        affectedUsers,
      };
    });
  }

  /**
   * Bulk remove credits from multiple or all eligible users with non-negative balance protection
   */
  static async bulkRemoveCredits(params: {
    targetScope: 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'CUSTOM';
    userIds?: string[];
    amount: number;
    reason: string;
    adminUserId: string;
    allowPartial?: boolean;
    metadata?: any;
  }): Promise<BulkCreditResult> {
    const { targetScope, userIds, amount, reason, adminUserId, allowPartial = true, metadata } = params;

    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new Error('Bulk credit removal amount must be a positive integer.');
    }
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason required for bulk credit removal.');
    }

    return withTransaction(async (client) => {
      let usersQuery = '';
      let usersParams: any[] = [];

      if (targetScope === 'ALL_DEVELOPERS') {
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, d.id as developer_id
          FROM users u
          JOIN developers d ON d.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.is_suspended = FALSE
        `;
      } else if (targetScope === 'ALL_CLIENTS') {
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, NULL as developer_id
          FROM users u
          JOIN clients c ON c.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.is_suspended = FALSE
        `;
      } else if (targetScope === 'ALL') {
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, d.id as developer_id
          FROM users u
          LEFT JOIN developers d ON d.user_id = u.id
          WHERE u.status = 'ACTIVE' AND u.is_suspended = FALSE
            AND u.role IN ('DEVELOPER', 'CLIENT')
        `;
      } else if (targetScope === 'CUSTOM') {
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
          throw new Error('userIds array is required for CUSTOM target scope.');
        }
        usersQuery = `
          SELECT u.id, u.uid, u.email, u.role, d.id as developer_id
          FROM users u
          LEFT JOIN developers d ON d.user_id = u.id
          WHERE u.id::text = ANY($1)
             OR u.uid = ANY($1)
             OR u.public_uid = ANY($1)
             OR u.email = ANY($1)
             OR d.id::text = ANY($1)
        `;
        usersParams = [userIds];
      } else {
        throw new Error(`Invalid target scope: ${targetScope}`);
      }

      const usersRes = await client.query(usersQuery, usersParams);
      const eligibleUsers = usersRes.rows;

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
           FOR UPDATE`,
          [u.id, u.developer_id || null]
        );

        if (accRes.rows.length === 0) continue;

        const currentBal = Number(accRes.rows[0].balance);
        if (currentBal <= 0) continue;

        let deductAmt = amount;
        if (currentBal < amount) {
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
            reason,
            `Bulk deduction by admin ${adminUserId}: ${reason}`,
            adminUserId,
            JSON.stringify({ ...metadata, batchReference, targetScope }),
          ]
        );

        await NotificationService.createNotification({
          userId: u.id,
          type: 'CREDIT_REMOVED',
          title: 'Credits Deducted from Your Account',
          message: `An administrator deducted ${deductAmt} credits from your account. Reason: ${reason}. New balance: ${balanceAfter} credits.`,
          link: '/wallet',
          metadata: { amount: deductAmt, balanceAfter, balanceBefore: currentBal, referenceId: batchReference, reason, performedBy: adminUserId },
          client,
        });

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
            amountRequested: amount,
            totalCreditsRemoved: totalDeducted,
            userCount: affectedUsers.length,
            reason,
            batchReference,
          },
        },
        client
      );

      return {
        success: true,
        targetScope,
        count: affectedUsers.length,
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

    if (filters?.type && filters.type !== 'ALL') {
      params.push(filters.type);
      conditions.push(`ct.type = $${params.length}::credit_tx_type`);
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
   * List all user credit accounts
   */
  static async listCreditAccounts(filters?: { search?: string; role?: string; limit?: number; offset?: number }) {
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.role) {
      params.push(filters.role);
      conditions.push(`u.role = $${params.length}`);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      params.push(`%${filters.search.trim()}%`);
      const sIdx = params.length;
      conditions.push(`(
        u.email ILIKE $${sIdx}
        OR u.uid ILIKE $${sIdx}
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
             u.email as user_email, u.role as user_role, u.status as user_status,
             d.id as developer_id, d.username as developer_username, d.display_name as developer_name,
             c.id as client_id, c.company_name,
             (SELECT COUNT(*) FROM credit_transactions ct WHERE ct.user_id = u.id OR ct.developer_id = d.id) as transaction_count
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
        `SELECT balance FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
        [developerId]
      );

      if (accRes.rows.length === 0) {
        throw new Error('Credit account not found for developer');
      }

      const current = accRes.rows[0].balance;
      const balanceAfter = current + credits;

      // 3. Update balance
      await client.query(
        `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
        [balanceAfter, developerId]
      );

      // 4. Insert credit transaction
      const txRes = await client.query(
        `INSERT INTO credit_transactions (developer_id, type, amount, balance_after, reference_id, description)
         VALUES ($1, 'PURCHASE', $2, $3, $4, $5)
         RETURNING id`,
        [
          developerId,
          credits,
          balanceAfter,
          paymentRef,
          `Credit purchase of ${credits} credits for ₹${amount}`,
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
