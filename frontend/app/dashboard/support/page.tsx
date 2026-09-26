'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import {
  LifeBuoy,
  Plus,
  Search,
  Filter,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
  FileText,
  Paperclip,
  ExternalLink,
} from 'lucide-react';

interface SupportTicket {
  id: string;
  ticket_number: string;
  project_id: string;
  project_title: string;
  subject: string;
  description: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'ASSIGNED' | 'INVESTIGATING' | 'WAITING_FOR_CLIENT' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  category: string;
  attachments?: any[];
  assigned_to_user_id?: string;
  supportAgent?: string;
  created_at: string;
  updated_at: string;
  bridge_id?: string;
  bridge_number?: string;
}

interface ProjectOption {
  id: string;
  title: string;
  project_number?: string;
  status: string;
}

export default function DashboardSupportPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [projects, setProjects] = React.useState<ProjectOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('ALL');
  const [priorityFilter, setPriorityFilter] = React.useState('ALL');

  // Form State
  const [selectedProjectId, setSelectedProjectId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState('NORMAL');
  const [category, setCategory] = React.useState('TECHNICAL');
  const [attachmentName, setAttachmentName] = React.useState('');

  const isClient = user?.role === 'CLIENT';
  const canCreateTicket = Boolean(user);

  const fetchTickets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery.trim()) queryParams.set('search', searchQuery.trim());
      if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
      if (priorityFilter !== 'ALL') queryParams.set('priority', priorityFilter);

      const res = await apiClient.get<{ tickets: SupportTicket[] }>(
        `/support/tickets?${queryParams.toString()}`
      );
      setTickets(res.tickets || []);
      setError(null);
    } catch (err: any) {
      const msg = err.message || 'Unable to load tickets.';
      setError(msg);
      addToast('error', 'Fetch Error', msg);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, priorityFilter, addToast]);

  const fetchProjects = React.useCallback(async () => {
    try {
      let res: any;
      try {
        res = await apiClient.get<{ projects: ProjectOption[] }>('/projects/my-projects');
      } catch (_e) {
        res = await apiClient.get<{ projects: ProjectOption[] }>('/projects/my');
      }
      setProjects(res.projects || []);
      if (res.projects?.length > 0) {
        setSelectedProjectId((prev) => prev || res.projects[0].id);
      }
    } catch (_e) {
      setProjects([]);
    }
  }, []);

  React.useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  React.useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Handle URL actions (e.g. ?action=create&projectId=xyz)
  React.useEffect(() => {
    const action = searchParams.get('action');
    const pId = searchParams.get('projectId');
    if (pId) {
      setSelectedProjectId(pId);
    }
    if (action === 'create') {
      setCreateModalOpen(true);
    }
  }, [searchParams]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isClient && !selectedProjectId) {
      addToast('error', 'Validation Error', 'Please select an associated project.');
      return;
    }
    if (!subject.trim()) {
      addToast('error', 'Validation Error', 'Please enter a ticket subject.');
      return;
    }
    if (!description.trim()) {
      addToast('error', 'Validation Error', 'Please provide a detailed description.');
      return;
    }

    setIsSubmitting(true);
    try {
      const attachmentsPayload: any[] = [];
      if (attachmentName.trim()) {
        const lower = attachmentName.toLowerCase();
        const ext = lower.slice(lower.lastIndexOf('.'));
        const dangerous = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.bin', '.js', '.py'];
        if (dangerous.includes(ext)) {
          throw new Error(`Upload of executable file '${ext}' is prohibited.`);
        }
        attachmentsPayload.push({
          name: attachmentName.trim(),
          fileUrl: `/uploads/${attachmentName.trim()}`,
          size: 1024 * 128,
          mimeType: 'application/pdf',
        });
      }

      const res = await apiClient.post<{ ticket: SupportTicket }>('/support/tickets', {
        projectId: selectedProjectId,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        category,
        attachments: attachmentsPayload,
      });

      addToast(
        'success',
        'Support Ticket Created',
        `Ticket ${res.ticket?.ticket_number || ''} opened successfully with dedicated Support Bridge.`
      );

      setCreateModalOpen(false);
      setSubject('');
      setDescription('');
      setAttachmentName('');
      await fetchTickets();
    } catch (err: any) {
      addToast('error', 'Creation Failed', err.message || 'Unable to open support ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <Badge variant="outline" className="border-status-info/50 text-status-info bg-status-info/10">OPEN</Badge>;
      case 'ASSIGNED':
        return <Badge variant="outline" className="border-accent/50 text-accent bg-accent/10">ASSIGNED</Badge>;
      case 'INVESTIGATING':
        return <Badge variant="outline" className="border-status-warning/50 text-status-warning bg-status-warning/10">INVESTIGATING</Badge>;
      case 'WAITING_FOR_CLIENT':
        return <Badge variant="outline" className="border-status-warning/70 text-status-warning bg-status-warning/20">AWAITING CLIENT</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="outline" className="border-status-info/70 text-status-info bg-status-info/20">IN PROGRESS</Badge>;
      case 'RESOLVED':
        return <Badge variant="outline" className="border-status-success/50 text-status-success bg-status-success/10">RESOLVED</Badge>;
      case 'CLOSED':
        return <Badge variant="outline" className="border-border text-muted bg-surface">CLOSED</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <Badge variant="outline" className="border-status-danger/40 text-status-danger">URGENT</Badge>;
      case 'HIGH':
        return <Badge variant="outline" className="border-status-warning/40 text-status-warning">HIGH</Badge>;
      case 'NORMAL':
        return <Badge variant="outline" className="border-accent/40 text-accent">NORMAL</Badge>;
      case 'LOW':
        return <Badge variant="outline" className="border-border text-muted">LOW</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const totalCount = tickets.length;
  const activeCount = tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)).length;
  const waitingCount = tickets.filter((t) => t.status === 'WAITING_FOR_CLIENT').length;
  const resolvedCount = tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Support & Technical Bridges</h1>
            <Badge variant="outline" className="text-accent border-accent/30 bg-accent/10 text-[10px]">
              <ShieldCheck className="h-3 w-3 mr-1 inline" />
              Shielded
            </Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            Post-delivery assistance and technical mediation for completed and active engineering projects.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={fetchTickets}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          {canCreateTicket && (
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              leftIcon={<Plus className="h-3.5 w-3.5" />}
            >
              New Support Ticket
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Total Tickets</span>
            <FileText className="h-4 w-4 text-muted" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground mt-2">{totalCount}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Active Bridges</span>
            <Clock className="h-4 w-4 text-accent" />
          </div>
          <div className="text-2xl font-bold font-mono text-accent mt-2">{activeCount}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Awaiting Action</span>
            <AlertCircle className="h-4 w-4 text-status-warning" />
          </div>
          <div className="text-2xl font-bold font-mono text-status-warning mt-2">{waitingCount}</div>
        </div>

        <div className="rounded-lg border border-border bg-surface/50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Resolved / Closed</span>
            <CheckCircle2 className="h-4 w-4 text-status-success" />
          </div>
          <div className="text-2xl font-bold font-mono text-status-success mt-2">{resolvedCount}</div>
        </div>
      </div>

      {/* Filters Bar */}
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

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs w-36"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="WAITING_FOR_CLIENT">Awaiting Client</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>

          <Select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs w-32"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </Select>
        </div>
      </div>

      {/* Tickets List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Support Tickets</CardTitle>
          <CardDescription className="text-xs">
            Directly mediated support channels. Each ticket features an isolated tripartite bridge.
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
              <div className="text-sm font-semibold text-foreground">Unable to load support tickets</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                {error.includes('Authentication required') || error.includes('token')
                  ? 'Your session requires authentication. Please sign in with your account to access support tickets.'
                  : error.includes('Failed to fetch')
                  ? 'Unable to connect to the support service. Please verify the backend is running and retry.'
                  : error}
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button size="sm" onClick={() => fetchTickets()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Retry
                </Button>
                {(error.includes('Authentication required') || error.includes('token')) && (
                  <Link href={`/login?redirect=${encodeURIComponent('/dashboard/support')}`}>
                    <Button size="sm" variant="outline">
                      Sign In to Platform
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <LifeBuoy className="h-10 w-10 text-muted mx-auto" />
              <div className="text-sm font-semibold text-foreground">No support tickets found</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Need technical assistance or post-delivery warranty support on a project? Open a ticket below.
              </p>
              {canCreateTicket && (
                <Button size="sm" onClick={() => setCreateModalOpen(true)} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                  Create Support Ticket
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-lg border border-border bg-surface/40 p-4 hover:border-accent/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-accent">{ticket.ticket_number}</span>
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                      <Badge variant="outline" className="text-[10px] text-muted border-border">
                        {ticket.category || 'TECHNICAL'}
                      </Badge>
                    </div>

                    <h3 className="text-sm font-semibold text-foreground truncate">{ticket.subject}</h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>Project: <strong className="text-foreground">{ticket.project_title}</strong></span>
                      <span>•</span>
                      <span>Assigned: <strong className="text-foreground">{ticket.supportAgent || 'Support Agent'}</strong></span>
                      <span>•</span>
                      <span>Opened: {new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <Link href={`/dashboard/support/${ticket.id}`}>
                      <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                        Open Bridge
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Modal */}
      <Dialog
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Open Support Ticket"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div className="p-3 rounded-lg border border-status-warning/30 bg-status-warning/5 text-xs text-muted space-y-1">
            <div className="flex items-center space-x-1.5 font-semibold text-status-warning">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>Post-Delivery Support Notice</span>
            </div>
            <p>
              Support is dedicated to bug fixes, integration queries, and defect resolution. To commission new features or major upgrades, please{' '}
              <Link href="/dashboard/projects" className="underline text-foreground">
                start a new project
              </Link>.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Associated Project</label>
            <Select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="text-xs"
              required={isClient}
            >
              {!isClient && (
                <option value="">General Platform / Account Support (No Project)</option>
              )}
              {projects.length === 0 ? (
                isClient ? (
                  <option value="">No projects found on this account</option>
                ) : null
              ) : (
                <>
                  {isClient && <option value="">Select project...</option>}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.status})
                    </option>
                  ))}
                </>
              )}
            </Select>
            {projects.length === 0 && isClient && (
              <p className="text-[11px] text-muted">
                Client tickets are linked to projects. Please submit a project first or contact sales.
              </p>
            )}
            {!isClient && (
              <p className="text-[11px] text-muted">
                Select an assigned project for tripartite project support, or leave unselected for platform/credit assistance.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Category</label>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="text-xs"
              >
                <option value="TECHNICAL">Technical & Codebase</option>
                <option value="BUG">Defect / Bug Report</option>
                <option value="DEPLOYMENT">Deployment & Hosting</option>
                <option value="PAYMENTS">Payments & Invoicing</option>
                <option value="BILLING">Billing & Escrow</option>
                <option value="CREDITS">Platform Credits</option>
                <option value="PROJECT">Project Scoping & Delivery</option>
                <option value="ACCOUNT">Account & Security</option>
                <option value="SECURITY">Security Vulnerability</option>
                <option value="COMMUNITY">Developer Community</option>
                <option value="OTHER">Other / General Inquiry</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Priority</label>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="text-xs"
              >
                <option value="NORMAL">Normal (&lt; 24h SLA)</option>
                <option value="HIGH">High (&lt; 6h SLA)</option>
                <option value="URGENT">Urgent (&lt; 2h SLA)</option>
                <option value="LOW">Low (&lt; 48h SLA)</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Subject</label>
            <Input
              placeholder="Brief summary of the technical inquiry..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Description</label>
            <Textarea
              placeholder="Describe the defect, steps to reproduce, or technical assistance required..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs min-h-[100px]"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5 text-muted" />
              <span>Attachment / Log Filename (Optional)</span>
            </label>
            <Input
              placeholder="e.g. error_log.txt or screenshot.png"
              value={attachmentName}
              onChange={(e) => setAttachmentName(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" isLoading={isSubmitting}>
              Open Ticket
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
