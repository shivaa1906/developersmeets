'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { apiClient } from '@/lib/api-client';
import {
  LifeBuoy,
  ShieldCheck,
  Send,
  Paperclip,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowLeft,
  Lock,
  User,
  ExternalLink,
  MessageSquare,
  FileText,
  AlertCircle,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface BridgeMember {
  role: string;
  user_id: string;
  display_role: string;
}

interface BridgeMessage {
  id: string;
  senderId: string;
  senderDisplayName: string;
  message: string;
  messageType: string;
  attachmentUrl?: string;
  createdAt: string;
  isMe: boolean;
}

interface BridgeData {
  id: string;
  bridgeNumber: string;
  ticketId: string;
  ticketNumber: string;
  subject: string;
  ticketStatus: string;
  priority: string;
  category: string;
  attachments?: any[];
  projectTitle: string;
  conversationId: string;
  createdAt: string;
  closedAt?: string;
  internalNotes?: string;
  createdByUid?: string;
  created_by_uid?: string;
  createdByRole?: string;
  created_by_role?: string;
  createdByName?: string;
  created_by_name?: string;
}

export default function SupportBridgePage() {
  const params = useParams();
  const router = useRouter();
  const ticketOrBridgeId = params.id as string;

  const { user } = useAuth();
  const { addToast } = useToast();
  const { subscribe, sendTyping } = useRealtime();

  const [bridge, setBridge] = React.useState<BridgeData | null>(null);
  const [members, setMembers] = React.useState<BridgeMember[]>([]);
  const [messages, setMessages] = React.useState<BridgeMessage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [messageText, setMessageText] = React.useState('');
  const [statusUpdating, setStatusUpdating] = React.useState(false);

  // Escalation state
  const [escalateModalOpen, setEscalateModalOpen] = React.useState(false);
  const [escalateReason, setEscalateReason] = React.useState('');
  const [escalateLevel, setEscalateLevel] = React.useState('L2_SUPPORT');
  const [escalating, setEscalating] = React.useState(false);

  // Attachments
  const [attachmentName, setAttachmentName] = React.useState('');
  const [isUploadingAttachment, setIsUploadingAttachment] = React.useState(false);

  // Internal Notes (Staff only)
  const [internalNotes, setInternalNotes] = React.useState('');
  const [savingNotes, setSavingNotes] = React.useState(false);

  // Typing state
  const [partnerTyping, setPartnerTyping] = React.useState<string | null>(null);
  const typingTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const isStaff = ['CEO', 'MD', 'ADMIN', 'SUPPORT'].includes(user?.role || '');
  const isClient = user?.role === 'CLIENT';

  const fetchBridgeData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{
        bridge: BridgeData;
        members: BridgeMember[];
        messages: BridgeMessage[];
      }>(`/support/bridges/${ticketOrBridgeId}`);

      setBridge(res.bridge);
      setMembers(res.members || []);
      setMessages(res.messages || []);
      if (res.bridge.internalNotes) {
        setInternalNotes(res.bridge.internalNotes);
      }
      setError(null);
    } catch (err: any) {
      const msg = err.message || 'Unable to open support bridge.';
      setError(msg);
      addToast('error', 'Access Denied or Not Found', msg);
    } finally {
      setLoading(false);
    }
  }, [ticketOrBridgeId, addToast]);

  React.useEffect(() => {
    fetchBridgeData();
  }, [fetchBridgeData]);

  // Realtime subscription
  React.useEffect(() => {
    if (!bridge?.id) return;

    const channel = `support:${bridge.id}`;
    const unsubscribe = subscribe(channel, (event: any) => {
      if (event.event === 'support:update') {
        const payload = event.data;
        if (payload.type === 'TICKET_STATUS_UPDATED') {
          setBridge((prev) => (prev ? { ...prev, ticketStatus: payload.payload.status } : null));
          addToast('info', 'Status Updated', `Support ticket status changed to ${payload.payload.status}`);
        } else if (payload.type === 'TICKET_ATTACHMENT_ADDED') {
          setBridge((prev) =>
            prev ? { ...prev, attachments: [...(prev.attachments || []), payload.payload] } : null
          );
          addToast('info', 'New Attachment', `File "${payload.payload.fileName}" was attached to ticket.`);
        }
      } else if (event.type === 'typing') {
        if (event.userId !== user?.id) {
          setPartnerTyping(event.displayName || 'Participant');
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          typingTimerRef.current = setTimeout(() => {
            setPartnerTyping(null);
          }, 5000);
        }
      }
    });

    // Also subscribe to conversation channel if available
    let convUnsub: (() => void) | null = null;
    if (bridge.conversationId) {
      convUnsub = subscribe(`chat:${bridge.conversationId}`, (event: any) => {
        if (event.event === 'chat:message') {
          const msg = event.data;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [
              ...prev,
              {
                id: msg.id,
                senderId: msg.senderId,
                senderDisplayName: msg.senderDisplayName,
                message: msg.message,
                messageType: msg.messageType || 'TEXT',
                attachmentUrl: msg.attachmentUrl,
                createdAt: msg.createdAt,
                isMe: msg.senderId === user?.id,
              },
            ];
          });
        }
      });
    }

    return () => {
      unsubscribe();
      if (convUnsub) convUnsub();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [bridge?.id, bridge?.conversationId, subscribe, user?.id, addToast]);

  // Scroll to bottom on messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !bridge?.id) return;

    if (bridge.ticketStatus === 'CLOSED') {
      addToast('error', 'Chat Closed', 'This support ticket is closed and cannot receive new messages.');
      return;
    }

    setSending(true);
    try {
      await apiClient.post(`/support/bridges/${bridge.id}/messages`, {
        message: messageText.trim(),
      });
      setMessageText('');
      // Optimistically fetch or wait for realtime
      await fetchBridgeData();
    } catch (err: any) {
      addToast('error', 'Send Failed', err.message || 'Unable to transmit message.');
    } finally {
      setSending(false);
    }
  };

  const handleTyping = () => {
    if (!bridge?.id) return;
    sendTyping(`support:${bridge.id}`, true);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!bridge?.ticketId) return;
    setStatusUpdating(true);
    try {
      await apiClient.patch(`/support/tickets/${bridge.ticketId}/status`, { status: newStatus });
      addToast('success', 'Status Updated', `Ticket status transitioned to ${newStatus}.`);
      setBridge((prev) => (prev ? { ...prev, ticketStatus: newStatus } : null));
    } catch (err: any) {
      addToast('error', 'Status Update Failed', err.message || 'Unable to update ticket status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleUploadAttachment = async () => {
    if (!attachmentName.trim() || !bridge?.ticketId) return;

    const lower = attachmentName.toLowerCase();
    const ext = lower.slice(lower.lastIndexOf('.'));
    const dangerous = ['.exe', '.sh', '.bat', '.cmd', '.msi', '.bin', '.js', '.py'];
    if (dangerous.includes(ext)) {
      addToast('error', 'Upload Prohibited', `Executable file extensions ('${ext}') are blocked.`);
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const res = await apiClient.post<{ attachment: any }>(
        `/support/tickets/${bridge.ticketId}/attachments`,
        {
          fileName: attachmentName.trim(),
          fileUrl: `/uploads/${attachmentName.trim()}`,
          fileSize: 1024 * 64,
          mimeType: 'application/pdf',
        }
      );
      addToast('success', 'Attachment Uploaded', `File "${res.attachment.fileName}" attached.`);
      setAttachmentName('');
      setBridge((prev) =>
        prev ? { ...prev, attachments: [...(prev.attachments || []), res.attachment] } : null
      );
    } catch (err: any) {
      addToast('error', 'Attachment Failed', err.message || 'Unable to upload attachment.');
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!bridge?.ticketId) return;
    setSavingNotes(true);
    try {
      await apiClient.patch(`/support/tickets/${bridge.ticketId}/notes`, { notes: internalNotes });
      addToast('success', 'Notes Saved', 'Internal support notes updated.');
    } catch (err: any) {
      addToast('error', 'Save Failed', err.message || 'Unable to save internal notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bridge?.ticketId || !escalateReason.trim()) return;

    setEscalating(true);
    try {
      await apiClient.post(`/support/tickets/${bridge.ticketId}/escalate`, {
        reason: escalateReason.trim(),
        escalationLevel: escalateLevel,
      });
      addToast('success', 'Ticket Escalated', `Ticket escalated to ${escalateLevel}.`);
      setEscalateModalOpen(false);
      setEscalateReason('');
      await fetchBridgeData();
    } catch (err: any) {
      addToast('error', 'Escalation Failed', err.message || 'Unable to escalate ticket.');
    } finally {
      setEscalating(false);
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

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="h-8 w-8 text-accent animate-spin mx-auto" />
        <div className="text-xs text-muted">Connecting to secure Support Bridge...</div>
      </div>
    );
  }

  if (error || !bridge) {
    return (
      <div className="py-24 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-status-danger mx-auto" />
        <h2 className="text-base font-semibold text-foreground">Support Bridge Unavailable</h2>
        <p className="text-xs text-muted max-w-sm mx-auto">
          {error?.includes('Failed to fetch')
            ? 'Unable to connect to the support service. Please verify the backend is running and retry.'
            : error || 'The requested support bridge does not exist or you do not have permission to view it.'}
        </p>
        <div className="flex items-center justify-center space-x-2">
          <Button size="sm" onClick={() => fetchBridgeData()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Retry Connection
          </Button>
          <Link href="/dashboard/support">
            <Button size="sm" variant="secondary" leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}>
              Back to Support Tickets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isClosed = bridge.ticketStatus === 'CLOSED';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Link
              href="/dashboard/support"
              className="text-xs text-muted hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Support</span>
            </Link>
            <span className="text-muted text-xs">/</span>
            <span className="font-mono text-xs font-bold text-accent">{bridge.ticketNumber}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{bridge.subject}</h1>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {getStatusBadge(bridge.ticketStatus)}
            <Badge variant="outline" className="border-accent/30 text-accent text-[10px]">
              {bridge.priority} PRIORITY
            </Badge>
            <Badge variant="outline" className="border-border text-muted text-[10px]">
              {bridge.category || 'TECHNICAL'}
            </Badge>
            <span className="text-xs text-muted">
              Project: <strong className="text-foreground">{bridge.projectTitle}</strong>
            </span>
          </div>
        </div>

        {/* State Transition Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Client Resolution Confirmation */}
          {isClient && bridge.ticketStatus === 'RESOLVED' && (
            <Button
              size="sm"
              variant="outline"
              className="border-status-success/50 text-status-success hover:bg-status-success/10"
              onClick={() => handleStatusChange('CLOSED')}
              isLoading={statusUpdating}
              leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
            >
              Confirm Resolution & Close
            </Button>
          )}

          {/* Staff Status Dropdown */}
          {isStaff && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted hidden sm:inline">Set Status:</span>
              <Select
                value={bridge.ticketStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="text-xs w-40"
                disabled={statusUpdating}
              >
                <option value="OPEN">OPEN</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="INVESTIGATING">INVESTIGATING</option>
                <option value="WAITING_FOR_CLIENT">WAITING FOR CLIENT</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </Select>

              <Button
                size="sm"
                variant="outline"
                className="border-status-warning/40 text-status-warning hover:bg-status-warning/10"
                onClick={() => setEscalateModalOpen(true)}
                leftIcon={<TrendingUp className="h-3.5 w-3.5" />}
              >
                Escalate
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Support Ticket Identity Governance */}
      <div className="rounded-lg border border-border bg-surface/50 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">Ticket Identity</div>
            <div className="font-mono text-xs font-bold text-accent">{bridge.ticketNumber}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">Created by</div>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="font-mono text-xs text-foreground bg-surface px-2 py-0.5 rounded border border-border">
                UID: {bridge.createdByUid || bridge.created_by_uid || 'Platform User'}
              </span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">Role</div>
            <Badge variant="outline" className="mt-0.5 text-[10px] font-mono border-accent/40 text-accent">
              {bridge.createdByRole || bridge.created_by_role || (isClient ? 'CLIENT' : 'DEVELOPER')}
            </Badge>
          </div>

          <div>
            <div className="text-[10px] text-muted uppercase tracking-wider font-semibold">Mediated Identity</div>
            <div className="text-xs text-foreground mt-0.5 font-medium">
              {bridge.createdByName || bridge.created_by_name || (isClient ? 'Client #001' : 'Technical Developer')}
            </div>
          </div>
        </div>
      </div>

      {/* Identity Shielding & Scope Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Privacy Shield */}
        <div className="p-3.5 rounded-lg border border-accent/30 bg-accent/5 flex items-start space-x-3">
          <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-accent">Tripartite Shielded Bridge</div>
            <p className="text-muted leading-relaxed">
              Participants appear with identity tags (Client #001, Technical Developer, Support Agent). Personal contact credentials are systematically redacted.
            </p>
          </div>
        </div>

        {/* Scope Guard */}
        <div className="p-3.5 rounded-lg border border-status-warning/30 bg-status-warning/5 flex items-start space-x-3">
          <div className="h-8 w-8 rounded-lg bg-status-warning/10 border border-status-warning/20 flex items-center justify-center text-status-warning shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="text-xs space-y-0.5">
            <div className="font-semibold text-status-warning">Maintenance Scope Guard</div>
            <p className="text-muted leading-relaxed">
              Assistance is limited to defect resolution and post-delivery maintenance.{' '}
              <Link href="/dashboard/projects" className="underline text-foreground">
                Commission a new project
              </Link>{' '}
              for new feature additions.
            </p>
          </div>
        </div>
      </div>

      {/* Main Bridge Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Stream (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="flex flex-col h-[560px]">
            <CardHeader className="py-3 px-4 border-b border-border bg-surface/60 flex flex-row items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-4 w-4 text-accent" />
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {bridge.bridgeNumber || 'Support Bridge Live Chat'}
                </CardTitle>
              </div>
              <span className="flex items-center space-x-1 text-[10px] text-muted font-mono">
                <span className="h-2 w-2 rounded-full bg-status-success animate-pulse" />
                <span>REALTIME ACTIVE</span>
              </span>
            </CardHeader>

            {/* Messages Feed */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#060606]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-muted">
                  <LifeBuoy className="h-8 w-8 text-muted mb-2" />
                  <span>No messages in this support bridge yet.</span>
                  <span className="text-[10px] mt-1">Initiate conversation below to begin troubleshooting.</span>
                </div>
              ) : (
                messages.map((msg) => {
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center space-x-1.5 text-[10px] text-muted mb-1 px-1">
                        <span className="font-semibold text-foreground">{msg.senderDisplayName}</span>
                        <span>•</span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`max-w-[85%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                          msg.isMe
                            ? 'bg-accent/15 text-foreground border border-accent/30'
                            : 'bg-surface text-foreground border border-border'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                        {msg.attachmentUrl && (
                          <div className="mt-2 pt-2 border-t border-border/50 flex items-center space-x-1.5 text-[10px] text-accent">
                            <Paperclip className="h-3 w-3" />
                            <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline truncate">
                              {msg.attachmentUrl.split('/').pop()}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator */}
            {partnerTyping && (
              <div className="px-4 py-1 text-[11px] text-muted italic bg-surface/40 flex items-center space-x-1">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                <span>{partnerTyping} is typing...</span>
              </div>
            )}

            {/* Message Composer */}
            <div className="p-3 border-t border-border bg-surface/50">
              {isClosed ? (
                <div className="p-2 text-center text-xs text-muted flex items-center justify-center gap-1.5 bg-surface rounded">
                  <Lock className="h-3.5 w-3.5 text-muted" />
                  <span>This support ticket has been closed. Conversation is sealed.</span>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                  <Input
                    placeholder="Type technical message to bridge..."
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      handleTyping();
                    }}
                    disabled={sending}
                    className="text-xs flex-1"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    isLoading={sending}
                    disabled={!messageText.trim()}
                    rightIcon={<Send className="h-3.5 w-3.5" />}
                  >
                    Send
                  </Button>
                </form>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar: Details, Attachments & Internal Notes (1 Col) */}
        <div className="space-y-4">
          {/* Bridge Members */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted">
                Bridge Participants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {members.length === 0 ? (
                <div className="text-muted text-[11px]">Loading participants...</div>
              ) : (
                members.map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-surface/40 border border-border">
                    <div className="flex items-center space-x-2">
                      <div className="h-6 w-6 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                        {m.display_role.slice(0, 1)}
                      </div>
                      <span className="font-medium text-foreground">{m.display_role}</span>
                    </div>
                    <Badge variant="outline" className="text-[9px] uppercase border-border text-muted">
                      {m.role}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Ticket Attachments */}
          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Attachments & Logs
                </CardTitle>
                <Paperclip className="h-3.5 w-3.5 text-muted" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {(!bridge.attachments || bridge.attachments.length === 0) ? (
                <p className="text-muted text-[11px]">No files attached to this ticket.</p>
              ) : (
                <div className="space-y-2">
                  {bridge.attachments.map((att: any, i: number) => (
                    <div
                      key={att.id || i}
                      className="p-2 rounded border border-border bg-surface/40 flex items-center justify-between"
                    >
                      <div className="truncate flex-1 pr-2">
                        <p className="font-mono text-xs text-foreground truncate">{att.fileName}</p>
                        <p className="text-[10px] text-muted">
                          {att.fileSize ? `${Math.round(att.fileSize / 1024)} KB` : 'Attached file'}
                        </p>
                      </div>
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline text-[11px] shrink-0"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {!isClosed && (
                <div className="pt-2 border-t border-border/60 space-y-2">
                  <Input
                    placeholder="Attach file (e.g. log.txt)..."
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                    className="text-xs font-mono"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    onClick={handleUploadAttachment}
                    isLoading={isUploadingAttachment}
                    disabled={!attachmentName.trim()}
                  >
                    Upload Attachment
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Internal Notes (Staff only) */}
          {isStaff && (
            <Card className="border-status-warning/40 bg-status-warning/5">
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-status-warning">
                    Internal Staff Notes
                  </CardTitle>
                  <Lock className="h-3.5 w-3.5 text-status-warning" />
                </div>
                <CardDescription className="text-[10px] text-muted">
                  Strictly hidden from clients and technical developers. Visible only to Support and Leadership.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Record internal troubleshooting notes, escalation logs, or triage details..."
                  className="text-xs min-h-[90px] bg-background/50"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-status-warning/50 text-status-warning hover:bg-status-warning/10 text-xs"
                  onClick={handleSaveNotes}
                  isLoading={savingNotes}
                >
                  Save Internal Notes
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Escalation Modal */}
      <Dialog
        isOpen={escalateModalOpen}
        onClose={() => setEscalateModalOpen(false)}
        title="Escalate Support Ticket"
      >
        <form onSubmit={handleEscalateSubmit} className="space-y-4">
          <div className="p-3 rounded-lg border border-status-warning/30 bg-status-warning/5 text-xs text-muted space-y-1">
            <span className="font-semibold text-status-warning">Formal Escalation Protocol</span>
            <p>
              Escalation flags this ticket as high-priority, transitions the status to INVESTIGATING, and notifies senior leadership and engineering staff.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Target Escalation Tier</label>
            <Select
              value={escalateLevel}
              onChange={(e) => setEscalateLevel(e.target.value)}
              className="text-xs"
            >
              <option value="L2_SUPPORT">L2 Senior Support</option>
              <option value="SUPPORT_LEAD">Support Lead / Manager</option>
              <option value="TECHNICAL_DEVELOPER">Original Technical Developer</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Reason for Escalation</label>
            <Textarea
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
              placeholder="State the underlying technical blockers, client urgency, or reason why standard support is insufficient..."
              className="text-xs min-h-[90px]"
              required
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2">
            <Button size="sm" variant="secondary" type="button" onClick={() => setEscalateModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" isLoading={escalating}>
              Confirm Escalation
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
