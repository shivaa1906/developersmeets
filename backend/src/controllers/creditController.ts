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
    const { developerId, amount, reason } = req.body;

    if (!developerId || amount === undefined || !reason) {
      res.status(400).json({ error: 'developerId, amount, and reason are required' });
      return;
    }

    try {
      const result = await CreditLedgerService.adminAdjustment(
        developerId,
        parseInt(amount, 10),
        reason,
        req.user!.userId
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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

