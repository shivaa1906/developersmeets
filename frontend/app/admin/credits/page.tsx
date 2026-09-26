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
  Search,
  CheckCircle2,
  AlertCircle,
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

interface UserSearchResult {
  id: string;
  uid: string;
  public_uid?: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: string;
  is_suspended: boolean;
  current_balance: number;
  currency: string;
  developer_id?: string;
  client_id?: string;
}

export default function AdminCreditsPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'ledger' | 'accounts'>('ledger');

  // Dedicated "Give Credits" (Phase 7) Modal State
  const [isGiveCreditsModalOpen, setIsGiveCreditsModalOpen] = React.useState(false);
  const [searchUserQuery, setSearchUserQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<UserSearchResult[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserSearchResult | null>(null);
  const [creditsToAdd, setCreditsToAdd] = React.useState('5');
  const [grantReason, setGrantReason] = React.useState('');
  const [isGrantingCredits, setIsGrantingCredits] = React.useState(false);

  // General / Bulk Adjustment Modal State
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

  // Live User Search for Give Credits
  const fetchSearchUsers = React.useCallback(async (queryStr: string) => {
    setIsSearchingUsers(true);
    try {
      const endpoint = queryStr.trim().length > 0
        ? `/admin/credits/search-users?q=${encodeURIComponent(queryStr.trim())}`
        : '/admin/credits/search-users';
      const res = await apiClient.get<{ users: UserSearchResult[] }>(endpoint);
      setSearchResults(res.users || []);
    } catch (_err) {
      setSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  }, []);

  React.useEffect(() => {
    if (isGiveCreditsModalOpen && !selectedUser) {
      const timer = setTimeout(() => {
        fetchSearchUsers(searchUserQuery);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [searchUserQuery, isGiveCreditsModalOpen, selectedUser, fetchSearchUsers]);

  const openGiveCreditsModal = (user?: UserSearchResult | AccountRow) => {
    if (user) {
      const candidate: UserSearchResult = {
        id: (user as any).user_id || (user as any).id,
        uid: (user as any).user_uid || (user as any).uid,
        public_uid: (user as any).user_public_uid || (user as any).public_uid,
        name: (user as any).developer_name || (user as any).name || (user as any).company_name || (user as any).email || 'User',
        email: (user as any).user_email || (user as any).email,
        username: (user as any).developer_username || (user as any).username || '',
        role: (user as any).user_role || (user as any).role || 'DEVELOPER',
        status: (user as any).user_status || (user as any).status || 'ACTIVE',
        is_suspended: (user as any).is_suspended || false,
        current_balance: (user as any).balance !== undefined ? Number((user as any).balance) : (Number((user as any).current_balance) || 0),
        currency: user.currency || 'INR',
      };
      setSelectedUser(candidate);
    } else {
      setSelectedUser(null);
      fetchSearchUsers('');
    }
    setSearchUserQuery('');
    setCreditsToAdd('5');
    setGrantReason('');
    setIsGiveCreditsModalOpen(true);
  };

  const handleGiveCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) {
      addToast('error', 'Select User', 'Please select a platform user to grant credits to.');
      return;
    }

    const numCredits = Number(creditsToAdd);
    if (!Number.isInteger(numCredits) || numCredits <= 0 || numCredits > 1_000_000) {
      addToast('error', 'Invalid Amount', 'Credits to add must be a positive integer between 1 and 1,000,000.');
      return;
    }

    if (!grantReason.trim() || grantReason.trim().length < 5) {
      addToast('error', 'Reason Required', 'Mandatory justification reason (at least 5 characters) required.');
      return;
    }

    setIsGrantingCredits(true);
    try {
      const res = await apiClient.post<any>('/admin/credits/grant', {
        target: selectedUser.uid || selectedUser.id,
        amount: numCredits,
        reason: grantReason.trim(),
      });

      const newBalance = res.newBalance !== undefined ? res.newBalance : res.balance;
      addToast(
        'success',
        'Credits Granted',
        `Successfully granted +${numCredits} credits to ${selectedUser.name}. New balance: ${newBalance} credits.`
      );
      setIsGiveCreditsModalOpen(false);
      setSelectedUser(null);
      setGrantReason('');

      if (activeTab === 'ledger') {
        await fetchLedger();
      } else {
        await fetchAccounts();
      }
    } catch (err: any) {
      addToast('error', 'Credit Grant Failed', err.message || 'Unable to grant credits.');
    } finally {
      setIsGrantingCredits(false);
    }
  };

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
    if (defaultAction === 'GRANT') {
      openGiveCreditsModal(user);
    } else {
      setActionType(defaultAction);
      setTargetIdentifier(user.user_public_uid || user.user_uid || user.user_id);
      setIsAdjustModalOpen(true);
    }
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
          <div className="flex items-center space-x-2 text-xs text-muted mb-1">
            <span>Admin</span>
            <span>&rarr;</span>
            <span className="text-foreground font-medium">Credits &amp; Wallet</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Credits &amp; Wallet Management</h1>
          <p className="text-xs text-muted mt-1">
            Allocate user credits, search users by UID or identity, and inspect double-entry immutable transaction ledgers.
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
            variant="secondary"
            leftIcon={<Users className="h-3.5 w-3.5" />}
            onClick={() => {
              setActionType('BULK_GRANT');
              setIsAdjustModalOpen(true);
            }}
          >
            Bulk Adjustments
          </Button>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => openGiveCreditsModal()}
            className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold"
          >
            Give Credits
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
                          {tx.reference_id}
                          {tx.project_number && (
                            <span className="block text-[10px] text-accent-primary">{tx.project_number}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-foreground max-w-xs">
                          <div className="truncate font-medium">{tx.reason || '—'}</div>
                          <div className="text-[10px] text-muted truncate">{tx.description}</div>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted">
                          {tx.performed_by_email ? (
                            <div>
                              <span className="text-foreground block">{tx.performed_by_email}</span>
                              <span className="text-[10px] text-accent-primary uppercase font-mono">
                                {tx.performed_by_role || 'ADMIN'}
                              </span>
                            </div>
                          ) : (
                            'SYSTEM / GATEWAY'
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold">
                          <span className={tx.amount > 0 ? 'text-status-success' : 'text-status-danger'}>
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                          {tx.balance_after}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[10px] text-muted whitespace-nowrap">
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
                <CardTitle className="text-base">User Credit Accounts &amp; Wallets</CardTitle>
                <CardDescription>
                  Real-time wallet balances, user identity mapping, and direct single-user credit allocations
                </CardDescription>
              </div>
              <span className="text-xs font-mono text-accent-primary bg-accent-primary/10 px-2 py-0.5 rounded border border-accent-primary/30">
                Live Wallets: {filteredAccounts.length}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-xs text-muted">Loading user credit accounts...</div>
            ) : filteredAccounts.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">No accounts found.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User / Identity</TableHead>
                      <TableHead>Public 16-Char UID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Tx Count</TableHead>
                      <TableHead className="text-right">Last Updated</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((acc) => (
                      <TableRow key={acc.account_id || acc.user_id}>
                        <TableCell>
                          <span className="text-xs font-semibold text-foreground block">
                            {acc.developer_name || acc.company_name || acc.email}
                          </span>
                          <span className="text-[10px] text-muted block font-mono">
                            {acc.developer_username ? `@${acc.developer_username}` : acc.email}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-accent-primary">
                          {acc.user_uid}
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] font-mono uppercase bg-surface-elevated px-2 py-0.5 rounded border border-border text-foreground">
                            {acc.role}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                              acc.user_status === 'ACTIVE'
                                ? 'bg-status-success/10 text-status-success border-status-success/30'
                                : 'bg-status-warning/10 text-status-warning border-status-warning/30'
                            }`}
                          >
                            {acc.user_status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-status-success">
                          {acc.balance} Credits
                        </TableCell>
                        <TableCell className="text-xs font-mono text-right text-muted">
                          {acc.transaction_count}
                        </TableCell>
                        <TableCell className="text-xs text-muted text-right font-mono whitespace-nowrap">
                          {acc.updated_at ? new Date(acc.updated_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell className="text-right space-x-1 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openGiveCreditsModal(acc)}
                            className="text-xs h-7 px-2 font-medium"
                            leftIcon={<ArrowUpRight className="h-3 w-3 text-status-success" />}
                          >
                            Give Credits
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

      {/* PHASE 7: DEDICATED GIVE CREDITS MODAL (User Search & Grant) */}
      <Modal
        isOpen={isGiveCreditsModalOpen}
        onClose={() => {
          setIsGiveCreditsModalOpen(false);
          setSelectedUser(null);
        }}
        title="Give Credits"
        description="Search platform users by UID, Name, Email, or Username to grant credits atomically to their account."
      >
        {!selectedUser ? (
          /* Step 1: User Search */
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                Search User (UID, Name, Email, or Username)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted pointer-events-none" />
                <Input
                  placeholder="e.g. A7kP92xLmQ4vT8Nz, Ritesh, shiva@nexus.dev..."
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted mt-1">
                Real-time search across all platform accounts. Authentication secrets are never exposed.
              </p>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {isSearchingUsers ? (
                <div className="p-6 text-center text-xs text-muted">Searching user directory...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted border border-border/60 rounded-lg">
                  No platform users found matching your search.
                </div>
              ) : (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="p-3 bg-surface-elevated/60 hover:bg-surface-elevated border border-border hover:border-accent-primary rounded-lg cursor-pointer transition-all flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-foreground truncate">{user.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-base border border-border text-foreground">
                          UID: {user.uid}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted truncate mt-0.5">
                        <span>{user.email}</span>
                        {user.username && <span> &bull; @{user.username}</span>}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-bold text-status-success font-mono">
                          {user.current_balance} Credits
                        </div>
                        <div className="flex items-center justify-end space-x-1 mt-0.5">
                          <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-accent-primary/10 text-accent-primary">
                            {user.role}
                          </span>
                          <span
                            className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded ${
                              user.status === 'ACTIVE'
                                ? 'bg-status-success/10 text-status-success'
                                : 'bg-status-danger/10 text-status-danger'
                            }`}
                          >
                            {user.status}
                          </span>
                        </div>
                      </div>

                      <Button size="sm" variant="secondary" className="h-7 text-xs px-2 pointer-events-none">
                        Select
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsGiveCreditsModalOpen(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* Step 2: Grant Modal (Exact specification layout) */
          <form onSubmit={handleGiveCredits} className="space-y-4">
            <div className="bg-surface-elevated/70 border border-border/80 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Target User</span>
                  <div className="text-sm font-bold text-foreground mt-0.5">{selectedUser.name}</div>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs font-mono font-bold bg-surface-base px-2 py-0.5 rounded border border-border text-foreground">
                      UID: {selectedUser.uid}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                      {selectedUser.role}
                    </span>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                        selectedUser.status === 'ACTIVE'
                          ? 'bg-status-success/10 text-status-success border border-status-success/20'
                          : 'bg-status-danger/10 text-status-danger border border-status-danger/20'
                      }`}
                    >
                      {selectedUser.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-1">{selectedUser.email}</p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                  className="text-xs h-7 px-2"
                >
                  Change User
                </Button>
              </div>

              <div className="border-t border-border/60 pt-2 flex items-center justify-between">
                <span className="text-xs text-muted font-medium">Current Balance:</span>
                <span className="text-sm font-bold text-status-success font-mono">
                  {selectedUser.current_balance} Credits
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Credits to Add <span className="text-status-danger">*</span>
              </label>
              <Input
                type="number"
                min="1"
                max="1000000"
                step="1"
                placeholder="5"
                value={creditsToAdd}
                onChange={(e) => setCreditsToAdd(e.target.value)}
                required
                autoFocus
              />
              <p className="text-[10px] text-muted mt-0.5">
                Must be a positive integer between 1 and 1,000,000.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Reason <span className="text-status-danger">*</span>
              </label>
              <textarea
                placeholder="Promotional credit for approved project..."
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                rows={3}
                required
                className="w-full bg-surface-elevated border border-border text-foreground text-xs rounded px-3 py-2 outline-none focus:border-accent-primary resize-none font-sans"
              />
              <div className="flex justify-between items-center text-[10px] text-muted mt-0.5">
                <span>Stored permanently in immutable double-entry ledger &amp; audit log.</span>
                <span className={grantReason.trim().length >= 5 ? 'text-status-success font-mono' : 'text-status-danger font-mono'}>
                  {grantReason.trim().length}/5 min chars
                </span>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsGiveCreditsModalOpen(false);
                  setSelectedUser(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                isLoading={isGrantingCredits}
                leftIcon={<ArrowUpRight className="h-4 w-4" />}
                className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold"
              >
                Give Credits
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Admin Credit Adjustment & Bulk Operations Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Administrative Credit Adjustment &amp; Bulk Operations"
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
