'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';

interface LedgerRow {
  id: string;
  developer_id: string;
  developer_username: string;
  developer_name: string;
  project_title?: string;
  project_number?: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_id: string;
  description: string;
  created_at: string;
}

export default function AdminCreditsPage() {
  const { addToast } = useToast();
  const [isAdjustModalOpen, setIsAdjustModalOpen] = React.useState(false);
  const [developerId, setDeveloperId] = React.useState('');
  const [amount, setAmount] = React.useState('5');
  const [reason, setReason] = React.useState('');
  const [transactions, setTransactions] = React.useState<LedgerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchLedger = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ ledger: LedgerRow[] }>('/admin/ledger');
      setTransactions(res.ledger || []);
    } catch (_err) {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      addToast('error', 'Reason Required', 'Every admin adjustment must state an auditable reason.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/credits/admin/adjust', {
        developerId,
        amount: Number(amount),
        reason,
      });

      addToast('success', 'Credit Adjustment Logged', 'Transaction committed to immutable ledger with audit trail.');
      setIsAdjustModalOpen(false);
      setReason('');
      setDeveloperId('');
      await fetchLedger();
    } catch (err: any) {
      addToast('error', 'Adjustment Failed', err.message || 'Unable to execute adjustment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Credits Ledger Management</h1>
          <p className="text-xs text-muted mt-1">
            Audit system-wide credit balances. Strict ledger constraints require documented reasons for all manual adjustments.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={fetchLedger}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIsAdjustModalOpen(true)}>
            Execute Admin Adjustment
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Master Ledger Transactions</CardTitle>
              <CardDescription>All credit creations, deductions, and refunds across the platform</CardDescription>
            </div>
            <span className="text-xs font-mono text-status-success bg-status-success/10 px-2 py-0.5 rounded border border-status-success/30 flex items-center space-x-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Double-Entry Validated</span>
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted">Loading master financial ledger...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No transactions in the ledger yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Developer</TableHead>
                  <TableHead>Project / Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-xs">
                      <span className="bg-surface-elevated px-2 py-0.5 rounded border border-border text-foreground font-semibold text-[10px]">
                        {tx.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-semibold text-foreground block">{tx.developer_name}</span>
                      <span className="text-[10px] text-muted font-mono">@{tx.developer_username}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {tx.project_number || tx.reference_id}
                    </TableCell>
                    <TableCell className="text-xs text-muted max-w-xs truncate">{tx.description}</TableCell>
                    <TableCell
                      className={`font-mono text-xs font-bold text-right ${
                        tx.amount > 0 ? 'text-status-success' : 'text-status-danger'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Cr
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground font-bold text-right">
                      {tx.balance_after} Cr
                    </TableCell>
                    <TableCell className="text-xs text-muted text-right font-mono">
                      {new Date(tx.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Manual Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Execute Admin Credit Adjustment"
        description="Requires mandatory audit reason. This will record a permanent ledger entry."
      >
        <form onSubmit={handleAdjust} className="space-y-4">
          <Input
            label="Developer UUID"
            placeholder="UUID of target developer account"
            value={developerId}
            onChange={(e) => setDeveloperId(e.target.value)}
            required
          />
          <Input
            label="Credit Amount Change (+/-)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <Input
            label="Mandatory Audit Justification"
            placeholder="e.g. Executive grant by CEO Ritesh Lingamallu / MD M. Shiva Gopi"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Commit Ledger Transaction
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
