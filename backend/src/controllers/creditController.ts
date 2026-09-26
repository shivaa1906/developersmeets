import { Request, Response } from 'express';
import { CreditLedgerService } from '../services/creditLedgerService.js';
import { query } from '../database/db.js';
import { AuthenticatedRequest } from '../types/index.js';

export const CREDIT_PACKAGES = [
  { id: 'pkg_starter', name: 'Starter Pack', credits: 5, priceInr: 250, popular: false },
  { id: 'pkg_pro', name: 'Professional Pack', credits: 15, priceInr: 700, popular: true, discount: '7% OFF' },
  { id: 'pkg_elite', name: 'Enterprise Pack', credits: 30, priceInr: 1350, popular: false, discount: '10% OFF' },
];

export class CreditController {
  static async getPackages(req: Request, res: Response): Promise<void> {
    res.json({ packages: CREDIT_PACKAGES });
  }

  static async getBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user?.role === 'CLIENT') {
      res.status(403).json({ error: 'Forbidden: Client accounts do not have access to developer credit wallet' });
      return;
    }

    const devId = req.user?.developerId;
    const userId = req.user?.userId;

    if (!devId && !userId) {
      res.status(403).json({ error: 'Developer profile or authenticated user required' });
      return;
    }

    try {
      // Identity strictly derived from authenticated session, never request query parameters
      const acc = await query(
        `SELECT balance FROM credit_accounts 
         WHERE (user_id = $1 AND user_id IS NOT NULL)
            OR (developer_id = $2 AND developer_id IS NOT NULL)
         ORDER BY (user_id = $1) DESC
         LIMIT 1`,
        [userId || null, devId || null]
      );
      const balance = acc.rows.length > 0 ? acc.rows[0].balance : 0;
      res.json({ balance, developerId: devId, userId });
    } catch (_error: any) {
      res.json({ balance: 0, developerId: devId, userId });
    }
  }

  static async getLedger(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user?.role === 'CLIENT') {
      res.status(403).json({ error: 'Forbidden: Client accounts do not have access to developer credit wallet' });
      return;
    }

    const devId = req.user?.developerId;
    const userId = req.user?.userId;

    if (!devId && !userId) {
      res.status(403).json({ error: 'Developer profile or authenticated user required' });
      return;
    }

    try {
      // Identity strictly derived from authenticated session, never request query parameters
      const txs = await query(
        `SELECT id, type, amount, balance_before, balance_after, reference_id, description, reason, created_at
         FROM credit_transactions
         WHERE (user_id = $1 AND user_id IS NOT NULL)
            OR (developer_id = $2 AND developer_id IS NOT NULL)
         ORDER BY created_at DESC`,
        [userId || null, devId || null]
      );
      res.json({ ledger: txs.rows });
    } catch (_error: any) {
      res.json({ ledger: [] });
    }
  }

  static async purchase(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user?.role === 'CLIENT') {
      res.status(403).json({ error: 'Forbidden: Clients cannot purchase developer project claim credits' });
      return;
    }

    const devId = req.user?.developerId;
    if (!devId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    const { packageId } = req.body;
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      res.status(400).json({ error: 'Invalid credit package selected' });
      return;
    }

    try {
      const result = await CreditLedgerService.purchaseCredits(
        devId,
        req.user!.userId,
        pkg.credits,
        pkg.priceInr,
        'STRIPE_MOCK'
      );
      res.json({
        message: `Successfully purchased ${pkg.credits} credits!`,
        package: pkg,
        ...result,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async adminAdjust(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { developerId, userId, target, amount, reason, type } = req.body;
    const targetId = target || userId || developerId;

    if (!targetId || amount === undefined || !reason) {
      res.status(400).json({ error: 'developerId (or target/userId), amount, and reason are required' });
      return;
    }

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount === 0) {
      res.status(400).json({ error: 'amount must be a non-zero integer' });
      return;
    }

    try {
      const result = await CreditLedgerService.adminAdjustment(
        targetId,
        numAmount,
        reason,
        req.user!.userId,
        type
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async grantCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { target, userId, developerId, amount, reason, referenceId, metadata } = req.body;
    const targetId = target || userId || developerId;

    if (!targetId || amount === undefined || amount === null || !reason) {
      res.status(400).json({ error: 'target (userId, developerId, or public UID), amount, and reason are required' });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      res.status(400).json({ error: 'Credit grant amount must be a positive integer between 1 and 1,000,000.' });
      return;
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Mandatory justification reason (at least 5 characters) required for credit adjustments.' });
      return;
    }

    try {
      const result = await CreditLedgerService.grantCredits({
        target: String(targetId).trim(),
        amount: numAmount,
        reason: reason.trim(),
        adminUserId: req.user!.userId,
        referenceId,
        metadata,
      });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async removeCredits(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { target, userId, developerId, amount, reason, referenceId, metadata } = req.body;
    const targetId = target || userId || developerId;

    if (!targetId || amount === undefined || amount === null || !reason) {
      res.status(400).json({ error: 'target (userId, developerId, or public UID), amount, and reason are required' });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      res.status(400).json({ error: 'Credit removal amount must be a positive integer between 1 and 1,000,000.' });
      return;
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Mandatory justification reason (at least 5 characters) required for credit removal.' });
      return;
    }

    try {
      const result = await CreditLedgerService.removeCredits({
        target: String(targetId).trim(),
        amount: numAmount,
        reason: reason.trim(),
        adminUserId: req.user!.userId,
        referenceId,
        metadata,
      });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async previewBulkGrant(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetScope = 'ALL', userIds, filters, amount, reason } = req.body;

    if (amount === undefined || amount === null || !reason) {
      res.status(400).json({ error: 'amount and reason are required for bulk preview' });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      res.status(400).json({ error: 'Credits per user must be a positive integer between 1 and 1,000,000' });
      return;
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Mandatory justification reason (at least 5 characters) required.' });
      return;
    }

    try {
      const preview = await CreditLedgerService.previewBulkGrant({
        targetScope,
        userIds,
        filters,
        amount: numAmount,
        reason: reason.trim(),
      });
      res.json(preview);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async bulkGrant(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetScope = 'ALL', userIds, filters, amount, reason, async: isAsync, metadata } = req.body;

    if (amount === undefined || amount === null || !reason) {
      res.status(400).json({ error: 'amount and reason are required for bulk grant' });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      res.status(400).json({ error: 'Credit amount per user must be a positive integer between 1 and 1,000,000' });
      return;
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Mandatory justification reason (at least 5 characters) required.' });
      return;
    }

    try {
      const result = await CreditLedgerService.bulkGrantCredits({
        targetScope,
        userIds,
        filters,
        amount: numAmount,
        reason: reason.trim(),
        adminUserId: req.user!.userId,
        async: Boolean(isAsync),
        metadata,
      });
      res.status(result.status === 'PROCESSING' ? 202 : 200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async listBulkOperations(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { limit, offset } = req.query;

    try {
      const result = await CreditLedgerService.listBulkOperations({
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getBulkOperation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { operationId } = req.params;

    try {
      const result = await CreditLedgerService.getBulkOperation(operationId);
      res.json(result);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async previewBulkRemove(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetScope = 'ALL', userIds, filters, amount, reason, allowPartial = true } = req.body;

    if (amount === undefined || amount === null || !reason) {
      res.status(400).json({ error: 'amount and reason are required for bulk removal preview' });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      res.status(400).json({ error: 'Credits to remove per user must be a positive integer between 1 and 1,000,000' });
      return;
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Mandatory justification reason (at least 5 characters) required.' });
      return;
    }

    try {
      const preview = await CreditLedgerService.previewBulkRemove({
        targetScope,
        userIds,
        filters,
        amount: numAmount,
        reason: reason.trim(),
        allowPartial: Boolean(allowPartial),
      });
      res.json(preview);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async bulkRemove(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetScope = 'ALL', userIds, filters, amount, reason, allowPartial = true, metadata } = req.body;

    if (amount === undefined || amount === null || !reason) {
      res.status(400).json({ error: 'amount and reason are required for bulk removal' });
      return;
    }

    const numAmount = Number(amount);
    if (!Number.isInteger(numAmount) || !Number.isSafeInteger(numAmount) || numAmount <= 0 || numAmount > 1_000_000) {
      res.status(400).json({ error: 'amount must be a positive integer between 1 and 1,000,000' });
      return;
    }

    if (typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({ error: 'Mandatory justification reason (at least 5 characters) required.' });
      return;
    }

    try {
      const result = await CreditLedgerService.bulkRemoveCredits({
        targetScope,
        userIds,
        filters,
        amount: numAmount,
        reason: reason.trim(),
        adminUserId: req.user!.userId,
        allowPartial: Boolean(allowPartial),
        metadata,
      });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getCreditHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { userId, uid, role, type, performedBy, startDate, endDate, search, limit, offset } = req.query;

    try {
      const result = await CreditLedgerService.getCreditHistory({
        userId: typeof userId === 'string' ? userId : undefined,
        uid: typeof uid === 'string' ? uid : undefined,
        role: typeof role === 'string' ? role : undefined,
        type: typeof type === 'string' ? type : undefined,
        performedBy: typeof performedBy === 'string' ? performedBy : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
        search: typeof search === 'string' ? search : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getCreditStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await CreditLedgerService.getCreditStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async listAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { search, role, balanceFilter, minBalance, maxBalance, uid, limit, offset } = req.query;

    try {
      const result = await CreditLedgerService.listCreditAccounts({
        search: typeof search === 'string' ? search : undefined,
        role: typeof role === 'string' ? role : undefined,
        balanceFilter: typeof balanceFilter === 'string' ? (balanceFilter as any) : undefined,
        minBalance: minBalance !== undefined ? Number(minBalance) : undefined,
        maxBalance: maxBalance !== undefined ? Number(maxBalance) : undefined,
        uid: typeof uid === 'string' ? uid : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getUserCreditDetail(req: AuthenticatedRequest, res: Response): Promise<void> {
    const target = req.params.target || req.params.userId;
    if (!target) {
      res.status(400).json({ error: 'target user ID or UID is required' });
      return;
    }

    try {
      const detail = await CreditLedgerService.getUserCreditDetail(target);
      res.json(detail);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async exportCreditTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { userId, uid, role, type, performedBy, startDate, endDate, search } = req.query;

    try {
      const result = await CreditLedgerService.exportCreditTransactions({
        userId: typeof userId === 'string' ? userId : undefined,
        uid: typeof uid === 'string' ? uid : undefined,
        role: typeof role === 'string' ? role : undefined,
        type: typeof type === 'string' ? type : undefined,
        performedBy: typeof performedBy === 'string' ? performedBy : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
        search: typeof search === 'string' ? search : undefined,
        adminUserId: req.user!.userId,
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.status(200).send(result.csvContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async searchUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { q, search, limit } = req.query;
    const searchQuery = typeof q === 'string' ? q : (typeof search === 'string' ? search : undefined);

    try {
      const users = await CreditLedgerService.searchEligibleUsers(
        searchQuery,
        limit ? parseInt(limit as string, 10) : 20
      );
      res.json({ users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const devId = req.user?.developerId;
    if (!devId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    const { credits, amount, gateway } = req.body;
    if (!credits || !amount) {
      res.status(400).json({ error: 'credits and amount are required' });
      return;
    }

    try {
      const order = await CreditLedgerService.createPaymentOrder(
        devId,
        req.user!.userId,
        parseInt(credits, 10),
        parseFloat(amount),
        gateway || 'STRIPE_TEST'
      );
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = (req.headers['x-nexus-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['x-signature']) as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing webhook signature header' });
      return;
    }

    const rawPayload = (req as any).rawBody || JSON.stringify(req.body);
    try {
      const result = await CreditLedgerService.processWebhook(rawPayload, signature);
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes('signature')) {
        res.status(401).json({ error: error.message });
        return;
      }
      res.status(400).json({ error: error.message });
    }
  }

  static async verifyClientPayment(_req: AuthenticatedRequest, res: Response): Promise<void> {
    res.status(403).json({
      error: 'Client-side payment modification rejected: Direct balance modification is strictly prohibited. Cryptographic gateway webhook required.',
      securityCode: 'SEC_UNAUTHORIZED_PAYMENT_MUTATION',
    });
  }
}

