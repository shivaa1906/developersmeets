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
    const devId = req.user?.developerId;
    if (!devId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    try {
      const acc = await query('SELECT balance FROM credit_accounts WHERE developer_id = $1', [devId]);
      const balance = acc.rows.length > 0 ? acc.rows[0].balance : 0;
      res.json({ balance, developerId: devId });
    } catch (_error: any) {
      res.json({ balance: 0, developerId: devId });
    }
  }

  static async getLedger(req: AuthenticatedRequest, res: Response): Promise<void> {
    const devId = req.user?.developerId;
    if (!devId) {
      res.status(403).json({ error: 'Developer profile required' });
      return;
    }

    try {
      const txs = await query(
        `SELECT id, type, amount, balance_after, reference_id, description, created_at
         FROM credit_transactions
         WHERE developer_id = $1
         ORDER BY created_at DESC`,
        [devId]
      );
      res.json({ ledger: txs.rows });
    } catch (_error: any) {
      res.json({ ledger: [] });
    }
  }

  static async purchase(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    if (!targetId || amount === undefined || !reason) {
      res.status(400).json({ error: 'target (userId, developerId, or public UID), amount, and reason are required' });
      return;
    }

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Credit grant amount must be a positive integer greater than zero' });
      return;
    }

    try {
      const result = await CreditLedgerService.grantCredits({
        target: targetId,
        amount: numAmount,
        reason,
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

    if (!targetId || amount === undefined || !reason) {
      res.status(400).json({ error: 'target (userId, developerId, or public UID), amount, and reason are required' });
      return;
    }

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Credit removal amount must be a positive integer greater than zero' });
      return;
    }

    try {
      const result = await CreditLedgerService.removeCredits({
        target: targetId,
        amount: numAmount,
        reason,
        adminUserId: req.user!.userId,
        referenceId,
        metadata,
      });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async bulkGrant(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetScope = 'ALL_DEVELOPERS', userIds, amount, reason, metadata } = req.body;

    if (!amount || !reason) {
      res.status(400).json({ error: 'amount and reason are required for bulk grant' });
      return;
    }

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'amount must be a positive integer greater than zero' });
      return;
    }

    try {
      const result = await CreditLedgerService.bulkGrantCredits({
        targetScope,
        userIds,
        amount: numAmount,
        reason,
        adminUserId: req.user!.userId,
        metadata,
      });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async bulkRemove(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { targetScope = 'ALL_DEVELOPERS', userIds, amount, reason, allowPartial = true, metadata } = req.body;

    if (!amount || !reason) {
      res.status(400).json({ error: 'amount and reason are required for bulk removal' });
      return;
    }

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'amount must be a positive integer greater than zero' });
      return;
    }

    try {
      const result = await CreditLedgerService.bulkRemoveCredits({
        targetScope,
        userIds,
        amount: numAmount,
        reason,
        adminUserId: req.user!.userId,
        allowPartial,
        metadata,
      });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getCreditHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { userId, type, performedBy, startDate, endDate, search, limit, offset } = req.query;

    try {
      const result = await CreditLedgerService.getCreditHistory({
        userId: typeof userId === 'string' ? userId : undefined,
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

  static async listAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { search, role, limit, offset } = req.query;

    try {
      const result = await CreditLedgerService.listCreditAccounts({
        search: typeof search === 'string' ? search : undefined,
        role: typeof role === 'string' ? role : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(result);
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

