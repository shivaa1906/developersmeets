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
  SlidersHorizontal,
  CheckSquare,
  Clock,
  Layers,
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

interface BulkPreviewData {
  targetScope: string;
  recipientCount: number;
  amountPerUser: number;
  totalCredits: number;
  reason: string;
  sampleRecipients: Array<{
    id: string;
    uid: string;
    name: string;
    email: string;
    role: string;
    currentBalance: number;
  }>;
  breakdown: {
    developers: number;
    clients: number;
    other: number;
  };
}

interface BulkOperationRow {
  id: string;
  operation_id: string;
  performed_by: string;
  performed_by_uid?: string;
  performed_by_email?: string;
  performed_by_role?: string;
  target_scope: string;
  amount_per_user: number;
  recipient_count: number;
  total_credits: number;
  reason: string;
  status: string;
  filters?: any;
  created_at: string;
  completed_at?: string;
}

export default function AdminCreditsPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = React.useState<'ledger' | 'accounts' | 'bulk_operations'>('ledger');

  // Unified "Give Credits" Workflow (Phase 7 Single-User & Phase 8 Bulk-Grant)
  const [isGiveCreditsModalOpen, setIsGiveCreditsModalOpen] = React.useState(false);
  const [audience, setAudience] = React.useState<
    'SINGLE' | 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'FILTERED'
  >('SINGLE');

  // Single User State
  const [searchUserQuery, setSearchUserQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<UserSearchResult[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<UserSearchResult | null>(null);

  // Selected Users State
  const [selectedUsersList, setSelectedUsersList] = React.useState<UserSearchResult[]>([]);

  // Filtered Users State
  const [filterRole, setFilterRole] = React.useState<'ALL' | 'DEVELOPER' | 'CLIENT'>('ALL');
  const [filterVerification, setFilterVerification] = React.useState<'ALL' | 'VERIFIED' | 'PENDING'>('ALL');
  const [filterMinExp, setFilterMinExp] = React.useState('0');

  // Common Grant Parameters
  const [creditsToAdd, setCreditsToAdd] = React.useState('5');
  const [grantReason, setGrantReason] = React.useState('');
  const [isConfirmed, setIsConfirmed] = React.useState(false);
  const [isGrantingCredits, setIsGrantingCredits] = React.useState(false);

  // Bulk Preview State
  const [bulkPreview, setBulkPreview] = React.useState<BulkPreviewData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);

  // Dedicated "Remove Credits" Workflow (Phase 9 Single-User & Bulk Removal)
  const [isRemoveCreditsModalOpen, setIsRemoveCreditsModalOpen] = React.useState(false);
  const [removeAudience, setRemoveAudience] = React.useState<
    'SINGLE' | 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS' | 'SELECTED' | 'FILTERED'
  >('SINGLE');

  // Single User Removal State
  const [searchRemoveUserQuery, setSearchRemoveUserQuery] = React.useState('');
  const [searchRemoveResults, setSearchRemoveResults] = React.useState<UserSearchResult[]>([]);
  const [isSearchingRemoveUsers, setIsSearchingRemoveUsers] = React.useState(false);
  const [selectedRemoveUser, setSelectedRemoveUser] = React.useState<UserSearchResult | null>(null);

  // Selected Users Removal State
  const [selectedRemoveUsersList, setSelectedRemoveUsersList] = React.useState<UserSearchResult[]>([]);

  // Filtered Users Removal State
  const [filterRemoveRole, setFilterRemoveRole] = React.useState<'ALL' | 'DEVELOPER' | 'CLIENT'>('ALL');
  const [filterRemoveVerification, setFilterRemoveVerification] = React.useState<'ALL' | 'VERIFIED' | 'PENDING'>('ALL');
  const [filterRemoveMinExp, setFilterRemoveMinExp] = React.useState('0');

  // Removal Parameters
  const [creditsToRemove, setCreditsToRemove] = React.useState('3');
  const [removeReason, setRemoveReason] = React.useState('');
  const [isRemoveConfirmed, setIsRemoveConfirmed] = React.useState(false);
  const [isRemovingCredits, setIsRemovingCredits] = React.useState(false);

  // Bulk Removal Preview State
  const [bulkRemovePreview, setBulkRemovePreview] = React.useState<{
    targetScope: string;
    recipientCount: number;
    amountPerUser: number;
    estimatedTotalCredits: number;
    reason: string;
    sampleRecipients: Array<{
      id: string;
      uid: string;
      name: string;
      email: string;
      role: string;
      currentBalance: number;
      creditsToDeduct: number;
    }>;
    breakdown: {
      developers: number;
      clients: number;
      other: number;
    };
  } | null>(null);
  const [isRemovePreviewLoading, setIsRemovePreviewLoading] = React.useState(false);

  // Data State
  const [transactions, setTransactions] = React.useState<LedgerRow[]>([]);
  const [accounts, setAccounts] = React.useState<AccountRow[]>([]);
  const [bulkOperations, setBulkOperations] = React.useState<BulkOperationRow[]>([]);
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

  const fetchBulkOperations = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ operations: BulkOperationRow[] }>('/admin/credits/bulk-operations');
      setBulkOperations(res.operations || []);
    } catch (_err) {
      setBulkOperations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab === 'ledger') {
      fetchLedger();
    } else if (activeTab === 'accounts') {
      fetchAccounts();
    } else if (activeTab === 'bulk_operations') {
      fetchBulkOperations();
    }
  }, [activeTab, fetchLedger, fetchAccounts, fetchBulkOperations]);

  // Live User Search for Single and Selected User Workflows
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
    if (isGiveCreditsModalOpen && (audience === 'SINGLE' || audience === 'SELECTED')) {
      const timer = setTimeout(() => {
        fetchSearchUsers(searchUserQuery);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [searchUserQuery, isGiveCreditsModalOpen, audience, fetchSearchUsers]);

  // Bulk Preview Fetcher
  const updateBulkPreview = React.useCallback(async () => {
    if (audience === 'SINGLE') {
      setBulkPreview(null);
      return;
    }

    const numCredits = Number(creditsToAdd);
    if (!Number.isInteger(numCredits) || numCredits <= 0) return;

    setIsPreviewLoading(true);
    try {
      const payload: any = {
        targetScope: audience,
        amount: numCredits,
        reason: grantReason.trim() || 'Credit allocation preview',
      };

      if (audience === 'SELECTED') {
        payload.userIds = selectedUsersList.map((u) => u.id);
      } else if (audience === 'FILTERED') {
        payload.filters = {
          role: filterRole,
          verificationStatus: filterVerification !== 'ALL' ? filterVerification : undefined,
          minExperience: Number(filterMinExp) > 0 ? Number(filterMinExp) : undefined,
        };
      }

      const res = await apiClient.post<BulkPreviewData>('/admin/credits/bulk-preview', payload);
      setBulkPreview(res);
    } catch (_err) {
      setBulkPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [audience, creditsToAdd, grantReason, selectedUsersList, filterRole, filterVerification, filterMinExp]);

  React.useEffect(() => {
    if (isGiveCreditsModalOpen && audience !== 'SINGLE') {
      const timer = setTimeout(() => {
        updateBulkPreview();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isGiveCreditsModalOpen, audience, creditsToAdd, selectedUsersList, filterRole, filterVerification, filterMinExp, updateBulkPreview]);

  // Live User Search for Removal Workflows
  const fetchSearchRemoveUsers = React.useCallback(async (queryStr: string) => {
    setIsSearchingRemoveUsers(true);
    try {
      const endpoint = queryStr.trim().length > 0
        ? `/admin/credits/search-users?q=${encodeURIComponent(queryStr.trim())}`
        : '/admin/credits/search-users';
      const res = await apiClient.get<{ users: UserSearchResult[] }>(endpoint);
      setSearchRemoveResults(res.users || []);
    } catch (_err) {
      setSearchRemoveResults([]);
    } finally {
      setIsSearchingRemoveUsers(false);
    }
  }, []);

  React.useEffect(() => {
    if (isRemoveCreditsModalOpen && (removeAudience === 'SINGLE' || removeAudience === 'SELECTED')) {
      const timer = setTimeout(() => {
        fetchSearchRemoveUsers(searchRemoveUserQuery);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [searchRemoveUserQuery, isRemoveCreditsModalOpen, removeAudience, fetchSearchRemoveUsers]);

  // Bulk Removal Preview Fetcher
  const updateBulkRemovePreview = React.useCallback(async () => {
    if (removeAudience === 'SINGLE') {
      setBulkRemovePreview(null);
      return;
    }

    const numCredits = Number(creditsToRemove);
    if (!Number.isInteger(numCredits) || numCredits <= 0) return;

    setIsRemovePreviewLoading(true);
    try {
      const payload: any = {
        targetScope: removeAudience,
        amount: numCredits,
        reason: removeReason.trim() || 'Credit removal preview',
        allowPartial: true,
      };

      if (removeAudience === 'SELECTED') {
        payload.userIds = selectedRemoveUsersList.map((u) => u.id);
      } else if (removeAudience === 'FILTERED') {
        payload.filters = {
          role: filterRemoveRole,
          verificationStatus: filterRemoveVerification !== 'ALL' ? filterRemoveVerification : undefined,
          minExperience: Number(filterRemoveMinExp) > 0 ? Number(filterRemoveMinExp) : undefined,
        };
      }

      const res = await apiClient.post<any>('/admin/credits/bulk-remove-preview', payload);
      setBulkRemovePreview(res);
    } catch (_err) {
      setBulkRemovePreview(null);
    } finally {
      setIsRemovePreviewLoading(false);
    }
  }, [removeAudience, creditsToRemove, removeReason, selectedRemoveUsersList, filterRemoveRole, filterRemoveVerification, filterRemoveMinExp]);

  React.useEffect(() => {
    if (isRemoveCreditsModalOpen && removeAudience !== 'SINGLE') {
      const timer = setTimeout(() => {
        updateBulkRemovePreview();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isRemoveCreditsModalOpen, removeAudience, creditsToRemove, selectedRemoveUsersList, filterRemoveRole, filterRemoveVerification, filterRemoveMinExp, updateBulkRemovePreview]);

  const openGiveCreditsModal = (user?: UserSearchResult | AccountRow, initialAudience?: 'SINGLE' | 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS') => {
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
      setAudience('SINGLE');
    } else {
      setSelectedUser(null);
      setAudience(initialAudience || 'SINGLE');
      fetchSearchUsers('');
    }

    setSearchUserQuery('');
    setSelectedUsersList([]);
    setCreditsToAdd('5');
    setGrantReason('');
    setIsConfirmed(false);
    setBulkPreview(null);
    setIsGiveCreditsModalOpen(true);
  };

  const handleGiveCreditsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numCredits = Number(creditsToAdd);
    if (!Number.isInteger(numCredits) || numCredits <= 0 || numCredits > 1_000_000) {
      addToast('error', 'Invalid Amount', 'Credits must be a positive integer between 1 and 1,000,000.');
      return;
    }

    if (!grantReason.trim() || grantReason.trim().length < 5) {
      addToast('error', 'Reason Required', 'Mandatory justification reason (at least 5 characters) required.');
      return;
    }

    setIsGrantingCredits(true);

    try {
      if (audience === 'SINGLE') {
        if (!selectedUser) {
          addToast('error', 'Select User', 'Please select a platform user to grant credits.');
          setIsGrantingCredits(false);
          return;
        }

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
      } else {
        // Bulk Workflow Execution (Requirement 2 & 4)
        if (!isConfirmed) {
          addToast('error', 'Confirmation Required', 'Explicit confirmation is required before executing a bulk credit grant.');
          setIsGrantingCredits(false);
          return;
        }

        const payload: any = {
          targetScope: audience,
          amount: numCredits,
          reason: grantReason.trim(),
        };

        if (audience === 'SELECTED') {
          if (selectedUsersList.length === 0) {
            addToast('error', 'No Users Selected', 'Please select at least one user for the Selected Users audience.');
            setIsGrantingCredits(false);
            return;
          }
          payload.userIds = selectedUsersList.map((u) => u.id);
        } else if (audience === 'FILTERED') {
          payload.filters = {
            role: filterRole,
            verificationStatus: filterVerification !== 'ALL' ? filterVerification : undefined,
            minExperience: Number(filterMinExp) > 0 ? Number(filterMinExp) : undefined,
          };
        }

        const res = await apiClient.post<any>('/admin/credits/bulk-grant', payload);

        addToast(
          'success',
          'Bulk Credit Grant Completed',
          `Granted ${res.totalCredits} credits across ${res.recipientCount} eligible accounts. Ref: ${res.operationId}`
        );
      }

      setIsGiveCreditsModalOpen(false);
      setSelectedUser(null);
      setSelectedUsersList([]);
      setGrantReason('');
      setIsConfirmed(false);

      if (activeTab === 'ledger') {
        await fetchLedger();
      } else if (activeTab === 'accounts') {
        await fetchAccounts();
      } else {
        await fetchBulkOperations();
      }
    } catch (err: any) {
      addToast('error', 'Operation Failed', err.message || 'Unable to execute credit grant.');
    } finally {
      setIsGrantingCredits(false);
    }
  };

  const openRemoveCreditsModal = (
    user?: UserSearchResult | AccountRow,
    initialAudience?: 'SINGLE' | 'ALL' | 'ALL_DEVELOPERS' | 'ALL_CLIENTS'
  ) => {
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
      setSelectedRemoveUser(candidate);
      setRemoveAudience('SINGLE');
    } else {
      setSelectedRemoveUser(null);
      setRemoveAudience(initialAudience || 'SINGLE');
      fetchSearchRemoveUsers('');
    }

    setSearchRemoveUserQuery('');
    setSelectedRemoveUsersList([]);
    setCreditsToRemove('3');
    setRemoveReason('');
    setIsRemoveConfirmed(false);
    setBulkRemovePreview(null);
    setIsRemoveCreditsModalOpen(true);
  };

  const handleRemoveCreditsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numCredits = Number(creditsToRemove);
    if (!Number.isInteger(numCredits) || numCredits <= 0 || numCredits > 1_000_000) {
      addToast('error', 'Invalid Amount', 'Credits to remove must be a positive integer between 1 and 1,000,000.');
      return;
    }

    if (!removeReason.trim() || removeReason.trim().length < 5) {
      addToast('error', 'Reason Required', 'Mandatory justification reason (at least 5 characters) required.');
      return;
    }

    setIsRemovingCredits(true);

    try {
      if (removeAudience === 'SINGLE') {
        if (!selectedRemoveUser) {
          addToast('error', 'Select User', 'Please select a platform user to remove credits from.');
          setIsRemovingCredits(false);
          return;
        }

        if (numCredits > selectedRemoveUser.current_balance) {
          addToast(
            'error',
            'Removal Rejected',
            `Cannot remove ${numCredits} credits: Current balance is ${selectedRemoveUser.current_balance}. Operation would result in negative balance. Business rules prohibit negative credit balances.`
          );
          setIsRemovingCredits(false);
          return;
        }

        const res = await apiClient.post<any>('/admin/credits/remove', {
          target: selectedRemoveUser.uid || selectedRemoveUser.id,
          amount: numCredits,
          reason: removeReason.trim(),
        });

        addToast(
          'success',
          'Credits Removed',
          `Successfully removed ${numCredits} credits from ${selectedRemoveUser.name} (${selectedRemoveUser.uid}). New balance: ${res.balance} credits.`
        );
      } else {
        if (!isRemoveConfirmed) {
          addToast('error', 'Confirmation Required', 'Please confirm the bulk credit removal before proceeding.');
          setIsRemovingCredits(false);
          return;
        }

        const payload: any = {
          targetScope: removeAudience,
          amount: numCredits,
          reason: removeReason.trim(),
          allowPartial: true,
        };

        if (removeAudience === 'SELECTED') {
          if (selectedRemoveUsersList.length === 0) {
            addToast('error', 'No Users Selected', 'Select at least one user for removal.');
            setIsRemovingCredits(false);
            return;
          }
          payload.userIds = selectedRemoveUsersList.map((u) => u.id);
        } else if (removeAudience === 'FILTERED') {
          payload.filters = {
            role: filterRemoveRole,
            verificationStatus: filterRemoveVerification !== 'ALL' ? filterRemoveVerification : undefined,
            minExperience: Number(filterRemoveMinExp) > 0 ? Number(filterRemoveMinExp) : undefined,
          };
        }

        const res = await apiClient.post<any>('/admin/credits/bulk-remove', payload);

        addToast(
          'success',
          'Bulk Removal Complete',
          `Deducted ${res.totalCredits} credits across ${res.count} accounts. Ref: ${res.batchReference}`
        );
      }

      setIsRemoveCreditsModalOpen(false);
      setSelectedRemoveUser(null);
      setSelectedRemoveUsersList([]);
      setRemoveReason('');
      setIsRemoveConfirmed(false);

      if (activeTab === 'ledger') {
        await fetchLedger();
      } else if (activeTab === 'accounts') {
        await fetchAccounts();
      } else {
        await fetchBulkOperations();
      }
    } catch (err: any) {
      addToast('error', 'Removal Failed', err.message || 'Unable to execute credit removal.');
    } finally {
      setIsRemovingCredits(false);
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

  const filteredBulkOps = bulkOperations.filter((bo) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      bo.operation_id?.toLowerCase().includes(q) ||
      bo.target_scope?.toLowerCase().includes(q) ||
      bo.reason?.toLowerCase().includes(q) ||
      bo.performed_by_email?.toLowerCase().includes(q)
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
            Single-user grants, controlled batch bulk allocations, and immutable double-entry transaction ledgers.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (activeTab === 'ledger') fetchLedger();
              else if (activeTab === 'accounts') fetchAccounts();
              else fetchBulkOperations();
            }}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Layers className="h-3.5 w-3.5" />}
            onClick={() => openGiveCreditsModal(undefined, 'ALL_DEVELOPERS')}
          >
            Bulk Grant
          </Button>
          <Button
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => openGiveCreditsModal(undefined, 'SINGLE')}
            className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold"
          >
            Give Credits
          </Button>
          <Button
            size="sm"
            variant="outline"
            leftIcon={<ArrowDownLeft className="h-4 w-4 text-status-danger" />}
            onClick={() => openRemoveCreditsModal(undefined, 'SINGLE')}
            className="border-status-danger/40 text-status-danger hover:bg-status-danger/10 font-semibold"
          >
            Remove Credits
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

        <button
          onClick={() => setActiveTab('bulk_operations')}
          className={`pb-3 text-sm font-medium flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === 'bulk_operations'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Bulk Operations Audit</span>
          <span className="text-xs bg-surface-elevated px-2 py-0.5 rounded-full font-mono">
            {bulkOperations.length}
          </span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center space-x-3">
        <Input
          placeholder={
            activeTab === 'ledger'
              ? 'Filter transactions by reference, email, UID, type, reason, or performer...'
              : activeTab === 'accounts'
              ? 'Filter accounts by email, 16-char UID, role, or company...'
              : 'Filter bulk operations by operation ID, target scope, reason, or admin...'
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Tab 1: Ledger */}
      {activeTab === 'ledger' && (
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
      )}

      {/* Tab 2: User Wallets */}
      {activeTab === 'accounts' && (
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
                            onClick={() => openGiveCreditsModal(acc, 'SINGLE')}
                            className="text-xs h-7 px-2 font-medium"
                            leftIcon={<ArrowUpRight className="h-3 w-3 text-status-success" />}
                          >
                            Give Credits
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRemoveCreditsModal(acc, 'SINGLE')}
                            className="text-xs h-7 px-2 border-status-danger/30 text-status-danger hover:bg-status-danger/10"
                            leftIcon={<ArrowDownLeft className="h-3 w-3 text-status-danger" />}
                          >
                            Remove Credits
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

      {/* Tab 3: Bulk Operations Audit (Phase 8 Requirement 6) */}
      {activeTab === 'bulk_operations' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Administrative Bulk Credit Operations</CardTitle>
                <CardDescription>
                  Immutable history of bulk distributions, recipient counts, total credits, and executive execution records
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => openGiveCreditsModal(undefined, 'ALL_DEVELOPERS')}
                leftIcon={<Plus className="h-3.5 w-3.5" />}
              >
                New Bulk Grant
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="p-8 text-center text-xs text-muted">Loading bulk operation audit logs...</div>
            ) : filteredBulkOps.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">No bulk operations recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operation ID</TableHead>
                      <TableHead>Audience Scope</TableHead>
                      <TableHead className="text-right">Recipients</TableHead>
                      <TableHead className="text-right">Credits / User</TableHead>
                      <TableHead className="text-right">Total Distributed</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Performed By</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Executed At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBulkOps.map((op) => (
                      <TableRow key={op.id}>
                        <TableCell className="font-mono text-xs font-bold text-accent-primary">
                          {op.operation_id}
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] font-mono uppercase bg-surface-elevated px-2 py-0.5 rounded border border-border text-foreground">
                            {op.target_scope}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-foreground">
                          {op.recipient_count?.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold text-status-success">
                          +{op.amount_per_user}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-status-success">
                          +{op.total_credits?.toLocaleString()} Credits
                        </TableCell>
                        <TableCell className="text-xs text-foreground max-w-xs truncate">
                          {op.reason}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted">
                          <span className="text-foreground block">{op.performed_by_email || op.performed_by}</span>
                          <span className="text-[10px] text-accent-primary uppercase font-mono">
                            {op.performed_by_role || 'ADMIN'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                              op.status === 'COMPLETED'
                                ? 'bg-status-success/10 text-status-success border-status-success/30'
                                : op.status === 'PROCESSING'
                                ? 'bg-accent-primary/10 text-accent-primary border-accent-primary/30'
                                : 'bg-status-danger/10 text-status-danger border-status-danger/30'
                            }`}
                          >
                            {op.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-[10px] text-muted whitespace-nowrap">
                          {new Date(op.created_at).toLocaleString()}
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

      {/* PHASE 7 & 8: GIVE CREDITS MODAL (Single-User & Bulk-Grant Workflow) */}
      <Modal
        isOpen={isGiveCreditsModalOpen}
        onClose={() => {
          setIsGiveCreditsModalOpen(false);
          setSelectedUser(null);
          setSelectedUsersList([]);
          setIsConfirmed(false);
        }}
        title="Give Credits"
        description="Allocate credits to an individual platform user, all eligible platform groups, or custom filtered cohorts."
      >
        <form onSubmit={handleGiveCreditsSubmit} className="space-y-4">
          {/* Audience Selector (Requirement 1) */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Audience Scope <span className="text-status-danger">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'SINGLE', label: 'Single User', icon: User },
                { id: 'ALL', label: 'All Users', icon: Users },
                { id: 'ALL_DEVELOPERS', label: 'All Developers', icon: Users },
                { id: 'ALL_CLIENTS', label: 'All Clients', icon: Users },
                { id: 'SELECTED', label: 'Selected Users', icon: CheckSquare },
                { id: 'FILTERED', label: 'Filtered Users', icon: SlidersHorizontal },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = audience === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setAudience(item.id as any);
                      setIsConfirmed(false);
                    }}
                    className={`p-2 rounded border text-left text-xs transition-all flex items-center space-x-2 ${
                      isSelected
                        ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-bold'
                        : 'border-border text-muted hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AUDIENCE 1: Single User Search & Selection */}
          {audience === 'SINGLE' && (
            <div className="space-y-3">
              {!selectedUser ? (
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

                  <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                    {isSearchingUsers ? (
                      <div className="p-4 text-center text-xs text-muted">Searching user directory...</div>
                    ) : searchResults.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted border border-border/60 rounded">
                        No platform users found.
                      </div>
                    ) : (
                      searchResults.map((u) => (
                        <div
                          key={u.id}
                          onClick={() => setSelectedUser(u)}
                          className="p-2.5 bg-surface-elevated hover:bg-surface-elevated/80 border border-border hover:border-accent-primary rounded cursor-pointer transition-all flex items-center justify-between"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-foreground">{u.name}</span>
                              <span className="text-[10px] font-mono bg-surface-base px-1.5 py-0.5 rounded border border-border">
                                UID: {u.uid}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted">
                              {u.email} {u.username ? `• @${u.username}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-bold font-mono text-status-success block">
                              {u.current_balance} Credits
                            </span>
                            <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-accent-primary/10 text-accent-primary">
                              {u.role}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-surface-elevated/70 border border-border/80 rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Target User</span>
                      <div className="text-sm font-bold text-foreground">{selectedUser.name}</div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-xs font-mono font-bold bg-surface-base px-1.5 py-0.5 rounded border border-border">
                          UID: {selectedUser.uid}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">
                          {selectedUser.role}
                        </span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-status-success/10 text-status-success">
                          {selectedUser.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">{selectedUser.email}</p>
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
              )}
            </div>
          )}

          {/* AUDIENCE 2: Selected Users Selector */}
          {audience === 'SELECTED' && (
            <div className="space-y-2.5">
              <label className="text-xs font-medium text-foreground block">
                Select Users ({selectedUsersList.length} selected)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted pointer-events-none" />
                <Input
                  placeholder="Search user to add to batch..."
                  value={searchUserQuery}
                  onChange={(e) => setSearchUserQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {selectedUsersList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-surface-elevated/40 border border-border/60 rounded max-h-24 overflow-y-auto">
                  {selectedUsersList.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center space-x-1 text-[11px] bg-surface-elevated border border-border px-2 py-0.5 rounded font-mono"
                    >
                      <span className="truncate max-w-[120px]">{u.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedUsersList(selectedUsersList.filter((x) => x.id !== u.id))}
                        className="text-muted hover:text-status-danger ml-1"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {searchResults
                  .filter((u) => !selectedUsersList.some((s) => s.id === u.id))
                  .slice(0, 10)
                  .map((u) => (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUsersList([...selectedUsersList, u])}
                      className="p-2 bg-surface-elevated hover:bg-surface-elevated/80 border border-border rounded cursor-pointer transition-all flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold">{u.name}</span>
                        <span className="text-muted text-[10px] ml-2 font-mono">{u.email}</span>
                      </div>
                      <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2 pointer-events-none">
                        + Add
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* AUDIENCE 3: Filtered Users Controls */}
          {audience === 'FILTERED' && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-surface-elevated/40 border border-border/60 rounded-lg">
              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">Role</label>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as any)}
                  className="w-full bg-surface-elevated border border-border text-foreground text-xs rounded px-2.5 py-1.5 outline-none focus:border-accent-primary"
                >
                  <option value="ALL">All Roles (Devs &amp; Clients)</option>
                  <option value="DEVELOPER">Developers Only</option>
                  <option value="CLIENT">Clients Only</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">Verification Status</label>
                <select
                  value={filterVerification}
                  onChange={(e) => setFilterVerification(e.target.value as any)}
                  className="w-full bg-surface-elevated border border-border text-foreground text-xs rounded px-2.5 py-1.5 outline-none focus:border-accent-primary"
                >
                  <option value="ALL">All Active Statuses</option>
                  <option value="VERIFIED">Verified Only</option>
                  <option value="PENDING">Pending Verification</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted block mb-1">Min. Experience (Yrs)</label>
                <Input
                  type="number"
                  min="0"
                  value={filterMinExp}
                  onChange={(e) => setFilterMinExp(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* Amount and Reason */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                {audience === 'SINGLE' ? 'Credits to Add' : 'Credits per User'} <span className="text-status-danger">*</span>
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
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Auditable Reason <span className="text-status-danger">*</span>
              </label>
              <Input
                placeholder="e.g. New platform promotion"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                required
              />
            </div>
          </div>

          {/* REQUIREMENT 2: CONFIRMATION PREVIEW CARD (For all bulk workflows) */}
          {audience !== 'SINGLE' && (
            <div className="p-3.5 bg-surface-elevated border border-border/80 rounded-lg space-y-3">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-bold text-foreground flex items-center space-x-1.5">
                  <CheckCircle2 className="h-4 w-4 text-accent-primary" />
                  <span>Bulk Execution Confirmation Preview</span>
                </span>
                {isPreviewLoading && <span className="text-[10px] text-muted">Calculating eligible recipients...</span>}
              </div>

              {bulkPreview ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center py-2 bg-surface-base/60 rounded border border-border/40">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-muted block">Recipients</span>
                      <span className="text-base font-bold text-foreground font-mono">
                        {bulkPreview.recipientCount.toLocaleString()} users
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono text-muted block">Credits per user</span>
                      <span className="text-base font-bold text-status-success font-mono">
                        +{bulkPreview.amountPerUser}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono text-muted block">Total Credits</span>
                      <span className="text-base font-bold text-status-success font-mono">
                        {bulkPreview.totalCredits.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-muted flex items-start space-x-1">
                    <span className="font-semibold text-foreground">Reason:</span>
                    <span className="italic">{grantReason || 'New platform promotion'}</span>
                  </div>

                  {bulkPreview.sampleRecipients.length > 0 && (
                    <div className="text-[11px] text-muted">
                      <span className="font-medium text-foreground">Eligible Sample: </span>
                      {bulkPreview.sampleRecipients.map((r) => r.name).join(', ')}
                      {bulkPreview.recipientCount > bulkPreview.sampleRecipients.length && (
                        <span> +{bulkPreview.recipientCount - bulkPreview.sampleRecipients.length} more</span>
                      )}
                    </div>
                  )}

                  {/* Explicit Confirmation Checkbox (Requirement 2) */}
                  <label className="flex items-center space-x-2 pt-2 border-t border-border/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isConfirmed}
                      onChange={(e) => setIsConfirmed(e.target.checked)}
                      className="rounded border-border text-accent-primary focus:ring-accent-primary h-4 w-4"
                    />
                    <span className="text-xs font-semibold text-foreground">
                      I explicitly confirm granting {bulkPreview.totalCredits.toLocaleString()} total credits across{' '}
                      {bulkPreview.recipientCount.toLocaleString()} users with individual double-entry ledger records.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-muted">
                  Specify credits per user and reason to calculate recipient count.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsGiveCreditsModalOpen(false);
                setSelectedUser(null);
                setSelectedUsersList([]);
                setIsConfirmed(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isGrantingCredits}
              disabled={audience !== 'SINGLE' && !isConfirmed}
              leftIcon={<ArrowUpRight className="h-4 w-4" />}
              className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold"
            >
              {audience === 'SINGLE' ? 'Give Credits' : 'Execute Bulk Grant'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* PHASE 9 REMOVE CREDITS MODAL */}
      <Modal
        isOpen={isRemoveCreditsModalOpen}
        onClose={() => {
          setIsRemoveCreditsModalOpen(false);
          setSelectedRemoveUser(null);
          setSelectedRemoveUsersList([]);
          setIsRemoveConfirmed(false);
        }}
        title="Remove Credits"
        description="Securely deduct credits from user accounts with non-negative balance protection, mandatory audit logging, and concurrency safety."
      >
        <form onSubmit={handleRemoveCreditsSubmit} className="space-y-4">
          {/* Audience Mode Selector */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Target Audience</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRemoveAudience('SINGLE')}
                className={`py-2 px-3 text-xs rounded border text-left font-medium transition-colors ${
                  removeAudience === 'SINGLE'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger'
                    : 'border-border bg-surface-elevated text-muted hover:text-foreground'
                }`}
              >
                <div className="font-semibold">Single User</div>
                <div className="text-[10px] opacity-75">Specific UID or account</div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveAudience('SELECTED')}
                className={`py-2 px-3 text-xs rounded border text-left font-medium transition-colors ${
                  removeAudience === 'SELECTED'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger'
                    : 'border-border bg-surface-elevated text-muted hover:text-foreground'
                }`}
              >
                <div className="font-semibold">Selected Users</div>
                <div className="text-[10px] opacity-75">Multi-account list</div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveAudience('ALL_DEVELOPERS')}
                className={`py-2 px-3 text-xs rounded border text-left font-medium transition-colors ${
                  removeAudience === 'ALL_DEVELOPERS'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger'
                    : 'border-border bg-surface-elevated text-muted hover:text-foreground'
                }`}
              >
                <div className="font-semibold">All Developers</div>
                <div className="text-[10px] opacity-75">Active verified devs</div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveAudience('ALL_CLIENTS')}
                className={`py-2 px-3 text-xs rounded border text-left font-medium transition-colors ${
                  removeAudience === 'ALL_CLIENTS'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger'
                    : 'border-border bg-surface-elevated text-muted hover:text-foreground'
                }`}
              >
                <div className="font-semibold">All Clients</div>
                <div className="text-[10px] opacity-75">Active client accounts</div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveAudience('ALL')}
                className={`py-2 px-3 text-xs rounded border text-left font-medium transition-colors ${
                  removeAudience === 'ALL'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger'
                    : 'border-border bg-surface-elevated text-muted hover:text-foreground'
                }`}
              >
                <div className="font-semibold">All Platform Users</div>
                <div className="text-[10px] opacity-75">Every eligible wallet</div>
              </button>
              <button
                type="button"
                onClick={() => setRemoveAudience('FILTERED')}
                className={`py-2 px-3 text-xs rounded border text-left font-medium transition-colors ${
                  removeAudience === 'FILTERED'
                    ? 'border-status-danger bg-status-danger/10 text-status-danger'
                    : 'border-border bg-surface-elevated text-muted hover:text-foreground'
                }`}
              >
                <div className="font-semibold">Filtered Cohort</div>
                <div className="text-[10px] opacity-75">Role, status, exp</div>
              </button>
            </div>
          </div>

          {/* SINGLE USER REMOVAL UI (Matching Phase 9 Specification) */}
          {removeAudience === 'SINGLE' && (
            <div className="space-y-3">
              {!selectedRemoveUser ? (
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    Search User by 16-Char UID, Name, Email, or Username
                  </label>
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted" />
                    <Input
                      placeholder="e.g. A7kP92xLmQ4vT8Nz, ritesh, shiva@nexus.dev..."
                      value={searchRemoveUserQuery}
                      onChange={(e) => setSearchRemoveUserQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {isSearchingRemoveUsers && (
                    <div className="p-3 text-xs text-muted text-center">Searching user database...</div>
                  )}

                  {!isSearchingRemoveUsers && searchRemoveResults.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto border border-border rounded divide-y divide-border bg-surface-elevated">
                      {searchRemoveResults.map((u) => (
                        <div
                          key={u.id}
                          onClick={() => setSelectedRemoveUser(u)}
                          className="p-2 hover:bg-surface-elevated/80 cursor-pointer flex items-center justify-between text-xs transition-colors"
                        >
                          <div>
                            <div className="font-semibold text-foreground flex items-center space-x-2">
                              <span>{u.name}</span>
                              <span className="text-[10px] font-mono bg-surface border border-border px-1.5 py-0.2 rounded text-accent-primary">
                                {u.uid}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted">{u.email} &bull; {u.role}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-foreground block">{u.current_balance} Credits</span>
                            <span className="text-[10px] text-status-success uppercase font-semibold">Select</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Selected User Card (Phase 9 Spec UI) */
                <div className="p-3.5 bg-surface-elevated border border-border rounded-lg space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-muted font-medium uppercase tracking-wider">User</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{selectedRemoveUser.name}</div>
                      <div className="text-xs font-mono text-accent-primary mt-0.5">
                        UID: <span className="font-semibold">{selectedRemoveUser.uid}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {selectedRemoveUser.email} &bull; {selectedRemoveUser.role}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-[10px] h-6 px-2 text-muted hover:text-foreground"
                      onClick={() => setSelectedRemoveUser(null)}
                    >
                      Change User
                    </Button>
                  </div>

                  <div className="pt-2 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted font-medium">Current Balance:</span>
                    <span className="font-mono text-sm font-bold text-foreground">
                      {selectedRemoveUser.current_balance} Credits
                    </span>
                  </div>

                  {/* Negative Balance Guard Warning Banner */}
                  {Number(creditsToRemove) > selectedRemoveUser.current_balance && (
                    <div className="mt-2 p-2.5 bg-status-danger/10 border border-status-danger/30 rounded text-xs text-status-danger flex items-start space-x-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Negative Balance Prevention</div>
                        <div className="text-[11px] mt-0.5">
                          Cannot remove {creditsToRemove} credits: Current balance is {selectedRemoveUser.current_balance}. Operation rejected to prevent negative balance. Business rules prohibit negative credit balances.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SELECTED USERS AUDIENCE */}
          {removeAudience === 'SELECTED' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Add Users to Selection List</label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted" />
                  <Input
                    placeholder="Search users to select..."
                    value={searchRemoveUserQuery}
                    onChange={(e) => setSearchRemoveUserQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {!isSearchingRemoveUsers && searchRemoveResults.length > 0 && (
                  <div className="mt-1 max-h-36 overflow-y-auto border border-border rounded divide-y divide-border bg-surface-elevated">
                    {searchRemoveResults.map((u) => {
                      const isAlreadySelected = selectedRemoveUsersList.some((su) => su.id === u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => {
                            if (!isAlreadySelected) {
                              setSelectedRemoveUsersList([...selectedRemoveUsersList, u]);
                            }
                          }}
                          className={`p-2 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                            isAlreadySelected ? 'opacity-50 cursor-not-allowed bg-surface' : 'hover:bg-surface-elevated/80'
                          }`}
                        >
                          <div>
                            <span className="font-semibold text-foreground">{u.name}</span>
                            <span className="text-[10px] text-muted ml-2 font-mono">({u.uid})</span>
                          </div>
                          <span className="font-mono text-muted text-xs">
                            {u.current_balance} Credits &bull; {isAlreadySelected ? 'Added' : '+ Add'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedRemoveUsersList.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted mb-1.5 flex justify-between">
                    <span>Selected Users ({selectedRemoveUsersList.length})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedRemoveUsersList([])}
                      className="text-status-danger text-[10px] hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-surface-elevated rounded border border-border">
                    {selectedRemoveUsersList.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center text-xs bg-surface border border-border px-2 py-0.5 rounded text-foreground font-mono"
                      >
                        <span>{u.name}</span>
                        <span className="text-[10px] text-muted ml-1">({u.current_balance} cr)</span>
                        <button
                          type="button"
                          onClick={() => setSelectedRemoveUsersList(selectedRemoveUsersList.filter((x) => x.id !== u.id))}
                          className="ml-1.5 text-muted hover:text-status-danger"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FILTERED COHORT CONTROLS */}
          {removeAudience === 'FILTERED' && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-surface-elevated rounded border border-border">
              <div>
                <label className="text-[10px] font-medium text-muted block mb-1">Role</label>
                <select
                  value={filterRemoveRole}
                  onChange={(e) => setFilterRemoveRole(e.target.value as any)}
                  className="w-full bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5 outline-none"
                >
                  <option value="ALL">All Roles</option>
                  <option value="DEVELOPER">Developers</option>
                  <option value="CLIENT">Clients</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted block mb-1">Developer Status</label>
                <select
                  value={filterRemoveVerification}
                  onChange={(e) => setFilterRemoveVerification(e.target.value as any)}
                  className="w-full bg-surface border border-border text-foreground text-xs rounded px-2 py-1.5 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="VERIFIED">Verified Only</option>
                  <option value="PENDING">Pending Only</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium text-muted block mb-1">Min Experience (Yrs)</label>
                <Input
                  type="number"
                  min="0"
                  value={filterRemoveMinExp}
                  onChange={(e) => setFilterRemoveMinExp(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          {/* CREDITS TO REMOVE INPUT */}
          <div>
            <Input
              label="Credits to Remove"
              type="number"
              min="1"
              max="1000000"
              value={creditsToRemove}
              onChange={(e) => setCreditsToRemove(e.target.value)}
              placeholder="e.g. 3"
              required
            />
          </div>

          {/* REASON INPUT */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Reason <span className="text-status-danger">*</span>
            </label>
            <textarea
              placeholder="e.g., Manual correction, duplicate bonus reversal, promotional cleanup..."
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              rows={2}
              required
              className="w-full bg-surface-elevated border border-border text-foreground text-xs rounded px-3 py-2 outline-none focus:border-status-danger resize-none font-sans"
            />
            <span className="text-[10px] text-muted">Minimum 5 characters. Immutable ledger entry.</span>
          </div>

          {/* BULK REMOVAL CONFIRMATION & PREVIEW CARD */}
          {removeAudience !== 'SINGLE' && (
            <div className="p-3 bg-surface-elevated border border-border rounded-lg space-y-3">
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Bulk Removal Confirmation Preview</span>
                {isRemovePreviewLoading && <span className="text-[10px] text-muted animate-pulse">Calculating...</span>}
              </div>

              {bulkRemovePreview ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-2 p-2 bg-surface rounded border border-border text-center">
                    <div>
                      <div className="text-[10px] text-muted">Eligible Accounts</div>
                      <div className="font-mono font-bold text-foreground mt-0.5">
                        {bulkRemovePreview.recipientCount.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted">Max Deduct / User</div>
                      <div className="font-mono font-bold text-status-danger mt-0.5">
                        -{bulkRemovePreview.amountPerUser}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted">Total Estimated Deductions</div>
                      <div className="font-mono font-bold text-status-danger mt-0.5">
                        -{bulkRemovePreview.estimatedTotalCredits.toLocaleString()} Credits
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-muted">
                    <span className="font-semibold text-foreground">Cohort: </span>
                    {bulkRemovePreview.breakdown.developers} Developers, {bulkRemovePreview.breakdown.clients} Clients
                    with positive balance. Negative balances strictly prohibited.
                  </div>

                  <label className="flex items-start space-x-2 pt-2 border-t border-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRemoveConfirmed}
                      onChange={(e) => setIsRemoveConfirmed(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-border text-status-danger focus:ring-status-danger"
                    />
                    <span className="text-xs text-foreground font-medium">
                      I confirm deducting credits across {bulkRemovePreview.recipientCount.toLocaleString()} eligible accounts.
                    </span>
                  </label>
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-muted">
                  Specify credits to remove and reason to preview eligible accounts.
                </div>
              )}
            </div>
          )}

          {/* ACTIONS */}
          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRemoveCreditsModalOpen(false);
                setSelectedRemoveUser(null);
                setSelectedRemoveUsersList([]);
                setIsRemoveConfirmed(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isLoading={isRemovingCredits}
              disabled={
                (removeAudience === 'SINGLE' && (!selectedRemoveUser || Number(creditsToRemove) > (selectedRemoveUser?.current_balance || 0))) ||
                (removeAudience !== 'SINGLE' && !isRemoveConfirmed) ||
                Number(creditsToRemove) <= 0 ||
                removeReason.trim().length < 5
              }
              leftIcon={<ArrowDownLeft className="h-4 w-4" />}
              className="bg-status-danger hover:bg-status-danger/90 text-white font-semibold"
            >
              {removeAudience === 'SINGLE' ? 'Remove Credits' : 'Execute Bulk Removal'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
