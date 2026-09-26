import app from '../server.js';
import { query } from '../database/db.js';
import { env } from '../config/environment.js';
import { DeveloperService } from '../services/developerService.js';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import jwt from 'jsonwebtoken';
import { Server } from 'http';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

interface AuditResults {
  startingBalance: number;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    referenceId: string;
    description: string;
    createdAt: string;
  }>;
  expectedBalance: number;
  actualBalance: number;
  paymentTests: boolean;
  webhookTests: boolean;
  refundTests: boolean;
  raceConditionTests: boolean;
}

export async function runCreditPaymentAudit(): Promise<AuditResults> {
  console.log('================================================================');
  console.log('PHASE 7: CREDIT & PAYMENT AUDIT');
  console.log('================================================================\n');

  let server: Server | null = null;
  let baseUrl = '';

  const results: AuditResults = {
    startingBalance: 5,
    transactions: [],
    expectedBalance: 20,
    actualBalance: 0,
    paymentTests: false,
    webhookTests: false,
    refundTests: false,
    raceConditionTests: false,
  };

  try {
    // 0. Start live test server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server?.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`[Audit Harness] Live test server listening at ${baseUrl}`);
        resolve();
      });
    });

    const suffix = `audit7_${Date.now()}`;
    const pwdHash = await bcrypt.hash('AuditedPassword2026!', 8);

    // -------------------------------------------------------------------------
    // SETUP: ADMIN, CLIENT, & PROJECT
    // -------------------------------------------------------------------------
    console.log('[Setup] Initializing Admin, Client, and Test Project...');

    // Admin user
    const adminRes = await query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    let adminUserId = '';
    if (adminRes.rows.length === 0) {
      const u = await query(
        "INSERT INTO users (email, password_hash, role, status) VALUES ('admin_audit7@nexus.company', $1, 'ADMIN', 'ACTIVE') RETURNING id",
        [pwdHash]
      );
      adminUserId = u.rows[0].id;
    } else {
      adminUserId = adminRes.rows[0].id;
    }

    const adminToken = jwt.sign(
      { userId: adminUserId, email: 'admin_audit7@nexus.company', role: 'ADMIN' },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Client user
    const clientUserRes = await query(
      "INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, 'CLIENT', 'ACTIVE') RETURNING id",
      [`client_${suffix}@nexus.test`, pwdHash]
    );
    const clientUserId = clientUserRes.rows[0].id;

    const clientRes = await query(
      `INSERT INTO clients (user_id, client_number, company_name, private_name, phone)
       VALUES ($1, $2, 'Fintech Innovations Ltd', 'Sanjay Patel', '+91 9876543210')
       RETURNING id`,
      [clientUserId, `Client #${Date.now().toString().slice(-4)}`]
    );
    const clientId = clientRes.rows[0].id;

    const clientToken = jwt.sign(
      { userId: clientUserId, email: `client_${suffix}@nexus.test`, role: 'CLIENT', clientId },
      env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Test Project
    const projectNumber = `PRJ-PAY-${Date.now().toString().slice(-4)}`;
    const projRes = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Credit & Payment Verification Engine',
         'Financial ledger validation and payment gateway webhook testing system.',
         'Full-Stack Development', 50000, 80000, '30–45 days',
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         '["React", "Node.js", "PostgreSQL"]'::jsonb,
         'OPEN_FOR_CLAIMS', 1, 3, NOW() + INTERVAL '14 days', $3
       ) RETURNING id`,
      [projectNumber, `credit-engine-${suffix}`, clientId]
    );
    const projectId = projRes.rows[0].id;

    // Helper: create test developer
    const createTestDeveloper = async (name: string, username: string, initialCredits: number) => {
      const u = await query(
        'INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, \'DEVELOPER\', \'ACTIVE\') RETURNING id',
        [`${username}@nexus.dev`, pwdHash]
      );
      const userId = u.rows[0].id;

      const d = await query(
        `INSERT INTO developers (user_id, username, display_name, role_title, experience, verification_status, verified_at)
         VALUES ($1, $2, $3, 'Senior Engineer', 5, 'VERIFIED', NOW())
         RETURNING id`,
        [userId, username, name]
      );
      const devId = d.rows[0].id;

      await query(
        'INSERT INTO credit_accounts (developer_id, balance) VALUES ($1, $2) ON CONFLICT (developer_id) DO UPDATE SET balance = $2',
        [devId, initialCredits]
      );

      await DeveloperService.updateProfile(devId, { skills: ['React', 'Node.js', 'PostgreSQL'] });

      const token = jwt.sign(
        { userId, email: `${username}@nexus.dev`, role: 'DEVELOPER', developerId: devId },
        env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      return { userId, devId, name, username, token, initialCredits };
    };

    // Primary Audited Developer (Dev 1)
    const dev1 = await createTestDeveloper('Developer One', `dev01_${suffix}`, 5);
    // Competing Developer (Dev 2 - will be selected)
    const dev2 = await createTestDeveloper('Developer Two', `dev02_${suffix}`, 5);
    // Zero-credit Developer (Dev 3 - for negative balance defense)
    const dev3 = await createTestDeveloper('Developer Zero', `dev03_${suffix}`, 0);

    console.log(`  ✔ Dev 1 initialized with ${dev1.initialCredits} credits (Dev ID: ${dev1.devId})`);
    console.log(`  ✔ Dev 2 initialized with ${dev2.initialCredits} credits (Dev ID: ${dev2.devId})`);
    console.log(`  ✔ Dev 3 initialized with ${dev3.initialCredits} credits (Dev ID: ${dev3.devId})`);

    // -------------------------------------------------------------------------
    // TEST 1: WALLET INITIALIZATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Verifying initial wallet balance (Expected: 5 credits)...');
    const balRes1 = await fetch(`${baseUrl}/api/credits/balance`, {
      headers: { Authorization: `Bearer ${dev1.token}` },
    });
    const balData1 = (await balRes1.json()) as any;
    if (balData1.balance !== 5) {
      throw new Error(`Initial balance mismatch! Expected: 5, Got: ${balData1.balance}`);
    }
    results.startingBalance = balData1.balance;
    console.log(`  ✔ Dev 1 starting balance confirmed: ${results.startingBalance} credits`);

    // -------------------------------------------------------------------------
    // TEST 2: PROJECT CLAIM DEDUCTION (5 -> 4)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Testing project claim credit deduction (5 -> 4)...');
    const claimRes1 = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pitch: 'I have deep expertise in building high-throughput financial ledgers with atomic row locking.',
        estimatedDays: 30,
      }),
    });

    if (claimRes1.status !== 200 && claimRes1.status !== 201) {
      const err = await claimRes1.text();
      throw new Error(`Project claim failed with status ${claimRes1.status}: ${err}`);
    }

    const dev1BalPostClaim = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostClaim.rows[0].balance !== 4) {
      throw new Error(`Balance after claim is not 4! Got: ${dev1BalPostClaim.rows[0].balance}`);
    }
    console.log('  ✔ Balance successfully deducted: 5 -> 4');

    // Verify transaction row
    const claimTxRes = await query(
      "SELECT id, type, amount, balance_after, reference_id FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_CLAIM' ORDER BY created_at DESC LIMIT 1",
      [dev1.devId]
    );
    if (claimTxRes.rows.length === 0) {
      throw new Error('PROJECT_CLAIM transaction not found in ledger!');
    }
    const claimTx = claimTxRes.rows[0];
    if (claimTx.amount !== -1 || claimTx.balance_after !== 4) {
      throw new Error(`Invalid claim tx data: amount=${claimTx.amount}, balance_after=${claimTx.balance_after}`);
    }
    console.log(`  ✔ Ledger recorded: PROJECT_CLAIM, amount: -1, balance_after: 4 (Ref: ${claimTx.reference_id})`);

    // Also Dev 2 claims the project (5 -> 4)
    const claimRes2 = await fetch(`${baseUrl}/api/projects/${projectId}/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev2.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pitch: 'Senior full-stack engineer ready to lead this project to completion.',
        estimatedDays: 35,
      }),
    });
    if (claimRes2.status !== 200 && claimRes2.status !== 201) {
      throw new Error(`Dev 2 claim failed: ${await claimRes2.text()}`);
    }
    const dev2BalPostClaim = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev2.devId]);
    if (dev2BalPostClaim.rows[0].balance !== 4) {
      throw new Error(`Dev 2 balance after claim is not 4! Got: ${dev2BalPostClaim.rows[0].balance}`);
    }
    console.log('  ✔ Dev 2 claimed project: balance 5 -> 4');

    // -------------------------------------------------------------------------
    // TEST 3 & 4: SELECTION & REFUND (Dev 2 selected, Dev 1 refunded 4 -> 5)
    // -------------------------------------------------------------------------
    console.log('\n[Test 3 & 4] Testing selection and automatic refund...');
    console.log('  - Client selects Dev 2 as Project Developer');

    const selectRes = await fetch(`${baseUrl}/api/projects/${projectId}/select`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selectedDeveloperId: dev2.devId }),
    });

    if (selectRes.status !== 200) {
      throw new Error(`Select developer failed: ${await selectRes.text()}`);
    }

    // Dev 1 (unselected): balance must be 4 -> 5
    const dev1BalPostRefund = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostRefund.rows[0].balance !== 5) {
      throw new Error(`Unselected Dev 1 balance was not refunded! Got: ${dev1BalPostRefund.rows[0].balance}`);
    }
    console.log('  ✔ Unselected Dev 1 refunded successfully: 4 -> 5');

    const refundTxRes = await query(
      "SELECT id, type, amount, balance_after, reference_id FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_NOT_SELECTED_REFUND' ORDER BY created_at DESC LIMIT 1",
      [dev1.devId]
    );
    if (refundTxRes.rows.length === 0) {
      throw new Error('PROJECT_NOT_SELECTED_REFUND transaction not found for Dev 1!');
    }
    const refundTx = refundTxRes.rows[0];
    if (refundTx.amount !== 1 || refundTx.balance_after !== 5) {
      throw new Error(`Invalid refund tx: amount=${refundTx.amount}, balance_after=${refundTx.balance_after}`);
    }
    console.log(`  ✔ Ledger recorded: PROJECT_NOT_SELECTED_REFUND, amount: +1, balance_after: 5 (Ref: ${refundTx.reference_id})`);

    // Dev 2 (selected): balance must remain 4 (no automatic refund)
    const dev2BalPostSelection = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev2.devId]);
    if (dev2BalPostSelection.rows[0].balance !== 4) {
      throw new Error(`Selected developer improperly refunded! Balance: ${dev2BalPostSelection.rows[0].balance}`);
    }
    const dev2RefundTxRes = await query(
      "SELECT id FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_NOT_SELECTED_REFUND'",
      [dev2.devId]
    );
    if (dev2RefundTxRes.rows.length !== 0) {
      throw new Error('Selected developer has an illegal refund transaction!');
    }
    console.log('  ✔ Selected Dev 2 balance preserved at 4 (No automatic refund for selected developer)');

    // -------------------------------------------------------------------------
    // TEST 5: DUPLICATE REFUND IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Testing duplicate refund execution idempotency...');
    const dupRefundResult = await CreditLedgerService.processSelectionRefunds(projectId, dev2.devId);
    if (dupRefundResult.refundedDevelopersCount !== 0) {
      throw new Error(`Duplicate refund issued! Refunded count: ${dupRefundResult.refundedDevelopersCount}`);
    }

    const dev1BalPostDupRefund = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostDupRefund.rows[0].balance !== 5) {
      throw new Error(`Dev 1 balance corrupted by duplicate refund! Balance: ${dev1BalPostDupRefund.rows[0].balance}`);
    }

    const dev1RefundCount = await query(
      "SELECT COUNT(*) as count FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_NOT_SELECTED_REFUND' AND project_id = $2",
      [dev1.devId, projectId]
    );
    if (parseInt(dev1RefundCount.rows[0].count, 10) !== 1) {
      throw new Error(`Expected exactly 1 refund transaction, found: ${dev1RefundCount.rows[0].count}`);
    }
    console.log('  ✔ Duplicate refund suppressed: 0 additional refunds issued, balance remains 5');
    results.refundTests = true;

    // -------------------------------------------------------------------------
    // TEST 6: NEGATIVE BALANCE DEFENSE (0 CREDITS)
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Testing negative balance prevention with 0 credits...');
    // Create an open project for Dev 3
    const proj3Res = await query(
      `INSERT INTO projects (
         project_number, slug, title, description, category,
         budget_min, budget_max, timeline, requirements, required_technologies,
         status, claim_cost, max_claims, claim_deadline, client_id
       ) VALUES (
         $1, $2, 'Zero Credit Protection Test', 'Defense test', 'Full-Stack Development',
         40000, 60000, '30 days', '["React", "Node.js", "PostgreSQL"]'::jsonb,
         '["React", "Node.js", "PostgreSQL"]'::jsonb, 'OPEN_FOR_CLAIMS', 1, 3,
         NOW() + INTERVAL '7 days', $3
       ) RETURNING id`,
      [`PRJ-ZERO-${Date.now().toString().slice(-4)}`, `zero-test-${suffix}`, clientId]
    );
    const zeroTestProjectId = proj3Res.rows[0].id;

    const zeroClaimRes = await fetch(`${baseUrl}/api/projects/${zeroTestProjectId}/claim`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev3.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pitch: 'Attempting claim with zero credits', estimatedDays: 15 }),
    });

    if (zeroClaimRes.status !== 400) {
      throw new Error(`Expected 400 for zero-credit claim, received: ${zeroClaimRes.status}`);
    }

    const zeroDevBal = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev3.devId]);
    if (zeroDevBal.rows[0].balance !== 0) {
      throw new Error(`Balance became negative or non-zero! Got: ${zeroDevBal.rows[0].balance}`);
    }

    const zeroClaimCount = await query('SELECT COUNT(*) as count FROM project_claims WHERE developer_id = $1', [dev3.devId]);
    if (parseInt(zeroClaimCount.rows[0].count, 10) !== 0) {
      throw new Error('Claim record was created for zero credit developer!');
    }

    const zeroTxCount = await query('SELECT COUNT(*) as count FROM credit_transactions WHERE developer_id = $1', [dev3.devId]);
    if (parseInt(zeroTxCount.rows[0].count, 10) !== 0) {
      throw new Error('Ledger transaction created for failed claim!');
    }
    console.log('  ✔ Claim with 0 credits strictly rejected (400 Bad Request)');
    console.log('  ✔ No negative balance, no claim record, no partial ledger transaction');

    // -------------------------------------------------------------------------
    // TEST 7: PAYMENT CREATION & WEBHOOK PROCESSING (Purchase 10 credits)
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Testing payment creation and cryptographic webhook processing (Purchase 10 credits)...');
    const orderRes = await fetch(`${baseUrl}/api/credits/payment/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credits: 10,
        amount: 500,
        gateway: 'STRIPE_TEST',
      }),
    });

    if (orderRes.status !== 200) {
      throw new Error(`Failed to create payment order: ${await orderRes.text()}`);
    }

    const orderData = (await orderRes.json()) as any;
    console.log(`  ✔ Payment order created: ID ${orderData.paymentId}, Gateway Ref: ${orderData.gatewayPaymentId}, Status: ${orderData.status}`);

    // Verify status is PENDING in DB
    const initialPaymentRow = await query('SELECT status FROM payments WHERE id = $1', [orderData.paymentId]);
    if (initialPaymentRow.rows[0].status !== 'PENDING') {
      throw new Error(`Payment status should be PENDING, got: ${initialPaymentRow.rows[0].status}`);
    }

    // Construct webhook event
    const webhookPayload = JSON.stringify({
      event: 'payment.succeeded',
      data: {
        gatewayPaymentId: orderData.gatewayPaymentId,
        amount: 500,
        currency: 'INR',
        credits: 10,
        developerId: dev1.devId,
      },
    });

    const validSignature = crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(webhookPayload)
      .digest('hex');

    const webhookRes = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': validSignature,
      },
      body: webhookPayload,
    });

    if (webhookRes.status !== 200) {
      throw new Error(`Webhook processing failed: ${await webhookRes.text()}`);
    }

    const webhookData = (await webhookRes.json()) as any;
    if (!webhookData.success || webhookData.status !== 'SUCCESS' || webhookData.creditsAdded !== 10) {
      throw new Error(`Webhook response invalid: ${JSON.stringify(webhookData)}`);
    }

    // Verify payment marked SUCCESS in DB
    const updatedPaymentRow = await query('SELECT status FROM payments WHERE id = $1', [orderData.paymentId]);
    if (updatedPaymentRow.rows[0].status !== 'SUCCESS') {
      throw new Error(`Payment not marked SUCCESS in DB: ${updatedPaymentRow.rows[0].status}`);
    }

    // Verify Dev 1 balance: 5 + 10 = 15
    const dev1BalPostPay = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostPay.rows[0].balance !== 15) {
      throw new Error(`Expected balance 15 after payment, got: ${dev1BalPostPay.rows[0].balance}`);
    }

    // Verify ledger transaction
    const payTxRes = await query(
      "SELECT id, type, amount, balance_after, reference_id FROM credit_transactions WHERE developer_id = $1 AND type = 'PURCHASE' ORDER BY created_at DESC LIMIT 1",
      [dev1.devId]
    );
    if (payTxRes.rows.length === 0) {
      throw new Error('PURCHASE transaction missing from ledger!');
    }
    const payTx = payTxRes.rows[0];
    if (payTx.amount !== 10 || payTx.balance_after !== 15 || payTx.reference_id !== orderData.gatewayPaymentId) {
      throw new Error(`Invalid purchase transaction data: ${JSON.stringify(payTx)}`);
    }
    console.log(`  ✔ Webhook signature verified with HMAC-SHA256`);
    console.log(`  ✔ Payment marked SUCCESS, 10 credits added (5 -> 15)`);
    console.log(`  ✔ Ledger recorded: PURCHASE, amount: +10, balance_after: 15 (Ref: ${payTx.reference_id})`);

    // -------------------------------------------------------------------------
    // TEST 8: DUPLICATE WEBHOOK IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Testing duplicate webhook idempotency...');
    const dupWebhookRes = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': validSignature,
      },
      body: webhookPayload,
    });

    if (dupWebhookRes.status !== 200) {
      throw new Error(`Duplicate webhook failed with status ${dupWebhookRes.status}`);
    }

    const dupWebhookData = (await dupWebhookRes.json()) as any;
    if (!dupWebhookData.duplicate || dupWebhookData.creditsAdded !== 0) {
      throw new Error(`Duplicate webhook was re-credited! Data: ${JSON.stringify(dupWebhookData)}`);
    }

    const dev1BalPostDupWh = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostDupWh.rows[0].balance !== 15) {
      throw new Error(`Balance changed on duplicate webhook! Got: ${dev1BalPostDupWh.rows[0].balance}`);
    }

    const purchaseTxCount = await query(
      "SELECT COUNT(*) as count FROM credit_transactions WHERE developer_id = $1 AND reference_id = $2",
      [dev1.devId, orderData.gatewayPaymentId]
    );
    if (parseInt(purchaseTxCount.rows[0].count, 10) !== 1) {
      throw new Error(`Multiple purchase transactions found for single order: ${purchaseTxCount.rows[0].count}`);
    }
    console.log('  ✔ Duplicate webhook detected: 0 credits added, balance remains 15');
    results.webhookTests = true;

    // -------------------------------------------------------------------------
    // TEST 9: FAILED PAYMENT HANDLING
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Testing failed payment webhook event...');
    const failedOrderRes = await fetch(`${baseUrl}/api/credits/payment/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        credits: 10,
        amount: 500,
        gateway: 'STRIPE_TEST',
      }),
    });
    const failedOrderData = (await failedOrderRes.json()) as any;

    const failedPayload = JSON.stringify({
      event: 'payment.failed',
      data: {
        gatewayPaymentId: failedOrderData.gatewayPaymentId,
      },
    });

    const failedSignature = crypto
      .createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET)
      .update(failedPayload)
      .digest('hex');

    const failedWebhookRes = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': failedSignature,
      },
      body: failedPayload,
    });

    const failedWebhookData = (await failedWebhookRes.json()) as any;
    if (failedWebhookData.status !== 'FAILED' || failedWebhookData.creditsAdded !== 0) {
      throw new Error(`Failed payment improperly credited: ${JSON.stringify(failedWebhookData)}`);
    }

    const failedPaymentInDb = await query('SELECT status FROM payments WHERE id = $1', [failedOrderData.paymentId]);
    if (failedPaymentInDb.rows[0].status !== 'FAILED') {
      throw new Error(`Payment row status not updated to FAILED: ${failedPaymentInDb.rows[0].status}`);
    }

    const dev1BalPostFail = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostFail.rows[0].balance !== 15) {
      throw new Error(`Balance altered on failed payment! Got: ${dev1BalPostFail.rows[0].balance}`);
    }
    console.log('  ✔ Failed payment marked FAILED in database: 0 credits added, balance remains 15');

    // -------------------------------------------------------------------------
    // TEST 10: MANIPULATED FRONTEND DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n[Test 10] Testing manipulated frontend / unverified client payment defense...');
    // Attempt 1: Direct client balance mutation endpoint
    const manipulatedRes1 = await fetch(`${baseUrl}/api/credits/payment/verify-client`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dev1.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentId: failedOrderData.paymentId, status: 'SUCCESS' }),
    });

    if (manipulatedRes1.status !== 403) {
      throw new Error(`Client manipulation was not rejected with 403! Status: ${manipulatedRes1.status}`);
    }

    // Attempt 2: Webhook forgery with fake signature
    const forgedWebhookRes = await fetch(`${baseUrl}/api/credits/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nexus-signature': '0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: webhookPayload,
    });

    if (forgedWebhookRes.status !== 401) {
      throw new Error(`Forged webhook signature was not rejected with 401! Status: ${forgedWebhookRes.status}`);
    }

    const dev1BalPostManip = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    if (dev1BalPostManip.rows[0].balance !== 15) {
      throw new Error(`Balance altered by unauthorized manipulation! Got: ${dev1BalPostManip.rows[0].balance}`);
    }
    console.log('  ✔ Client-side payment modification strictly blocked (403 Forbidden)');
    console.log('  ✔ Forged webhook signature rejected (401 Unauthorized)');
    console.log('  ✔ Zero credits added, balance remains protected at 15');
    results.paymentTests = true;

    // -------------------------------------------------------------------------
    // TEST 11: MANUAL ADMIN ADJUSTMENT (+5 credits)
    // -------------------------------------------------------------------------
    console.log('\n[Test 11] Testing manual admin adjustment (+5 credits)...');
    const adminAdjustRes = await fetch(`${baseUrl}/api/credits/admin/adjust`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        developerId: dev1.devId,
        amount: 5,
        reason: 'Authorized platform bounty reward for security audit participation',
      }),
    });

    if (adminAdjustRes.status !== 200) {
      throw new Error(`Admin adjustment failed: ${await adminAdjustRes.text()}`);
    }

    const adminAdjustData = (await adminAdjustRes.json()) as any;
    if (!adminAdjustData.success || adminAdjustData.newBalance !== 20) {
      throw new Error(`Admin adjustment balance mismatch: ${JSON.stringify(adminAdjustData)}`);
    }

    // Verify transaction
    const adjTxRes = await query(
      "SELECT id, type, amount, balance_after, reference_id, description, created_at FROM credit_transactions WHERE developer_id = $1 AND type = 'ADMIN_ADJUSTMENT' ORDER BY created_at DESC LIMIT 1",
      [dev1.devId]
    );
    if (adjTxRes.rows.length === 0) {
      throw new Error('ADMIN_ADJUSTMENT transaction missing from ledger!');
    }
    const adjTx = adjTxRes.rows[0];
    if (adjTx.amount !== 5 || adjTx.balance_after !== 20) {
      throw new Error(`Invalid admin adjustment tx data: ${JSON.stringify(adjTx)}`);
    }

    // Verify audit logs
    const auditLogRes = await query(
      "SELECT id, actor_user_id, action, entity_id, metadata, created_at FROM audit_logs WHERE entity_id = $1 AND action = 'CREDIT_ADMIN_ADJUSTMENT' ORDER BY created_at DESC LIMIT 1",
      [dev1.devId]
    );
    if (auditLogRes.rows.length === 0) {
      throw new Error('Audit log missing for admin adjustment!');
    }
    const auditLog = auditLogRes.rows[0];
    console.log(`  ✔ ADMIN_ADJUSTMENT transaction created: amount: +5, balance_after: 20 (Ref: ${adjTx.reference_id})`);
    console.log(`  ✔ Reason recorded: "${adjTx.description}"`);
    console.log(`  ✔ Admin ID recorded in audit log: ${auditLog.actor_user_id}`);
    console.log(`  ✔ Timestamp recorded: ${auditLog.created_at}`);

    // Dev 1 balance is now 20
    const dev1FinalBal = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [dev1.devId]);
    results.actualBalance = dev1FinalBal.rows[0].balance;
    if (results.actualBalance !== 20) {
      throw new Error(`Final balance mismatch! Expected: 20, Got: ${results.actualBalance}`);
    }
    console.log(`  ✔ Dev 1 final balance confirmed: ${results.actualBalance} credits`);

    // -------------------------------------------------------------------------
    // TEST 12: RACE CONDITION DEFENSE
    // -------------------------------------------------------------------------
    console.log('\n[Test 12] Testing high-concurrency race condition defense...');
    // Create developer with exactly 1 credit
    const raceDev = await createTestDeveloper('Race Tester', `race_${suffix}`, 1);

    // Create 2 open projects with cost 1 credit
    const createRaceProject = async (index: number) => {
      const p = await query(
        `INSERT INTO projects (
           project_number, slug, title, description, category,
           budget_min, budget_max, timeline, requirements, required_technologies,
           status, claim_cost, max_claims, claim_deadline, client_id
         ) VALUES (
           $1, $2, $3, 'Race condition test project', 'Full-Stack Development',
           50000, 70000, '30 days', '["React", "Node.js", "PostgreSQL"]'::jsonb,
           '["React", "Node.js", "PostgreSQL"]'::jsonb, 'OPEN_FOR_CLAIMS', 1, 3,
           NOW() + INTERVAL '10 days', $4
         ) RETURNING id`,
        [`PRJ-RACE-${index}-${Date.now().toString().slice(-4)}`, `race-project-${index}-${suffix}`, `Race Project ${index}`, clientId]
      );
      return p.rows[0].id;
    };

    const raceProj1 = await createRaceProject(1);
    const raceProj2 = await createRaceProject(2);

    console.log('  - Firing 2 simultaneous claim requests concurrently (Starting balance: 1 credit, Cost: 1 credit each)...');
    const claimPromises = [
      fetch(`${baseUrl}/api/projects/${raceProj1}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${raceDev.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pitch: 'Concurrent claim 1', estimatedDays: 20 }),
      }),
      fetch(`${baseUrl}/api/projects/${raceProj2}/claim`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${raceDev.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pitch: 'Concurrent claim 2', estimatedDays: 20 }),
      }),
    ];

    const [resRace1, resRace2] = await Promise.all(claimPromises);
    const statuses = [resRace1.status, resRace2.status].sort();

    console.log(`  - Concurrency response statuses: [${statuses[0]}, ${statuses[1]}]`);

    const hasSuccess = statuses.some((s) => s === 200 || s === 201);
    const hasRejected = statuses.some((s) => s === 400 || s === 403);

    if (!hasSuccess || !hasRejected) {
      throw new Error(`Race condition failure! Expected exactly one success (200/201) and one rejected (400), got: [${statuses[0]}, ${statuses[1]}]`);
    }

    const raceDevBal = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [raceDev.devId]);
    if (raceDevBal.rows[0].balance !== 0) {
      throw new Error(`Race condition resulted in invalid balance! Got: ${raceDevBal.rows[0].balance}`);
    }

    const raceTxCount = await query(
      "SELECT COUNT(*) as count FROM credit_transactions WHERE developer_id = $1 AND type = 'PROJECT_CLAIM'",
      [raceDev.devId]
    );
    if (parseInt(raceTxCount.rows[0].count, 10) !== 1) {
      throw new Error(`Race condition created incorrect transaction count! Count: ${raceTxCount.rows[0].count}`);
    }
    console.log('  ✔ Atomic row-locking prevented double spend: Exactly 1 claim succeeded (201), 1 rejected (400)');
    console.log('  ✔ Final balance: 0 credits (Zero negative balance risk under parallel load)');
    results.raceConditionTests = true;

    // -------------------------------------------------------------------------
    // TEST 13: LEDGER VERIFICATION & BALANCE RECONCILIATION
    // -------------------------------------------------------------------------
    console.log('\n[Test 13] Executing complete immutable ledger verification & mathematical reconciliation...');
    const allTxs = await query(
      `SELECT id, type, amount, balance_after, reference_id, description, created_at
       FROM credit_transactions
       WHERE developer_id = $1
       ORDER BY created_at ASC`,
      [dev1.devId]
    );

    let runningBalance = results.startingBalance;
    results.transactions = [];

    for (const tx of allTxs.rows) {
      const txAmount = Number(tx.amount);
      const txBalanceAfter = Number(tx.balance_after);
      runningBalance += txAmount;

      if (runningBalance !== txBalanceAfter) {
        throw new Error(
          `Discrepancy in ledger sequence! Tx ${tx.id} (${tx.type}): expected balance_after ${runningBalance}, recorded ${txBalanceAfter}`
        );
      }

      if (!tx.reference_id || tx.reference_id.trim() === '') {
        throw new Error(`Transaction ${tx.id} missing reference_id!`);
      }

      results.transactions.push({
        id: tx.id,
        type: tx.type,
        amount: txAmount,
        balanceAfter: txBalanceAfter,
        referenceId: tx.reference_id,
        description: tx.description,
        createdAt: tx.created_at,
      });

      console.log(
        `  ✔ Verified Tx: ${tx.type.padEnd(28)} | Amount: ${txAmount > 0 ? '+' : ''}${txAmount} | Balance After: ${txBalanceAfter} | Ref: ${tx.reference_id}`
      );
    }

    const sumTransactions = results.transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const calculatedFinalBalance = results.startingBalance + sumTransactions;

    console.log('\n--- Mathematical Reconciliation ---');
    console.log(`Starting Balance:         ${results.startingBalance}`);
    console.log(`Sum of all transactions:  ${sumTransactions > 0 ? '+' : ''}${sumTransactions}`);
    console.log(`Calculated Final Balance: ${calculatedFinalBalance}`);
    console.log(`Actual Account Balance:   ${results.actualBalance}`);

    if (calculatedFinalBalance !== results.actualBalance) {
      throw new Error(`CRITICAL LEDGER DISCREPANCY: Calculated (${calculatedFinalBalance}) != Actual (${results.actualBalance})`);
    }
    console.log('✔ Ledger Reconciliation EQUATION VERIFIED: starting_balance + sum(transactions) == current_balance');

    return results;
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        (server as Server).close(() => resolve());
      });
      console.log('\n[Audit Harness] Live test server shut down cleanly.');
    }
  }
}

