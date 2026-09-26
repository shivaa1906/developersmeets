'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import {
  Users,
  LifeBuoy,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  UserCheck,
  UserX,
  ArrowRightLeft,
  Settings,
  Mail,
  CheckCircle2,
} from 'lucide-react';

interface SupportStaffRow {
  id: string;
  user_id: string;
  email: string;
  department: string;
  title: string;
  support_level: string;
  specializations: string[];
  status: 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE' | 'SUSPENDED';
  availability?: string;
  max_active_tickets: number;
  timezone: string;
  permissions: string[];
  active_tickets: number;
  waiting_tickets: number;
  urgent_tickets: number;
  resolved_today: number;
  created_at: string;
}

const SUPPORT_PERM_OPTIONS = [
  { key: 'SUPPORT_VIEW_TICKETS', label: 'View Tickets' },
  { key: 'SUPPORT_REPLY_TICKETS', label: 'Reply to Tickets' },
  { key: 'SUPPORT_ASSIGN_TICKETS', label: 'Assign Tickets' },
  { key: 'SUPPORT_REASSIGN_TICKETS', label: 'Reassign Tickets' },
  { key: 'SUPPORT_CHANGE_STATUS', label: 'Change Ticket Status' },
  { key: 'SUPPORT_CHANGE_PRIORITY', label: 'Change Priority' },
  { key: 'SUPPORT_CREATE_BRIDGE', label: 'Create Support Bridge' },
  { key: 'SUPPORT_ADD_DEVELOPER', label: 'Add Developer to Bridge' },
  { key: 'SUPPORT_VIEW_INTERNAL_NOTES', label: 'View Internal Notes' },
  { key: 'SUPPORT_ADD_INTERNAL_NOTES', label: 'Add Internal Notes' },
  { key: 'SUPPORT_RESOLVE_TICKETS', label: 'Resolve Tickets' },
  { key: 'SUPPORT_CLOSE_TICKETS', label: 'Close Tickets' },
  { key: 'SUPPORT_ESCALATE_TICKETS', label: 'Escalate Tickets' },
  { key: 'SUPPORT_VIEW_ANALYTICS', label: 'View Analytics' },
];

