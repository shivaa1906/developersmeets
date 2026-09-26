'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  Search,
  Clock,
  UserCheck,
  AlertCircle,
  FileText,
  ArrowRight,
  ExternalLink,
  Users,
  LifeBuoy,
} from 'lucide-react';

interface TicketRow {
  id: string;
  ticket_number: string;
  project_title: string;
  client_number?: string;
  clientIdentity?: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assigned_to_user_id?: string;
  assigned_agent_email?: string;
  supportAgent?: string;
  created_at: string;
  created_by_uid?: string;
  createdByUid?: string;
  created_by_role?: string;
  createdByRole?: string;
  created_by_name?: string;
  createdByName?: string;
}

export default function AdminSupportPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tickets, setTickets] = React.useState<TicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('ALL');
  const [priorityFilter, setPriorityFilter] = React.useState('ALL');
  const [assignedFilter, setAssignedFilter] = React.useState('ALL');

  const fetchTickets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (searchQuery.trim()) q.set('search', searchQuery.trim());
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (priorityFilter !== 'ALL') q.set('priority', priorityFilter);
      if (assignedFilter === 'me') q.set('assigned', 'me');
      if (assignedFilter === 'unassigned') q.set('assigned', 'unassigned');

      const res = await apiClient.get<{ tickets: TicketRow[] }>(`/support/tickets?${q.toString()}`);
      setTickets(res.tickets || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Unable to load tickets.');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, priorityFilter, assignedFilter]);

  React.useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await apiClient.patch(`/support/tickets/${id}/status`, { status: newStatus });
      addToast('success', 'Status Updated', `Ticket transitioned to ${newStatus}.`);
      await fetchTickets();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Unable to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssignToMe = async (id: string, ticketNumber: string) => {
    setUpdatingId(id);
    try {
      await apiClient.post(`/support/tickets/${id}/assign`, {});
      addToast('success', 'Ticket Assigned', `You are now assigned to ticket ${ticketNumber}.`);
      await fetchTickets();
    } catch (err: any) {
      addToast('error', 'Assignment Failed', err.message || 'Unable to assign ticket.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openTickets = tickets.filter((t) => t.status === 'OPEN').length;
  const unassignedTickets = tickets.filter((t) => !t.assigned_to_user_id).length;
  const assignedToMe = tickets.filter((t) => t.assigned_to_user_id === user?.id).length;
  const waitingForClient = tickets.filter((t) => t.status === 'WAITING_FOR_CLIENT').length;
  const urgentCount = tickets.filter((t) => t.priority === 'URGENT' || t.priority === 'HIGH').length;
  const resolvedCount = tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Post-Completion Support Management</h1>
          <p className="text-xs text-muted mt-1">
            Executive control and technical mediation of tripartite support bridges for completed projects.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={fetchTickets}
          leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-border pb-3">
        <Link href="/admin/support">
          <Button size="sm" variant="default" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
            Tickets Queue
          </Button>
        </Link>
        <Link href="/admin/support/staff">
          <Button size="sm" variant="outline" leftIcon={<Users className="h-3.5 w-3.5" />}>
            Support Staff & Workload
          </Button>
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <span className="text-[11px] text-muted">Open</span>
          <div className="text-lg font-bold font-mono text-status-info mt-1">{openTickets}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <span className="text-[11px] text-muted">Unassigned</span>
          <div className="text-lg font-bold font-mono text-status-warning mt-1">{unassignedTickets}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <span className="text-[11px] text-muted">Assigned to Me</span>
          <div className="text-lg font-bold font-mono text-accent mt-1">{assignedToMe}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <span className="text-[11px] text-muted">Awaiting Client</span>
          <div className="text-lg font-bold font-mono text-muted mt-1">{waitingForClient}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <span className="text-[11px] text-muted">Urgent / High</span>
          <div className="text-lg font-bold font-mono text-status-danger mt-1">{urgentCount}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-3">
          <span className="text-[11px] text-muted">Resolved</span>
          <div className="text-lg font-bold font-mono text-status-success mt-1">{resolvedCount}</div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
          <Input
            placeholder="Search tickets by number, subject, or project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs w-36"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">OPEN</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="INVESTIGATING">INVESTIGATING</option>
            <option value="WAITING_FOR_CLIENT">WAITING FOR CLIENT</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </Select>

          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs w-32"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">URGENT</option>
            <option value="HIGH">HIGH</option>
            <option value="NORMAL">NORMAL</option>
            <option value="LOW">LOW</option>
          </Select>

          <Select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="text-xs w-36"
          >
            <option value="ALL">All Assignments</option>
            <option value="me">Assigned to Me</option>
            <option value="unassigned">Unassigned</option>
          </Select>
        </div>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Support Bridges & Tickets</CardTitle>
            <div className="flex items-center space-x-1.5 text-xs text-accent font-mono bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Identity Shielded</span>
            </div>
          </div>
          <CardDescription className="text-xs">
            Executive and support agents act as technical mediators without exposing client personal contact information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-xs text-muted flex flex-col items-center justify-center space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <span>Loading support tickets...</span>
            </div>
          ) : error ? (
            <div className="py-12 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-status-danger mx-auto" />
              <div className="text-sm font-semibold text-foreground">Unable to load support queue</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                {error.includes('Failed to fetch')
                  ? 'Unable to connect to the support service. Please verify the backend is running and retry.'
                  : error}
              </p>
              <Button size="sm" onClick={() => fetchTickets()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                Retry
              </Button>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No support tickets match the filters.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned Agent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      <Link href={`/dashboard/support/${t.id}`} className="hover:text-accent underline">
                        {t.ticket_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-col space-y-0.5">
                        <span className="font-mono text-[11px] text-accent font-semibold">
                          UID: {t.createdByUid || t.created_by_uid || 'N/A'}
                        </span>
                        <span className="text-[10px] text-muted">
                          {t.createdByRole || t.created_by_role || 'CLIENT'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted truncate max-w-[140px]">{t.project_title}</TableCell>
                    <TableCell className="text-xs text-muted max-w-xs truncate">{t.subject}</TableCell>
                    <TableCell>
                      <Badge
                        variant={t.priority === 'URGENT' || t.priority === 'HIGH' ? 'danger' : 'outline'}
                        size="sm"
                      >
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={t.status}
                        onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                        className="text-[11px] h-7 w-32"
                        disabled={updatingId === t.id}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="ASSIGNED">ASSIGNED</option>
                        <option value="INVESTIGATING">INVESTIGATING</option>
                        <option value="WAITING_FOR_CLIENT">WAITING CLIENT</option>
                        <option value="IN_PROGRESS">IN PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.assigned_to_user_id ? (
                        <span className="text-foreground font-mono text-[11px]">
                          {t.assigned_to_user_id === user?.id ? 'Assigned to You' : 'Support Agent'}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px]"
                          onClick={() => handleAssignToMe(t.id, t.ticket_number)}
                          isLoading={updatingId === t.id}
                        >
                          Assign to Me
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/support/${t.id}`}>
                        <Button size="sm" variant="secondary" className="h-7 text-xs">
                          Open Bridge
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
