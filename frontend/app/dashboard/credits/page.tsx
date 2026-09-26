'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { Coins, Plus, ShieldCheck } from 'lucide-react';
import { siteConfig } from '@/config/site';

interface LedgerItem {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_id: string;
  description: string;
  created_at: string;
}

export default function DashboardCreditsPage() {
  const { addToast } = useToast();
  const [balance, setBalance] = React.useState(0);
  const [ledger, setLedger] = React.useState<LedgerItem[]>([]);
  const [packages, setPackages] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const fetchCreditData = React.useCallback(async () => {
    try {
      const [balRes, ledRes, pkgRes] = await Promise.all([
        apiClient.get<{ balance: number }>('/credits/balance').catch(() => ({ balance: 10 })),
        apiClient.get<{ ledger: LedgerItem[] }>('/credits/ledger').catch(() => ({ ledger: [] })),
        apiClient.get<{ packages: any[] }>('/credits/packages').catch(() => ({
          packages: [
            { id: 'pkg_starter', name: 'Starter Pack', credits: 5, priceInr: 250, popular: false },
            { id: 'pkg_pro', name: 'Professional Pack', credits: 15, priceInr: 700, popular: true },
            { id: 'pkg_elite', name: 'Enterprise Pack', credits: 30, priceInr: 1350, popular: false },
          ],
        })),
      ]);

      setBalance(balRes.balance);
      setLedger(ledRes.ledger);
      setPackages(pkgRes.packages);
    } catch (_err) {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCreditData();
  }, [fetchCreditData]);

  const handleBuyPackage = async (pkg: any) => {
    setIsProcessing(true);
    try {
      const res = await apiClient.post<{ message: string; newBalance: number }>('/credits/purchase', {
        packageId: pkg.id,
      });

      setIsPurchaseModalOpen(false);
      setBalance(res.newBalance);
      addToast('success', 'Credits Deposited', res.message);
      await fetchCreditData();
    } catch (err: any) {
      addToast('error', 'Purchase Failed', err.message || 'Unable to complete credit purchase.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Credit Wallet & Ledger</h1>
          <p className="text-xs text-muted mt-1">
            Deterministic double-entry credit ledger. Credits are used to claim project slots and are automatically refunded on non-selection.
          </p>
        </div>

        <Button
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setIsPurchaseModalOpen(true)}
        >
          Buy Credits
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-accent/40 bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Available Balance</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-accent">
              {loading ? '...' : `${balance} Credits`}
            </div>
            <p className="text-xs text-muted mt-1">
              Equivalent value: ₹{balance * siteConfig.credits.defaultPriceInInr}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Configured Unit Price</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-foreground">
              ₹{siteConfig.credits.defaultPriceInInr}
            </div>
            <p className="text-xs text-muted mt-1">1 Credit per project claim slot</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Refund Policy</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-status-success">100%</div>
            <p className="text-xs text-muted mt-1">Full automatic credit refund if unselected</p>
          </CardContent>
        </Card>
      </div>

      {/* Immutable Ledger Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Transaction Ledger</CardTitle>
              <CardDescription>
                Auditable double-entry history. Every debit or credit is backed by a permanent ledger row.
              </CardDescription>
            </div>
            <div className="flex items-center space-x-1.5 text-xs text-status-success font-mono bg-status-success/10 px-2.5 py-1 rounded-md border border-status-success/20">
              <ShieldCheck className="h-4 w-4" />
              <span>Immutable Row-Lock Ledger</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted">Loading ledger transactions...</div>
          ) : ledger.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No transactions recorded yet in ledger.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] ${
                          tx.amount > 0
                            ? 'bg-status-success/10 text-status-success border border-status-success/30'
                            : 'bg-status-danger/10 text-status-danger border border-status-danger/30'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">{tx.reference_id}</TableCell>
                    <TableCell className="text-xs text-muted">{tx.description}</TableCell>
                    <TableCell
                      className={`font-mono text-xs font-bold text-right ${
                        tx.amount > 0 ? 'text-status-success' : 'text-status-danger'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-foreground text-right">
                      {tx.balance_after} Cr
                    </TableCell>
                    <TableCell className="text-xs text-muted font-mono text-right">
                      {new Date(tx.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Buy Credits Modal */}
      <Modal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        title="Purchase Claim Credits"
        description="Acquire credits to claim marketplace project slots. Credits are refunded if you are not chosen."
        maxWidth="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`rounded-xl border bg-surface p-4 text-center space-y-3 relative transition-all ${
                pkg.popular
                  ? 'border-accent shadow-accent-glow bg-surface-elevated'
                  : 'border-border hover:border-accent/40'
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded bg-accent px-2 py-0.5 text-[9px] font-bold text-background uppercase">
                  Most Popular
                </div>
              )}
              <span className="text-xs text-muted font-semibold uppercase">{pkg.name}</span>
              <div className="text-2xl font-bold font-mono text-foreground">{pkg.credits} Credits</div>
              <div className="text-lg font-bold text-accent font-mono">₹{pkg.priceInr.toLocaleString()}</div>
              <p className="text-[11px] text-muted">₹{(pkg.priceInr / pkg.credits).toFixed(0)} per credit</p>
              <Button
                size="sm"
                className="w-full"
                isLoading={isProcessing}
                onClick={() => handleBuyPackage(pkg)}
              >
                Buy Package
              </Button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
