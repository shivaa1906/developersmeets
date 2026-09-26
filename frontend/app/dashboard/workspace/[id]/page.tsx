'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  UploadCloud,
  ListTodo,
  FolderLock,
  CreditCard,
  LifeBuoy,
  History,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

export default function ProjectWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const { user } = useAuth();
  const { addToast } = useToast();

  const [workspace, setWorkspace] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('overview');

  // Milestone action modals
  const [selectedMilestone, setSelectedMilestone] = React.useState<any | null>(null);
  const [milestoneAction, setMilestoneAction] = React.useState<'SUBMIT' | 'APPROVE' | 'CHANGES' | null>(null);
  const [actionNotes, setActionNotes] = React.useState('');
  const [isUpdatingMilestone, setIsUpdatingMilestone] = React.useState(false);

  // File upload state
  const [showUploadModal, setShowUploadModal] = React.useState(false);
  const [uploadForm, setUploadForm] = React.useState({
    fileName: '',
    fileUrl: '',
    fileSize: 1048576,
    mimeType: 'application/pdf',
  });
  const [isUploadingFile, setIsUploadingFile] = React.useState(false);

  // Task creation state
  const [showTaskModal, setShowTaskModal] = React.useState(false);
  const [taskForm, setTaskForm] = React.useState({
    title: '',
    description: '',
  });
  const [isCreatingTask, setIsCreatingTask] = React.useState(false);

  const fetchWorkspace = React.useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ workspace: any }>(`/workspace/${projectId}`);
      setWorkspace(res.workspace);
    } catch (err: any) {
      addToast('error', 'Access Error', err.message || 'Unable to access project workspace.');
      router.push('/dashboard/projects');
    } finally {
      setLoading(false);
    }
  }, [projectId, router, addToast]);

  React.useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const handleMilestoneTransition = async () => {
    if (!selectedMilestone || !milestoneAction) return;
    setIsUpdatingMilestone(true);

    let targetStatus = '';
    const payload: any = {};

    if (milestoneAction === 'SUBMIT') {
      targetStatus = 'SUBMITTED';
      payload.submissionNotes = actionNotes;
    } else if (milestoneAction === 'APPROVE') {
      targetStatus = 'APPROVED';
    } else if (milestoneAction === 'CHANGES') {
      targetStatus = 'CHANGES_REQUESTED';
      payload.feedback = actionNotes;
    }

    try {
      await apiClient.patch(`/workspace/milestones/${selectedMilestone.id}`, {
        status: targetStatus,
        ...payload,
      });
      addToast('success', 'Milestone Updated', `Status updated to ${targetStatus}`);
      setSelectedMilestone(null);
      setMilestoneAction(null);
      setActionNotes('');
      await fetchWorkspace();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Could not update milestone.');
    } finally {
      setIsUpdatingMilestone(false);
    }
  };

  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploadingFile(true);
    try {
      await apiClient.post(`/workspace/${projectId}/files`, uploadForm);
      addToast('success', 'File Uploaded', `${uploadForm.fileName} has been securely stored.`);
      setShowUploadModal(false);
      setUploadForm({ fileName: '', fileUrl: '', fileSize: 1048576, mimeType: 'application/pdf' });
      await fetchWorkspace();
    } catch (err: any) {
      addToast('error', 'Upload Error', err.message || 'File upload failed.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingTask(true);
    try {
      await apiClient.post(`/workspace/${projectId}/tasks`, taskForm);
      addToast('success', 'Task Created', 'Project task added.');
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '' });
      await fetchWorkspace();
    } catch (err: any) {
      addToast('error', 'Task Error', err.message || 'Could not create task.');
    } finally {
      setIsCreatingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 text-center text-sm text-muted">
        Loading Project Workspace...
      </div>
    );
  }

  if (!workspace) {
    return null;
  }

  const { overview, requirements, requiredTechnologies, milestones, tasks, files, messages, timeline, payments, support } = workspace;
  const isClient = user?.role === 'CLIENT' || overview.client?.id === user?.clientId;
  const isDev = user?.role === 'DEVELOPER' || overview.leadDeveloper?.id === user?.developerId;

  const workspaceTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'requirements', label: 'Requirements' },
    { id: 'milestones', label: `Milestones (${milestones?.length || 0})` },
    { id: 'tasks', label: `Tasks (${tasks?.length || 0})` },
    { id: 'files', label: `Files (${files?.length || 0})` },
    { id: 'messages', label: 'Messages' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'payments', label: 'Payments' },
    { id: 'support', label: 'Support' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <Link
            href="/dashboard/projects"
            className="inline-flex items-center text-xs text-muted hover:text-foreground mb-2"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Projects
          </Link>
          <div className="flex items-center space-x-3">
            <span className="font-mono text-xs font-bold text-accent">{overview.projectNumber}</span>
            <Badge variant="outline">{overview.category}</Badge>
            <Badge variant={overview.status === 'PUBLISHED' ? 'success' : 'electric'}>
              {overview.status}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-foreground mt-1">{overview.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard/messages">
            <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="h-4 w-4" />}>
              Project Chat
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => setShowUploadModal(true)}
            leftIcon={<UploadCloud className="h-4 w-4" />}
          >
            Upload Deliverable
          </Button>
        </div>
      </div>

      {/* 9 Workspace Navigation Tabs */}
      <Tabs tabs={workspaceTabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* SECTION 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6 space-y-4">
              <h3 className="text-base font-bold text-foreground">Project Scope & Description</h3>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {overview.description}
              </p>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4 bg-surface-elevated">
                <span className="text-[10px] uppercase text-muted font-mono">Budget</span>
                <p className="text-sm font-bold text-foreground mt-1">
                  ₹{Number(overview.budgetMin).toLocaleString()} – ₹{Number(overview.budgetMax).toLocaleString()}
                </p>
              </Card>
              <Card className="p-4 bg-surface-elevated">
                <span className="text-[10px] uppercase text-muted font-mono">Timeline</span>
                <p className="text-sm font-bold text-foreground mt-1">{overview.timeline}</p>
              </Card>
              <Card className="p-4 bg-surface-elevated">
                <span className="text-[10px] uppercase text-muted font-mono">Milestones Total</span>
                <p className="text-sm font-bold text-foreground mt-1">{milestones.length}</p>
              </Card>
              <Card className="p-4 bg-surface-elevated">
                <span className="text-[10px] uppercase text-muted font-mono">Files Uploaded</span>
                <p className="text-sm font-bold text-foreground mt-1">{files.length}</p>
              </Card>
            </div>
          </div>

          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <h3 className="text-base font-bold text-foreground">Project Stakeholders</h3>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-surface-elevated rounded border border-border">
                  <span className="text-muted block text-[10px] uppercase">Client Representative</span>
                  <p className="font-semibold text-foreground text-sm mt-0.5">
                    {overview.client?.companyName}
                  </p>
                  <span className="font-mono text-muted">{overview.clientNumber}</span>
                </div>

                <div className="p-3 bg-surface-elevated rounded border border-border">
                  <span className="text-muted block text-[10px] uppercase">Lead Engineer</span>
                  {overview.leadDeveloper ? (
                    <div className="mt-1">
                      <p className="font-semibold text-foreground text-sm">{overview.leadDeveloper.name}</p>
                      <span className="text-accent text-[11px] block">{overview.leadDeveloper.title}</span>
                      <span className="font-mono text-muted text-[10px]">@{overview.leadDeveloper.username}</span>
                    </div>
                  ) : (
                    <p className="text-muted italic mt-1">Pending Assignment</p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* SECTION 2: REQUIREMENTS */}
      {activeTab === 'requirements' && (
        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-foreground">Project Requirements & Specifications</h3>
            <p className="text-xs text-muted mt-1">
              Verified business requirements established by the client.
            </p>
          </div>

          <div className="space-y-3">
            {requirements && requirements.length > 0 ? (
              requirements.map((req: string, idx: number) => (
                <div key={idx} className="flex items-start space-x-3 p-3 bg-surface-elevated rounded border border-border/50">
                  <CheckCircle2 className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span className="text-xs text-foreground/90">{req}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted">No specific bullet requirements recorded.</p>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">
              Required Technology Stack
            </h4>
            <div className="flex flex-wrap gap-2">
              {requiredTechnologies && requiredTechnologies.length > 0 ? (
                requiredTechnologies.map((t: string) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted">No stack restrictions</span>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 3: MILESTONES */}
      {activeTab === 'milestones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">Milestones Lifecycle</h3>
              <p className="text-xs text-muted">
                Structured progressive deliverables with client signoff gates.
              </p>
            </div>
          </div>

          {milestones.length === 0 ? (
            <Card className="p-8 text-center text-muted text-sm">
              No milestones created yet.
            </Card>
          ) : (
            <div className="space-y-3">
              {milestones.map((m: any, idx: number) => {
                const getStatusBadge = (s: string) => {
                  switch (s) {
                    case 'APPROVED':
                    case 'COMPLETED':
                      return <Badge variant="success">{s}</Badge>;
                    case 'SUBMITTED':
                      return <Badge variant="electric">{s}</Badge>;
                    case 'CHANGES_REQUESTED':
                      return <Badge variant="danger">{s}</Badge>;
                    case 'IN_PROGRESS':
                      return <Badge variant="warning">{s}</Badge>;
                    default:
                      return <Badge variant="outline">{s}</Badge>;
                  }
                };

                return (
                  <Card key={m.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs text-muted">#{idx + 1}</span>
                        {getStatusBadge(m.status)}
                        {m.completed_at && (
                          <span className="text-[10px] text-muted">
                            Completed: {new Date(m.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-foreground">{m.title}</h4>
                      <p className="text-xs text-foreground/80">{m.description}</p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {/* Developer actions */}
                      {isDev && (m.status === 'PENDING' || m.status === 'CHANGES_REQUESTED') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedMilestone(m);
                            setMilestoneAction('SUBMIT');
                          }}
                        >
                          {m.status === 'CHANGES_REQUESTED' ? 'Resubmit' : 'Submit for Review'}
                        </Button>
                      )}

                      {/* Client actions */}
                      {isClient && m.status === 'SUBMITTED' && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedMilestone(m);
                              setMilestoneAction('CHANGES');
                            }}
                          >
                            Request Changes
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedMilestone(m);
                              setMilestoneAction('APPROVE');
                            }}
                          >
                            Approve
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: TASKS */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">Project Sprint Tasks</h3>
              <p className="text-xs text-muted">Atomic work breakdown tracking for engineering deliverables.</p>
            </div>
            <Button size="sm" onClick={() => setShowTaskModal(true)} leftIcon={<ListTodo className="h-4 w-4" />}>
              Add Task
            </Button>
          </div>

          {tasks.length === 0 ? (
            <Card className="p-8 text-center text-muted text-sm">
              No tasks currently registered.
            </Card>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: any) => (
                <Card key={task.id} className="p-4 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-foreground">{task.title}</h5>
                    {task.description && <p className="text-[11px] text-muted">{task.description}</p>}
                  </div>
                  <Badge variant="outline">{task.status}</Badge>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: FILES */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">Deliverables & Secure Files</h3>
              <p className="text-xs text-muted">Encrypted file storage accessible strictly by verified project parties.</p>
            </div>
            <Button size="sm" onClick={() => setShowUploadModal(true)} leftIcon={<UploadCloud className="h-4 w-4" />}>
              Upload File
            </Button>
          </div>

          {files.length === 0 ? (
            <Card className="p-8 text-center text-muted text-sm">
              No files uploaded yet for this project.
            </Card>
          ) : (
            <div className="space-y-2">
              {files.map((file: any) => (
                <Card key={file.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-5 w-5 text-accent shrink-0" />
                    <div>
                      <h5 className="text-xs font-bold text-foreground">{file.file_name}</h5>
                      <span className="text-[10px] text-muted">
                        {(file.file_size / 1024).toFixed(1)} KB • {file.mime_type} • Uploaded by {file.uploader_email}
                      </span>
                    </div>
                  </div>
                  <a
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-accent hover:underline flex items-center space-x-1"
                  >
                    <span>Access</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 6: MESSAGES */}
      {activeTab === 'messages' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Workspace Project Messages</h3>
              <p className="text-xs text-muted">Direct communication channel between Client and Lead Engineer.</p>
            </div>
            <Link href="/dashboard/messages">
              <Button size="sm">Open Full Chat</Button>
            </Link>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {messages.length === 0 ? (
              <p className="text-xs text-muted text-center py-8">No workspace messages logged yet.</p>
            ) : (
              messages.map((msg: any) => (
                <div key={msg.id} className="p-3 bg-surface-elevated rounded border border-border/50 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-accent">{msg.sender_role}</span>
                    <span className="text-[10px] text-muted">{new Date(msg.created_at).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-foreground/90">{msg.message}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* SECTION 7: TIMELINE */}
      {activeTab === 'timeline' && (
        <Card className="p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-foreground">Project Timeline & Audit Trace</h3>
            <p className="text-xs text-muted">Immutable chronology of project milestones and lifecycle events.</p>
          </div>

          <div className="relative border-l-2 border-border ml-3 space-y-6 pl-6">
            {timeline.length === 0 ? (
              <p className="text-xs text-muted">No timeline events recorded.</p>
            ) : (
              timeline.map((event: any) => (
                <div key={event.id} className="relative group">
                  <div className="absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full bg-accent border-2 border-background" />
                  <span className="text-[10px] font-mono text-muted block">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                  <h5 className="text-xs font-bold text-foreground mt-0.5">{event.title}</h5>
                  <p className="text-xs text-foreground/80 mt-0.5">{event.description}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* SECTION 8: PAYMENTS */}
      {activeTab === 'payments' && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Escrow & Milestone Payments</h3>
            <p className="text-xs text-muted">Financial settlement records backed by double-entry credit ledger.</p>
          </div>

          {payments.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              Project escrow and payments settled via enterprise ledger.
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p: any) => (
                <div key={p.id} className="p-3 bg-surface-elevated rounded border border-border flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-foreground">₹{Number(p.amount).toLocaleString()}</span>
                    <span className="text-muted ml-2">via {p.gateway}</span>
                  </div>
                  <Badge variant={p.status === 'SUCCESS' ? 'success' : 'warning'}>{p.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* SECTION 9: SUPPORT */}
      {activeTab === 'support' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-foreground">Tripartite Support Tickets</h3>
              <p className="text-xs text-muted">Direct escalation bridges involving Client, Developer, and Leadership Support.</p>
            </div>
          </div>

          {support.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              No open support tickets for this project.
            </div>
          ) : (
            <div className="space-y-3">
              {support.map((ticket: any) => (
                <div key={ticket.id} className="p-4 bg-surface-elevated rounded border border-border flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-muted">{ticket.ticket_number}</span>
                      <Badge variant="outline">{ticket.priority}</Badge>
                    </div>
                    <h5 className="font-bold text-foreground text-sm mt-1">{ticket.subject}</h5>
                    <p className="text-muted text-xs mt-0.5">{ticket.description}</p>
                  </div>
                  <Badge variant={ticket.status === 'RESOLVED' ? 'success' : 'warning'}>
                    {ticket.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Milestone Transition Action Modal */}
      {selectedMilestone && milestoneAction && (
        <Modal
          isOpen={true}
          onClose={() => {
            setSelectedMilestone(null);
            setMilestoneAction(null);
          }}
          title={
            milestoneAction === 'SUBMIT'
              ? `Submit Milestone: ${selectedMilestone.title}`
              : milestoneAction === 'APPROVE'
              ? `Approve Milestone: ${selectedMilestone.title}`
              : `Request Changes: ${selectedMilestone.title}`
          }
        >
          <div className="space-y-4">
            <p className="text-xs text-muted">
              {milestoneAction === 'SUBMIT'
                ? 'Provide delivery notes or repository links for client review.'
                : milestoneAction === 'APPROVE'
                ? 'Approving will mark this milestone as verified and trigger subsequent project stages.'
                : 'Specify what requires adjustment before approval.'}
            </p>

            {milestoneAction !== 'APPROVE' && (
              <Textarea
                label="Notes / Feedback"
                rows={3}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Write message..."
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedMilestone(null);
                  setMilestoneAction(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleMilestoneTransition} isLoading={isUpdatingMilestone}>
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* File Upload Modal */}
      {showUploadModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowUploadModal(false)}
          title="Upload Project File / Deliverable"
        >
          <form onSubmit={handleUploadFile} className="space-y-4">
            <Input
              label="File Name"
              value={uploadForm.fileName}
              onChange={(e) => setUploadForm({ ...uploadForm, fileName: e.target.value })}
              placeholder="e.g. SystemArchitecture.pdf"
              required
            />
            <Input
              label="File URL"
              value={uploadForm.fileUrl}
              onChange={(e) => setUploadForm({ ...uploadForm, fileUrl: e.target.value })}
              placeholder="https://storage.nexusplatform.io/..."
              required
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowUploadModal(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isUploadingFile}>
                Upload
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Task Creation Modal */}
      {showTaskModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowTaskModal(false)}
          title="Create Project Task"
        >
          <form onSubmit={handleCreateTask} className="space-y-4">
            <Input
              label="Task Title"
              value={taskForm.title}
              onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
              placeholder="e.g. Implement schema migration for payments"
              required
            />
            <Textarea
              label="Description"
              rows={2}
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              placeholder="Optional task breakdown..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowTaskModal(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isCreatingTask}>
                Create Task
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
