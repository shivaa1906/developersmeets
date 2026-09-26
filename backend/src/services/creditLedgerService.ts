import { withTransaction, query } from '../database/db.js';
import { env } from '../config/environment.js';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { NotificationService } from './notificationService.js';

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
   * Manual administrator credit adjustment with mandatory audit logging
   */
  static async adminAdjustment(
    developerId: string,
    amount: number,
    reason: string,
    adminId: string
  ): Promise<
    CreditLedgerResult & {
      referenceId?: string;
      amount?: number;
      adminId?: string;
      reason?: string;
      timestamp?: string;
    }
  > {
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

      const referenceId = `ADJ-${Date.now().toString().slice(-6)}`;
      const timestamp = new Date().toISOString();

      const tx = await client.query(
        `INSERT INTO credit_transactions (developer_id, type, amount, balance_after, reference_id, description)
         VALUES ($1, 'ADMIN_ADJUSTMENT', $2, $3, $4, $5)
         RETURNING id, created_at`,
        [
          developerId,
          amount,
          balanceAfter,
          referenceId,
          `Admin Adjustment by ${adminId}: ${reason}`,
        ]
      );

      // Record in audit logs
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, 'CREDIT_ADMIN_ADJUSTMENT', 'CREDIT_ACCOUNT', $2, $3)`,
        [adminId, developerId, JSON.stringify({ amount, balanceAfter, reason, referenceId })]
      );

      // Notify developer of credit adjustment / refund
      const devRes = await client.query(`SELECT user_id FROM developers WHERE id = $1`, [developerId]);
      if (devRes.rows[0]?.user_id) {
        await NotificationService.createNotification({
          userId: devRes.rows[0].user_id,
          type: amount > 0 ? 'CREDIT_REFUNDED' : 'CREDIT_ADJUSTED',
          title: amount > 0 ? 'Credits Added to Wallet' : 'Credit Adjustment',
          message: `Wallet adjustment of ${amount > 0 ? '+' : ''}${amount} credits: ${reason}. New balance: ${balanceAfter} credits.`,
          link: '/wallet',
          metadata: { amount, balanceAfter, referenceId, reason },
          client,
        });
      }

      return {
        success: true,
        newBalance: balanceAfter,
        transactionId: tx.rows[0].id,
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