export default function SupportStaffManagementPage() {
  const { addToast } = useToast();

  const [staff, setStaff] = React.useState<SupportStaffRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('ALL');
  const [levelFilter, setLevelFilter] = React.useState('ALL');

  // Modals
  const [addModalOpen, setAddModalOpen] = React.useState(false);
  const [addTab, setAddTab] = React.useState<'EXISTING' | 'INVITE'>('EXISTING');
  const [permsModalOpen, setPermsModalOpen] = React.useState(false);
  const [selectedStaff, setSelectedStaff] = React.useState<SupportStaffRow | null>(null);
  const [staffPerms, setStaffPerms] = React.useState<string[]>([]);
  const [reassignModalOpen, setReassignModalOpen] = React.useState(false);
  const [reassignFromStaff, setReassignFromStaff] = React.useState<SupportStaffRow | null>(null);
  const [reassignTargetUserId, setReassignTargetUserId] = React.useState('');

  // Add Form State
  const [userIdOrEmail, setUserIdOrEmail] = React.useState('');
  const [newFullName, setNewFullName] = React.useState('');
  const [newEmail, setNewEmail] = React.useState('');
  const [newDept, setNewDept] = React.useState('Technical Support');
  const [newTitle, setNewTitle] = React.useState('Support Specialist');
  const [newLevel, setNewLevel] = React.useState('L1_SUPPORT');
  const [newMaxTickets, setNewMaxTickets] = React.useState(10);
  const [newSpecs, setNewSpecs] = React.useState('Web, Technical');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchStaff = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ staff: SupportStaffRow[] }>('/admin/support/staff');
      setStaff(res.staff || []);
      setError(null);
    } catch (err: any) {
      const msg = err.message || 'Unable to load support staff directory.';
      setError(msg);
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleStatusChange = async (staffId: string, newStatus: string) => {
    setUpdatingId(staffId);
    try {
      await apiClient.patch(`/admin/support/staff/${staffId}/status`, { status: newStatus });
      addToast('success', 'Status Updated', `Staff status changed to ${newStatus}.`);
      await fetchStaff();
    } catch (err: any) {
      addToast('error', 'Status Update Failed', err.message || 'Unable to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSuspendToggle = async (staffMember: SupportStaffRow) => {
    setUpdatingId(staffMember.id);
    const newStatus = staffMember.status === 'SUSPENDED' ? 'AVAILABLE' : 'SUSPENDED';
    try {
      await apiClient.patch(`/admin/support/staff/${staffMember.id}/status`, { status: newStatus });
      addToast(
        'success',
        newStatus === 'SUSPENDED' ? 'Staff Suspended' : 'Staff Re-activated',
        `Staff member is now ${newStatus}.`
      );
      await fetchStaff();
    } catch (err: any) {
      addToast('error', 'Action Failed', err.message || 'Unable to change status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveAccess = async (staffMember: SupportStaffRow) => {
    if (!confirm(`Are you sure you want to revoke Support access for ${staffMember.email}? Historical tickets will remain intact.`)) {
      return;
    }

    setUpdatingId(staffMember.id);
    try {
      const res: any = await apiClient.post(`/admin/support/staff/${staffMember.id}/remove`, {});
      addToast('success', 'Access Removed', res.message || 'Support access revoked.');
      await fetchStaff();
    } catch (err: any) {
      addToast('error', 'Action Failed', err.message || 'Unable to remove support access.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedStaff) return;
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/admin/support/staff/${selectedStaff.id}/permissions`, {
        permissions: staffPerms,
      });
      addToast('success', 'Permissions Updated', 'Support operational permissions saved.');
      setPermsModalOpen(false);
      await fetchStaff();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Unable to update permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignFromStaff || !reassignTargetUserId) {
      addToast('error', 'Validation Error', 'Please select a target support agent.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res: any = await apiClient.post(`/admin/support/staff/${reassignFromStaff.id}/reassign-tickets`, {
        fromUserId: reassignFromStaff.user_id,
        toUserId: reassignTargetUserId,
      });
      addToast('success', 'Tickets Reassigned', res.message || 'Tickets successfully transferred.');
      setReassignModalOpen(false);
      await fetchStaff();
    } catch (err: any) {
      addToast('error', 'Reassignment Failed', err.message || 'Unable to reassign tickets.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const specArray = newSpecs.split(',').map((s) => s.trim()).filter(Boolean);

      if (addTab === 'EXISTING') {
        if (!userIdOrEmail.trim()) {
          addToast('error', 'Validation Error', 'Please enter a user email or ID.');
          setIsSubmitting(false);
          return;
        }

        await apiClient.post('/admin/support/staff', {
          userIdOrEmail: userIdOrEmail.trim(),
          department: newDept,
          title: newTitle,
          supportLevel: newLevel,
          maxActiveTickets: Number(newMaxTickets) || 10,
          specializations: specArray,
        });

        addToast('success', 'Staff Added', `User assigned to Support role successfully.`);
      } else {
        if (!newEmail.trim() || !newFullName.trim()) {
          addToast('error', 'Validation Error', 'Email and Full Name are required.');
          setIsSubmitting(false);
          return;
        }

        await apiClient.post('/admin/support/staff/invite', {
          email: newEmail.trim(),
          fullName: newFullName.trim(),
          department: newDept,
          title: newTitle,
          supportLevel: newLevel,
          maxActiveTickets: Number(newMaxTickets) || 10,
          specializations: specArray,
        });

        addToast('success', 'Staff Invited', `Invitation dispatched for ${newEmail}.`);
      }

      setAddModalOpen(false);
      setUserIdOrEmail('');
      setNewFullName('');
      setNewEmail('');
      await fetchStaff();
    } catch (err: any) {
      addToast('error', 'Submission Failed', err.message || 'Unable to add support staff.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metrics
  const totalStaff = staff.length;
  const availableStaff = staff.filter((s) => s.status === 'AVAILABLE').length;
  const activeTicketsWorkload = staff.reduce((acc, s) => acc + Number(s.active_tickets || 0), 0);
  const urgentTicketsWorkload = staff.reduce((acc, s) => acc + Number(s.urgent_tickets || 0), 0);

  // Filtered List
  const filteredStaff = staff.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.email.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.department.toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchesLevel = levelFilter === 'ALL' || s.support_level === levelFilter;

    return matchesSearch && matchesStatus && matchesLevel;
  });

  const getStatusBadge = (status: SupportStaffRow['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="success" className="text-[10px]">AVAILABLE</Badge>;
      case 'BUSY':
        return <Badge variant="warning" className="text-[10px]">BUSY</Badge>;
      case 'AWAY':
        return <Badge variant="outline" className="text-[10px] text-muted">AWAY</Badge>;
      case 'OFFLINE':
        return <Badge variant="outline" className="text-[10px] text-muted">OFFLINE</Badge>;
      case 'SUSPENDED':
        return <Badge variant="danger" className="text-[10px]">SUSPENDED</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'SUPPORT_MANAGER':
        return <span className="font-semibold text-accent">Manager</span>;
      case 'SUPPORT_LEAD':
        return <span className="font-semibold text-status-warning">Lead</span>;
      case 'TECHNICAL_SUPPORT':
        return <span className="text-foreground">Technical</span>;
      case 'L2_SUPPORT':
        return <span className="text-foreground">L2 Tier</span>;
      default:
        return <span className="text-muted">L1 Tier</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Support Operations & Staff Management</h1>
          <p className="text-xs text-muted mt-1">
            Enterprise administration of support specialists, ticket routing capacity, team tiers, and granular permissions.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={fetchStaff}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setAddModalOpen(true)}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Support Staff
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-border pb-3">
        <Link href="/admin/support">
          <Button size="sm" variant="outline" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
            Tickets Queue
          </Button>
        </Link>
        <Link href="/admin/support/staff">
          <Button size="sm" variant="default" leftIcon={<Users className="h-3.5 w-3.5" />}>
            Support Staff & Workload
          </Button>
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <span className="text-xs text-muted">Total Support Staff</span>
          <div className="text-xl font-bold font-mono text-foreground mt-1">{totalStaff}</div>
          <p className="text-[10px] text-muted mt-1">Across all departments</p>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <span className="text-xs text-muted">Available & Active</span>
          <div className="text-xl font-bold font-mono text-status-success mt-1">{availableStaff}</div>
          <p className="text-[10px] text-muted mt-1">Accepting routed tickets</p>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <span className="text-xs text-muted">Active Workload</span>
          <div className="text-xl font-bold font-mono text-status-info mt-1">{activeTicketsWorkload}</div>
          <p className="text-[10px] text-muted mt-1">Tickets in progress</p>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <span className="text-xs text-muted">Urgent Queue</span>
          <div className="text-xl font-bold font-mono text-status-danger mt-1">{urgentTicketsWorkload}</div>
          <p className="text-[10px] text-muted mt-1">High & urgent priority</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted" />
          <Input
            placeholder="Search support staff by name, email, department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs w-36"
          >
            <option value="ALL">All Statuses</option>
            <option value="AVAILABLE">AVAILABLE</option>
            <option value="BUSY">BUSY</option>
            <option value="AWAY">AWAY</option>
            <option value="OFFLINE">OFFLINE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </Select>

          <Select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="text-xs w-40"
          >
            <option value="ALL">All Tiers / Levels</option>
            <option value="L1_SUPPORT">L1 Tier</option>
            <option value="L2_SUPPORT">L2 Tier</option>
            <option value="TECHNICAL_SUPPORT">Technical Specialist</option>
            <option value="SUPPORT_LEAD">Support Lead</option>
            <option value="SUPPORT_MANAGER">Support Manager</option>
          </Select>
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Support Specialists Directory</CardTitle>
            <div className="flex items-center space-x-1.5 text-xs text-accent font-mono bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Permission Controlled</span>
            </div>
          </div>
          <CardDescription className="text-xs">
            Operational status and capacity govern smart ticket routing and assignment eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-xs text-muted flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <span>Loading support staff...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-status-danger mx-auto" />
              <div className="text-sm font-semibold text-foreground">Unable to load support staff</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                {error.includes('Failed to fetch')
                  ? 'Unable to connect to the backend service. Please ensure the backend is running and retry.'
                  : error}
              </p>
              <Button size="sm" onClick={() => fetchStaff()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                Retry
              </Button>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Users className="h-10 w-10 text-muted mx-auto" />
              <div className="text-sm font-semibold text-foreground">No support staff found</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                No support team members match your current filters or have been provisioned yet.
              </p>
              <Button size="sm" onClick={() => setAddModalOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                Add Support Staff
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Specialist</TableHead>
                  <TableHead>Department & Level</TableHead>
                  <TableHead>Specializations</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Workload / Cap</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((row) => {
                  const specs = Array.isArray(row.specializations)
                    ? row.specializations
                    : typeof row.specializations === 'string'
                    ? JSON.parse(row.specializations)
                    : [];
                  const capPercent = Math.min(100, Math.round((row.active_tickets / (row.max_active_tickets || 10)) * 100));

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="text-xs font-semibold text-foreground">{row.email}</div>
                          <div className="text-[11px] text-muted">{row.title}</div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-0.5 text-xs">
                          <div className="text-foreground">{row.department}</div>
                          <div className="text-[11px]">{getLevelBadge(row.support_level)}</div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {specs.map((spec: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1 border-border">
                              {spec}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Select
                          value={row.status}
                          disabled={updatingId === row.id}
                          onChange={(e) => handleStatusChange(row.id, e.target.value)}
                          className="text-xs h-7 w-28"
                        >
                          <option value="AVAILABLE">AVAILABLE</option>
                          <option value="BUSY">BUSY</option>
                          <option value="AWAY">AWAY</option>
                          <option value="OFFLINE">OFFLINE</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                        </Select>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1 w-28">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-mono font-bold text-foreground">{row.active_tickets}</span>
                            <span className="text-muted">/ {row.max_active_tickets} max</span>
                          </div>
                          <div className="h-1.5 w-full bg-surface border border-border rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                capPercent > 80
                                  ? 'bg-status-danger'
                                  : capPercent > 50
                                  ? 'bg-status-warning'
                                  : 'bg-status-success'
                              }`}
                              style={{ width: `${capPercent}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedStaff(row);
                              setStaffPerms(
                                Array.isArray(row.permissions)
                                  ? row.permissions
                                  : typeof row.permissions === 'string'
                                  ? JSON.parse(row.permissions)
                                  : []
                              );
                              setPermsModalOpen(true);
                            }}
                            title="Manage Permissions"
                          >
                            <Settings className="h-3 w-3" />
                          </Button>

                          {row.active_tickets > 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setReassignFromStaff(row);
                                setReassignTargetUserId('');
                                setReassignModalOpen(true);
                              }}
                              title="Reassign Active Tickets"
                            >
                              <ArrowRightLeft className="h-3 w-3" />
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant={row.status === 'SUSPENDED' ? 'default' : 'secondary'}
                            onClick={() => handleSuspendToggle(row)}
                            isLoading={updatingId === row.id}
                            title={row.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          >
                            {row.status === 'SUSPENDED' ? (
                              <UserCheck className="h-3 w-3" />
                            ) : (
                              <ShieldAlert className="h-3 w-3 text-status-warning" />
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRemoveAccess(row)}
                            isLoading={updatingId === row.id}
                            title="Revoke Support Access"
                          >
                            <UserX className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Support Staff Modal */}
      <Dialog
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Support Staff"
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-2 border-b border-border pb-2 text-xs">
            <button
              type="button"
              onClick={() => setAddTab('EXISTING')}
              className={`pb-1 font-semibold border-b-2 transition-colors ${
                addTab === 'EXISTING'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              Add Existing User
            </button>
            <button
              type="button"
              onClick={() => setAddTab('INVITE')}
              className={`pb-1 font-semibold border-b-2 transition-colors ${
                addTab === 'INVITE'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              Invite New User
            </button>
          </div>

          <form onSubmit={handleAddStaffSubmit} className="space-y-4">
            {addTab === 'EXISTING' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">User Email or User ID</label>
                <Input
                  placeholder="e.g. employee@company.com or uuid"
                  value={userIdOrEmail}
                  onChange={(e) => setUserIdOrEmail(e.target.value)}
                  className="text-xs"
                  required
                />
                <p className="text-[10px] text-muted">
                  Assigns the SUPPORT role to an existing user account.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Full Name</label>
                  <Input
                    placeholder="Alex Johnson"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Email</label>
                  <Input
                    type="email"
                    placeholder="alex@nexus.dev"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Department</label>
                <Select
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  className="text-xs"
                >
                  <option value="Technical Support">Technical Support</option>
                  <option value="Billing & Operations">Billing & Operations</option>
                  <option value="Customer Success">Customer Success</option>
                  <option value="Infrastructure & DevOps">Infrastructure & DevOps</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Support Level</label>
                <Select
                  value={newLevel}
                  onChange={(e) => setNewLevel(e.target.value)}
                  className="text-xs"
                >
                  <option value="L1_SUPPORT">L1 Support</option>
                  <option value="L2_SUPPORT">L2 Support</option>
                  <option value="TECHNICAL_SUPPORT">Technical Specialist</option>
                  <option value="SUPPORT_LEAD">Support Lead</option>
                  <option value="SUPPORT_MANAGER">Support Manager</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Role Title</label>
                <Input
                  placeholder="Support Specialist"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Max Active Tickets</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={newMaxTickets}
                  onChange={(e) => setNewMaxTickets(parseInt(e.target.value, 10) || 10)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Specializations (comma separated)</label>
              <Input
                placeholder="Web, Backend, Database, Payments, Security"
                value={newSpecs}
                onChange={(e) => setNewSpecs(e.target.value)}
                className="text-xs"
              />
              <p className="text-[10px] text-muted">
                Used by the Smart Routing Engine to match inbound ticket categories with qualified specialists.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <Button size="sm" variant="secondary" type="button" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" type="submit" isLoading={isSubmitting}>
                {addTab === 'EXISTING' ? 'Add Support Staff' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Permissions Modal */}
      <Dialog
        isOpen={permsModalOpen}
        onClose={() => setPermsModalOpen(false)}
        title={`Granular Permissions — ${selectedStaff?.email}`}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Configure explicit capabilities for this support specialist. Changes take effect on next API request.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
            {SUPPORT_PERM_OPTIONS.map((opt) => {
              const checked = staffPerms.includes(opt.key);
              return (
                <label
                  key={opt.key}
                  className="flex items-center space-x-2 text-xs p-2 rounded border border-border bg-surface/50 hover:bg-surface cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setStaffPerms([...staffPerms, opt.key]);
                      } else {
                        setStaffPerms(staffPerms.filter((p) => p !== opt.key));
                      }
                    }}
                    className="rounded text-accent focus:ring-accent"
                  />
                  <span className="text-foreground">{opt.label}</span>
                </label>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setStaffPerms(SUPPORT_PERM_OPTIONS.map((p) => p.key))}
            >
              Select All
            </Button>

            <div className="flex items-center space-x-2">
              <Button size="sm" variant="secondary" type="button" onClick={() => setPermsModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSavePermissions} isLoading={isSubmitting}>
                Save Permissions
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Bulk Reassign Modal */}
      <Dialog
        isOpen={reassignModalOpen}
        onClose={() => setReassignModalOpen(false)}
        title="Reassign Active Tickets"
      >
        <form onSubmit={handleBulkReassign} className="space-y-4">
          <div className="p-3 rounded-lg border border-status-warning/30 bg-status-warning/5 text-xs text-muted space-y-1">
            <span className="font-semibold text-status-warning">Workload Redistribution</span>
            <p>
              Reassigning will transfer all <strong>{reassignFromStaff?.active_tickets} active tickets</strong> from{' '}
              <strong>{reassignFromStaff?.email}</strong> to another support specialist. Bridge channels and notifications will update automatically.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Target Support Agent</label>
            <Select
              value={reassignTargetUserId}
              onChange={(e) => setReassignTargetUserId(e.target.value)}
              className="text-xs"
              required
            >
              <option value="">Select target specialist...</option>
              {staff
                .filter((s) => s.user_id !== reassignFromStaff?.user_id && s.status !== 'SUSPENDED')
                .map((s) => (
                  <option key={s.id} value={s.user_id}>
                    {s.email} ({s.status} — {s.active_tickets}/{s.max_active_tickets} active)
                  </option>
                ))}
            </Select>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <Button size="sm" variant="secondary" type="button" onClick={() => setReassignModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={isSubmitting}>
              Transfer All Tickets
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