// Allow direct execution via tsx
if (process.argv[1]?.endsWith('creditPaymentAuditTest.ts')) {
  runCreditPaymentAudit()
    .then((res) => {
      console.log('\n================================================================');
      console.log('AUDIT REPORT OUTPUT');
      console.log('================================================================');
      console.log(`Starting balance: ${res.startingBalance}`);
      console.log('Every transaction:');
      for (const t of res.transactions) {
        console.log(`  - [${t.type}] amount: ${t.amount > 0 ? '+' : ''}${t.amount}, balance_after: ${t.balanceAfter}, ref: ${t.referenceId}, desc: "${t.description}"`);
      }
      console.log(`Expected balance: ${res.expectedBalance}`);
      console.log(`Actual balance: ${res.actualBalance}`);
      console.log(`Payment tests: ${res.paymentTests ? 'PASS' : 'FAIL'}`);
      console.log(`Webhook tests: ${res.webhookTests ? 'PASS' : 'FAIL'}`);
      console.log(`Refund tests: ${res.refundTests ? 'PASS' : 'FAIL'}`);
      console.log(`Race-condition tests: ${res.raceConditionTests ? 'PASS' : 'FAIL'}`);
      console.log('================================================================\n');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n❌ Phase 7 Audit Test Suite Failed:', err);
      process.exit(1);
    });
}
