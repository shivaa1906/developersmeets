'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import { Coins, Clock, MessageSquare, Briefcase, FileText, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function DashboardProjectsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = React.useState('marketplace');
  const [marketplaceProjects, setMarketplaceProjects] = React.useState<any[]>([]);
  const [myProjects, setMyProjects] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Claim modal state
  const [selectedProjectToClaim, setSelectedProjectToClaim] = React.useState<any | null>(null);
  const [isClaiming, setIsClaiming] = React.useState(false);

  // Proposal modal state
  const [proposalModalProject, setProposalModalProject] = React.useState<any | null>(null);
  const [proposalForm, setProposalForm] = React.useState({ approach: '', timeline: '30 Days', price: '60000', notes: '' });
  const [isSubmittingProposal, setIsSubmittingProposal] = React.useState(false);

  // Client proposals view state
  const [viewProposalsProject, setViewProposalsProject] = React.useState<any | null>(null);
  const [projectProposals, setProjectProposals] = React.useState<any[]>([]);
  const [isSelectingDev, setIsSelectingDev] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, myRes] = await Promise.all([
        apiClient.get<{ projects: any[] }>('/projects/marketplace').catch(() => ({ projects: [] })),
        apiClient.get<{ projects: any[] }>('/projects/my-projects').catch(() => ({ projects: [] })),
      ]);
      setMarketplaceProjects(mRes.projects || []);
      setMyProjects(myRes.projects || []);
    } catch (_err) {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleConfirmClaim = async () => {
    if (!selectedProjectToClaim) return;
    setIsClaiming(true);

    try {
      const res = await apiClient.post<{ anonymousTag: string; remainingCredits: number }>(
        `/projects/${selectedProjectToClaim.id}/claim`
      );
      addToast(
        'success',
        'Slot Claimed Successfully',
        `Assigned as ${res.anonymousTag}. Remaining credits: ${res.remainingCredits}. An anonymous chat has opened.`
      );
      setSelectedProjectToClaim(null);
      await loadData();
    } catch (err: any) {
      addToast('error', 'Claim Failed', err.message || 'Unable to claim slot.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleOpenProposalsForClient = async (proj: any) => {
    setViewProposalsProject(proj);
    try {
      const res = await apiClient.get<{ proposals: any[] }>(`/projects/${proj.id}/proposals`);
      setProjectProposals(res.proposals || []);
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Could not fetch proposals.');
    }
  };

  const handleSelectDeveloper = async (claimId: string, devId: string) => {
    if (!viewProposalsProject) return;
    setIsSelectingDev(true);
    try {
      const res = await apiClient.post<{ success: boolean; refundedCount: number }>(
        `/projects/${viewProposalsProject.id}/select`,
        { selectedDeveloperId: devId }
      );
      addToast(
        'success',
        'Developer Selected!',
        `Selected for project. Automatically refunded 1 credit to ${res.refundedCount} other claiming developers.`
      );
      setViewProposalsProject(null);
      await loadData();
    } catch (err: any) {
      addToast('error', 'Selection Failed', err.message || 'Could not select developer.');
    } finally {
      setIsSelectingDev(false);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalModalProject) return;
    setIsSubmittingProposal(true);

    try {
      await apiClient.post(`/projects/${proposalModalProject.id}/proposals`, {
        approach: proposalForm.approach,
        timeline: proposalForm.timeline,
        price: Number(proposalForm.price),
        additionalNotes: proposalForm.notes,
      });

      addToast(
        'success',
        'Proposal Submitted',
        `Your proposal has been delivered to the client under your anonymous tag.`
      );
      setProposalModalProject(null);
      await loadData();
    } catch (err: any) {
      addToast('error', 'Proposal Failed', err.message || 'Unable to submit proposal.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const isClient = user?.role === 'CLIENT';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isClient ? 'My Client Projects' : 'Project Marketplace'}
          </h1>
          <p className="text-xs text-muted mt-1">
            {isClient
              ? 'Manage your submitted projects, review anonymous proposals, and select winning developers.'
              : 'Claim eligible projects with credits. All proposal communication is 100% anonymous until completion.'}
          </p>
        </div>

        {!isClient && (
          <div className="flex items-center space-x-2 text-xs font-mono text-accent bg-accent/10 border border-accent/30 px-3 py-1.5 rounded-lg">
            <Coins className="h-3.5 w-3.5" />
            <span>Claim Cost: 1 Credit (100% Refundable)</span>
          </div>
        )}
      </div>

      <Tabs
        tabs={
          isClient
            ? [{ id: 'my-projects', label: 'My Projects', count: myProjects.length }]
            : [
                { id: 'marketplace', label: 'Open Marketplace', count: marketplaceProjects.length },
                { id: 'my-claims', label: 'My Active Claims & Projects', count: myProjects.length },
              ]
        }
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Developer Marketplace Tab */}
      {activeTab === 'marketplace' && (
        <div>
          {loading ? (
            <div className="p-12 text-center text-sm text-muted">Loading marketplace projects...</div>
          ) : marketplaceProjects.length === 0 ? (
            <Card className="p-8 text-center text-muted">
              No open marketplace projects at this time. Check back soon.
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {marketplaceProjects.map((project) => (
                <Card key={project.id} className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-muted">{project.project_number}</span>
                      <Badge variant="outline" size="sm">
                        {project.category}
                      </Badge>
                    </div>
                    <CardTitle className="text-base">{project.title}</CardTitle>
                    <CardDescription>{project.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-xs bg-surface-elevated p-3 rounded-lg border border-border">
                      <div>
                        <span className="text-[10px] text-muted uppercase block">Budget</span>
                        <span className="font-semibold text-foreground">
                          ₹{Number(project.budget_min).toLocaleString()} – ₹{Number(project.budget_max).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted uppercase block">Timeline</span>
                        <span className="font-semibold text-foreground">{project.timeline}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted uppercase block">Claim Slots</span>
                        <span className="font-mono font-semibold text-accent">
                          {project.current_claims} / {project.max_claims}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted uppercase block">Slots Left</span>
                        <span className="text-status-warning flex items-center space-x-1">
                          <Clock className="h-3 w-3" />
                          <span>{project.slots_remaining} slot(s)</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(project.required_technologies || []).map((t: string) => (
                        <span
                          key={t}
                          className="rounded bg-surface-elevated px-2 py-0.5 text-[10px] font-mono text-muted border border-border/50"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t border-border pt-4">
                    <span className="text-xs text-muted">Claim Cost: 1 Credit</span>
                    <Button size="sm" onClick={() => setSelectedProjectToClaim(project)}>
                      Claim Project Slot
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Developer Active Claims Tab */}
      {activeTab === 'my-claims' && (
        <div className="space-y-4">
          {myProjects.length === 0 ? (
            <Card className="p-8 text-center text-muted">You have not claimed any projects yet.</Card>
          ) : (
            myProjects.map((claim) => (
              <Card key={claim.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-muted">{claim.project_number}</span>
                      <Badge variant={claim.claim_status === 'SELECTED' ? 'success' : 'warning'} size="sm">
                        {claim.claim_status}
                      </Badge>
                      <Badge variant="outline" size="sm">
                        {claim.status}
                      </Badge>
                    </div>
                    <h4 className="text-base font-bold text-foreground">{claim.title}</h4>
                    <div className="flex items-center space-x-3 text-xs text-muted">
                      <span className="text-accent font-semibold">{claim.anonymous_tag}</span>
                      <span>•</span>
                      <span>Timeline: {claim.timeline}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setProposalModalProject(claim)}
                      leftIcon={<FileText className="h-3.5 w-3.5" />}
                    >
                      Submit Proposal
                    </Button>
                    <Link href="/dashboard/messages">
                      <Button size="sm" variant="outline" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                        Anonymous Chat
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Client Projects Tab */}
      {isClient && activeTab === 'my-projects' && (
        <div className="space-y-4">
          {myProjects.length === 0 ? (
            <Card className="p-8 text-center text-muted">
              You haven&apos;t submitted any projects yet.{' '}
              <Link href="/contact" className="text-accent hover:underline">
                Submit your first project
              </Link>
            </Card>
          ) : (
            myProjects.map((proj) => (
              <Card key={proj.id} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-muted">{proj.project_number}</span>
                      <Badge variant={proj.status === 'PUBLISHED' ? 'success' : 'default'} size="sm">
                        {proj.status}
                      </Badge>
                      <Badge variant="outline" size="sm">
                        {proj.category}
                      </Badge>
                    </div>
                    <h4 className="text-base font-bold text-foreground">{proj.title}</h4>
                    <p className="text-xs text-muted line-clamp-1">{proj.description}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleOpenProposalsForClient(proj)}
                      leftIcon={<FileText className="h-3.5 w-3.5" />}
                    >
                      Review Proposals
                    </Button>
                    <Link href="/dashboard/messages">
                      <Button size="sm" variant="outline" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                        Chat
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Claim Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!selectedProjectToClaim}
        onClose={() => setSelectedProjectToClaim(null)}
        onConfirm={handleConfirmClaim}
        title="Confirm Project Slot Claim"
        message={`Are you sure you want to claim ${selectedProjectToClaim?.project_number}? This will lock and deduct 1 credit from your ledger. If another developer is selected by the client, your 1 credit will be 100% refunded automatically.`}
        confirmText="Deduct 1 Credit & Claim"
        isLoading={isClaiming}
      />

      {/* Developer Submit Proposal Modal */}
      {proposalModalProject && (
        <Modal
          isOpen={!!proposalModalProject}
          onClose={() => setProposalModalProject(null)}
          title={`Submit Proposal for ${proposalModalProject.project_number}`}
        >
          <form onSubmit={handleSubmitProposal} className="space-y-4">
            <div className="p-3 bg-surface-elevated rounded-lg border border-border text-xs text-muted">
              Submitted under your identity: <span className="font-mono text-accent font-semibold">{proposalModalProject.anonymous_tag || 'Developer'}</span>
            </div>

            <Textarea
              label="Technical Approach & Architecture"
              rows={4}
              value={proposalForm.approach}
              onChange={(e) => setProposalForm({ ...proposalForm, approach: e.target.value })}
              placeholder="Outline your architecture, technology choices, testing strategy, and execution plan..."
              required
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Timeline Quote"
                value={proposalForm.timeline}
                onChange={(e) => setProposalForm({ ...proposalForm, timeline: e.target.value })}
                placeholder="e.g. 28 Days"
                required
              />
              <Input
                label="Total Price Quote (₹)"
                type="number"
                value={proposalForm.price}
                onChange={(e) => setProposalForm({ ...proposalForm, price: e.target.value })}
                placeholder="60000"
                required
              />
            </div>

            <Textarea
              label="Additional Notes / Deliverable Milestones"
              rows={2}
              value={proposalForm.notes}
              onChange={(e) => setProposalForm({ ...proposalForm, notes: e.target.value })}
              placeholder="Milestone 1 (30%): Architecture, Milestone 2 (40%): Core API..."
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setProposalModalProject(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmittingProposal}>
                Submit Proposal to Client
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Client Review Proposals Modal */}
      {viewProposalsProject && (
        <Modal
          isOpen={!!viewProposalsProject}
          onClose={() => setViewProposalsProject(null)}
          title={`Proposals for ${viewProposalsProject.project_number}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Select the best proposal for your project. When you select a developer, all other non-selected developers receive an immediate 100% automated credit refund.
            </p>

            {projectProposals.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                No proposals submitted yet by claiming developers. Check back soon.
              </div>
            ) : (
              projectProposals.map((prop) => (
                <Card key={prop.id} className="p-4 space-y-3 bg-surface-elevated">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-accent">{prop.anonymousTag}</span>
                    <span className="text-sm font-bold text-foreground">₹{Number(prop.price).toLocaleString()}</span>
                  </div>

                  <p className="text-xs text-foreground/90 whitespace-pre-wrap">{prop.approach}</p>

                  <div className="flex items-center justify-between text-xs text-muted border-t border-border/50 pt-2">
                    <span>Timeline: {prop.timeline}</span>
                    <span>Experience: {prop.developerProfile?.experienceYears || 0} years</span>
                    <Button
                      size="sm"
                      onClick={() => handleSelectDeveloper(prop.claimId, prop.developerProfile?.developerId || prop.developerId)}
                      isLoading={isSelectingDev}
                    >
                      Select Developer
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
