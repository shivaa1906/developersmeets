'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import {
  Plus,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  User,
  History,
  Wallet,
} from 'lucide-react';

interface LedgerRow {
  id: string;
  user_id?: string;
  user_uid?: string;
  user_email?: string;
  user_role?: string;
  developer_id?: string;
  developer_username?: string;
  developer_name?: string;
  project_title?: string;
  project_number?: string;
  type: string;
  amount: number;
  balance_before?: number;
  balance_after: number;
  reference_id: string;
  reason?: string;
  description: string;
  performed_by_uid?: string;
  performed_by_email?: string;
  performed_by_role?: string;
  created_at: string;
}

interface AccountRow {
  account_id: string;
  user_id: string;
  user_uid: string;
  user_public_uid?: string;
  email: string;
  role: string;
  user_status: string;
  developer_id?: string;
  developer_username?: string;
  developer_name?: string;
  company_name?: string;
  balance: number;
  currency: string;
  transaction_count: number;
  updated_at: string;
}

export default function AdminCreditsPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'ledger' | 'accounts'>('ledger');

  // Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = React.useState(false);
  const [actionType, setActionType] = React.useState<'GRANT' | 'REMOVE' | 'BULK_GRANT' | 'BULK_REMOVE'>('GRANT');
  const [targetScope, setTargetScope] = React.useState<'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'ALL'>('ALL_DEVELOPERS');
  const [targetIdentifier, setTargetIdentifier] = React.useState('');
  const [amount, setAmount] = React.useState('10');
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Data State
  const [transactions, setTransactions] = React.useState<LedgerRow[]>([]);
  const [accounts, setAccounts] = React.useState<AccountRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');

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

  const fetchAccounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ accounts: AccountRow[] }>('/admin/credits/accounts');
      setAccounts(res.accounts || []);
    } catch (_err) {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === 'ledger') {
      fetchLedger();
    } else {
      fetchAccounts();
    }
  }, [activeTab, fetchLedger, fetchAccounts]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      addToast('error', 'Reason Required', 'Every admin adjustment must state an auditable reason (at least 5 characters).');
      return;
    }

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      addToast('error', 'Invalid Amount', 'Credit amount must be a positive integer greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (actionType === 'GRANT') {
        await apiClient.post('/admin/credits/grant', {
          target: targetIdentifier,
          amount: numAmount,
          reason,
        });
        addToast('success', 'Credits Granted', `Successfully granted ${numAmount} credits with immutable ledger audit trail.`);
      } else if (actionType === 'REMOVE') {
        await apiClient.post('/admin/credits/remove', {
          target: targetIdentifier,
          amount: numAmount,
          reason,
        });
        addToast('success', 'Credits Deducted', `Successfully deducted ${numAmount} credits without negative balance risk.`);
      } else if (actionType === 'BULK_GRANT') {
        const bulkRes = await apiClient.post<{ count: number; totalCredits: number }>('/admin/credits/bulk-grant', {
          targetScope,
          amount: numAmount,
          reason,
        });
        addToast('success', 'Bulk Grant Completed', `Granted ${bulkRes.totalCredits} credits across ${bulkRes.count} eligible accounts.`);
      } else if (actionType === 'BULK_REMOVE') {
        const bulkRes = await apiClient.post<{ count: number; totalCredits: number }>('/admin/credits/bulk-remove', {
          targetScope,
          amount: numAmount,
          reason,
          allowPartial: true,
        });
        addToast('success', 'Bulk Removal Completed', `Deducted ${bulkRes.totalCredits} credits across ${bulkRes.count} eligible accounts.`);
      }

      setIsAdjustModalOpen(false);
      setReason('');
      setTargetIdentifier('');
      if (activeTab === 'ledger') {
        await fetchLedger();
      } else {
        await fetchAccounts();
      }
    } catch (err: any) {
      addToast('error', 'Adjustment Failed', err.message || 'Unable to execute credit adjustment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAdjustForUser = (user: AccountRow, defaultAction: 'GRANT' | 'REMOVE') => {
    setActionType(defaultAction);
    setTargetIdentifier(user.user_public_uid || user.user_uid || user.user_id);
    setIsAdjustModalOpen(true);
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      tx.reference_id?.toLowerCase().includes(q) ||
      tx.type?.toLowerCase().includes(q) ||
      tx.description?.toLowerCase().includes(q) ||
      tx.reason?.toLowerCase().includes(q) ||
      tx.developer_name?.toLowerCase().includes(q) ||
      tx.developer_username?.toLowerCase().includes(q) ||
      tx.user_email?.toLowerCase().includes(q) ||
      tx.user_uid?.toLowerCase().includes(q) ||
      tx.performed_by_email?.toLowerCase().includes(q)
    );
  });

  const filteredAccounts = accounts.filter((acc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      acc.email?.toLowerCase().includes(q) ||
      acc.user_uid?.toLowerCase().includes(q) ||
      acc.developer_username?.toLowerCase().includes(q) ||
      acc.developer_name?.toLowerCase().includes(q) ||
      acc.company_name?.toLowerCase().includes(q) ||
      acc.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Global Credits Ledger Management</h1>
          <p className="text-xs text-muted mt-1">
            Immutable double-entry transaction ledger with mandatory justification, non-negative balance protection, and performer tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (activeTab === 'ledger' ? fetchLedger() : fetchAccounts())}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setActionType('GRANT');
              setIsAdjustModalOpen(true);
            }}
          >
            Adjust Credits
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border space-x-6">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 text-sm font-medium flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Master Financial Ledger</span>
          <span className="text-xs bg-surface-elevated px-2 py-0.5 rounded-full font-mono">
            {transactions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('accounts')}
          className={`pb-3 text-sm font-medium flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === 'accounts'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Wallet className="h-4 w-4" />
          <span>User Credit Wallets</span>
          <span className="text-xs bg-surface-elevated px-2 py-0.5 rounded-full font-mono">
            {accounts.length}
          </span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-3">
        <Input
          placeholder={
            activeTab === 'ledger'
              ? 'Filter transactions by reference, email, UID, type, reason, or performer...'
              : 'Filter accounts by email, 16-char UID, role, or company...'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {activeTab === 'ledger' ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Master Ledger Transactions</CardTitle>
                <CardDescription>
                  Immutable history of grants, deductions, purchases, and refunds with audit attribution
                </CardDescription>
              </div>
              <span className="text-xs font-mono text-status-success bg-status-success/10 px-2 py-0.5 rounded border border-status-success/30 flex items-center space-x-1">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Auditable Ledger</span>
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-xs text-muted">Loading master financial ledger...</div>
            ) : filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">No transactions found matching your criteria.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Target Identity</TableHead>
                      <TableHead>Reference / Project</TableHead>
                      <TableHead>Reason / Description</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead className="text-right">Delta</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">
                          <span
                            className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                              tx.type.includes('GRANT') || tx.type === 'PURCHASE'
                                ? 'bg-status-success/10 text-status-success border border-status-success/30'
                                : tx.type.includes('REMOVAL') || tx.type.includes('CLAIM')
                                ? 'bg-status-danger/10 text-status-danger border border-status-danger/30'
                                : 'bg-surface-elevated text-foreground border border-border'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-semibold text-foreground block">
                            {tx.developer_name || tx.user_email || 'User'}
                          </span>
                          <span className="text-[10px] text-muted font-mono block">
                            {tx.user_uid ? `UID: ${tx.user_uid}` : tx.developer_username ? `@${tx.developer_username}` : ''}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted">
                          {tx.project_number || tx.reference_id}
                        </TableCell>
                        <TableCell className="text-xs text-muted max-w-xs truncate">
                          {tx.reason || tx.description}
                        </TableCell>
                        <TableCell>
                          {tx.performed_by_email ? (
                            <div>
                              <span className="text-xs text-foreground block">{tx.performed_by_email}</span>
                              <span className="text-[10px] font-mono text-muted">{tx.performed_by_role}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">System Automated</span>
                          )}
                        </TableCell>
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
                        <TableCell className="text-xs text-muted text-right font-mono whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">User Credit Accounts</CardTitle>
                <CardDescription>
                  Real-time balances across developers, clients, and platform participants
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-xs text-muted">Loading user credit accounts...</div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">No credit accounts found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User / Entity</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Public UID</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Last Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((acc) => (
                      <TableRow key={acc.account_id}>
                        <TableCell>
                          <span className="text-xs font-semibold text-foreground block">
                            {acc.developer_name || acc.company_name || acc.email}
                          </span>
                          <span className="text-[10px] text-muted font-mono">{acc.email}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-elevated border border-border">
                            {acc.role}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-accent-primary">
                          {acc.user_public_uid || acc.user_uid || '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-right text-foreground">
                          {acc.balance} {acc.currency || 'Cr'}
                        </TableCell>
                        <TableCell className="text-xs text-muted text-right font-mono">
                          {acc.transaction_count}
                        </TableCell>
                        <TableCell className="text-xs text-muted text-right font-mono whitespace-nowrap">
                          {acc.updated_at ? new Date(acc.updated_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-right space-x-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openAdjustForUser(acc, 'GRANT')}
                            className="text-xs h-7 px-2"
                            leftIcon={<ArrowUpRight className="h-3 w-3 text-status-success" />}
                          >
                            Grant
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAdjustForUser(acc, 'REMOVE')}
                            className="text-xs h-7 px-2"
                            leftIcon={<ArrowDownLeft className="h-3 w-3 text-status-danger" />}
                          >
                            Deduct
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin Credit Adjustment & Bulk Operations Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Administrative Credit Adjustment"
        description="Every manual adjustment requires an auditable justification reason and commits to the permanent immutable ledger."
      >
        <form onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Adjustment Action</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setActionType('GRANT')}
                className={`py-2 px-3 text-xs rounded border text-left flex items-center space-x-2 transition-all ${
                  actionType === 'GRANT'
                    ? 'border-status-success bg-status-success/10 text-status-success font-semibold'
                    : 'border-border text-muted hover:border-foreground/30'
                }`}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>Give Credits (1 User)</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('REMOVE')}
                className={`py-2 px-3 text-xs rounded border text-left flex items-center space-x-2 transition-all ${
                  actionType === 'REMOVE'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger font-semibold'
                    : 'border-border text-muted hover:border-foreground/30'
                }`}
              >
                <ArrowDownLeft className="h-3.5 w-3.5" />
                <span>Remove Credits (1 User)</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('BULK_GRANT')}
                className={`py-2 px-3 text-xs rounded border text-left flex items-center space-x-2 transition-all ${
                  actionType === 'BULK_GRANT'
                    ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-semibold'
                    : 'border-border text-muted hover:border-foreground/30'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Bulk Grant (Multiple/All)</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType('BULK_REMOVE')}
                className={`py-2 px-3 text-xs rounded border text-left flex items-center space-x-2 transition-all ${
                  actionType === 'BULK_REMOVE'
                    ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-semibold'
                    : 'border-border text-muted hover:border-foreground/30'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Bulk Deduct (Multiple/All)</span>
              </button>
            </div>
          </div>

          {actionType === 'GRANT' || actionType === 'REMOVE' ? (
            <Input
              label="Target User Identifier"
              placeholder="Enter User UUID, 16-character Public UID, Developer UUID, or Email"
              value={targetIdentifier}
              onChange={(e) => setTargetIdentifier(e.target.value)}
              required
            />
          ) : (
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Target Group</label>
              <select
                value={targetScope}
                onChange={(e) => setTargetScope(e.target.value as any)}
                className="w-full bg-surface-elevated border border-border text-foreground text-xs rounded px-3 py-2 outline-none focus:border-accent-primary"
              >
                <option value="ALL_DEVELOPERS">All Verified Active Developers</option>
                <option value="ALL_CLIENTS">All Registered Active Clients</option>
                <option value="ALL">All Eligible Platform Users</option>
              </select>
            </div>
          )}

          <Input
            label={actionType.includes('REMOVE') ? 'Credit Amount to Deduct' : 'Credit Amount to Grant'}
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Mandatory Audit Justification Reason <span className="text-status-danger">*</span>
            </label>
            <textarea
              placeholder="State clear business justification (e.g. Compensation for platform downtime, Hackathon bonus, or Discretionary milestone award)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full bg-surface-elevated border border-border text-foreground text-xs rounded px-3 py-2 outline-none focus:border-accent-primary resize-none"
            />
            <p className="text-[10px] text-muted mt-0.5">
              Minimum 5 characters. Stored permanently in both credit ledger and executive audit logs.
            </p>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isSubmitting}
              className={actionType.includes('REMOVE') ? 'bg-status-danger hover:bg-status-danger/90' : ''}
            >
              {actionType === 'GRANT'
                ? 'Grant Credits'
                : actionType === 'REMOVE'
                ? 'Deduct Credits'
                : actionType === 'BULK_GRANT'
                ? 'Execute Bulk Grant'
                : 'Execute Bulk Deduct'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
