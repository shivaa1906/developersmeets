import { withTransaction } from '../database/db.js';
import { env } from '../config/environment.js';
import type { PoolClient } from 'pg';

export interface CreditLedgerResult {
  success: boolean;
  newBalance: number;
  transactionId?: string;
  error?: string;
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
   * Manual administrator credit adjustment with mandatory audit logging
   */
  static async adminAdjustment(
    developerId: string,
    amount: number,
    reason: string,
    adminId: string
  ): Promise<CreditLedgerResult> {
    if (!reason || reason.trim().length < 5) {
      throw new Error('Mandatory justification reason required for admin credit adjustments.');
    }

    return withTransaction(async (client) => {
      const acc = await client.query(
        `SELECT balance FROM credit_accounts WHERE developer_id = $1 FOR UPDATE`,
        [developerId]
      );

      if (acc.rows.length === 0) {
        throw new Error('Developer credit account not found');
      }

      const current = acc.rows[0].balance;
      const balanceAfter = current + amount;

      if (balanceAfter < 0) {
        throw new Error('Adjustment would result in negative credit balance');
      }

      await client.query(
        `UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE developer_id = $2`,
        [balanceAfter, developerId]
      );

      const tx = await client.query(
        `INSERT INTO credit_transactions (developer_id, type, amount, balance_after, reference_id, description)
         VALUES ($1, 'ADMIN_ADJUSTMENT', $2, $3, $4, $5)
         RETURNING id`,
        [
          developerId,
          amount,
          balanceAfter,
          `ADJ-${Date.now().toString().slice(-6)}`,
          `Admin Adjustment by ${adminId}: ${reason}`,
        ]
      );

      // Record in audit logs
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'CREDIT_ADMIN_ADJUSTMENT', 'CREDIT_ACCOUNT', $2, $3)`,
        [adminId, developerId, JSON.stringify({ amount, balanceAfter, reason })]
      );

      return {
        success: true,
        newBalance: balanceAfter,
        transactionId: tx.rows[0].id,
      };
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

      return {
        success: true,
        newBalance: balanceAfter,
        transactionId: txRes.rows[0].id,
      };
    });
  }
}
