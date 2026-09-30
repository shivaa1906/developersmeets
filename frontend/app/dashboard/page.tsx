'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/lib/api-client';
import {
  FolderGit2,
  Coins,
  MessageSquare,
  ArrowRight,
  Clock,
  ShieldCheck,
  Eye,
  Mail,
  CheckCircle2,
  LifeBuoy,
  Bell,
  Plus,
  AlertCircle,
  Code2,
} from 'lucide-react';

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const [balance, setBalance] = React.useState<number | null>(null);
  const [myProjects, setMyProjects] = React.useState<any[]>([]);
  const [clientStats, setClientStats] = React.useState<{
    conversations: number;
    tickets: number;
    unreadNotifications: number;
  }>({
    conversations: 0,
    tickets: 0,
    unreadNotifications: 0,
  });
  const [dashboardMetrics, setDashboardMetrics] = React.useState<{
    projects: number;
    claims: number;
    credits: number;
    messages: number;
    inquiries: number;
    profileViews: number;
  }>({
    projects: 0,
    claims: 0,
    credits: 0,
    messages: 0,
    inquiries: 0,
    profileViews: 0,
  });

  const isClient = user?.role === 'CLIENT';
  const isVerified = user?.verificationStatus === 'VERIFIED' || user?.role === 'CEO' || user?.role === 'MD';

  React.useEffect(() => {
    if (!isClient) {
      apiClient.get<{ balance: number }>('/credits/balance')
        .then((res) => setBalance(res.balance))
        .catch(() => setBalance(0));
    }

    apiClient.get<{ projects: any[] }>('/projects/my-projects')
      .then((res) => setMyProjects(res.projects || []))
      .catch(() => setMyProjects([]));

    if (isClient) {
      Promise.all([
        apiClient.get<{ conversations: any[] }>('/chat/conversations').catch(() => ({ conversations: [] })),
        apiClient.get<{ tickets: any[] }>('/support/tickets').catch(() => ({ tickets: [] })),
        apiClient.get<{ unreadCount: number }>('/notifications').catch(() => ({ unreadCount: 0 })),
      ]).then(([convRes, tickRes, notifRes]) => {
        setClientStats({
          conversations: convRes.conversations?.length || 0,
          tickets: tickRes.tickets?.length || 0,
          unreadNotifications: notifRes.unreadCount || 0,
        });
      });
    } else if (isVerified) {
      apiClient.get<{ metrics: any }>('/developers/dashboard')
        .then((res) => {
          if (res.metrics) {
            setDashboardMetrics(res.metrics);
          }
        })
        .catch(() => {});
    }
  }, [isClient, isVerified]);

  return (
    <div className="space-y-8">
      {/* Top Welcome banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back, {user?.name || (isClient ? 'Client' : 'Developer')}
            </h1>
            <Badge variant={isVerified || isClient ? 'success' : 'warning'} size="sm">
              {isClient ? 'Verified Client' : isVerified ? 'Verified Developer' : 'Pending Verification'}
            </Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            {isClient
              ? 'Track submitted projects, review incoming proposals, and interact via anonymous chat.'
              : 'Browse open marketplace projects, inspect active claims, and manage your credit wallet.'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {isClient ? (
            <>
              <Link href="/start-project">
                <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                  Start a Project
                </Button>
              </Link>
              <Link href="/join-developer">
                <Button variant="outline" size="sm" className="border-accent/40 text-accent hover:bg-accent/10" leftIcon={<Code2 className="h-3.5 w-3.5" />}>
                  Join as Developer
                </Button>
              </Link>
              <Link href="/dashboard/projects">
                <Button variant="outline" size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  My Projects
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/dashboard/projects">
                <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Browse Marketplace
                </Button>
              </Link>
              <Link href="/dashboard/credits">
                <Button variant="outline" size="sm">
                  Wallet & Credits
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Client to Developer Opportunity Banner */}
      {isClient && (
        <Card className="border-accent/20 bg-accent/5 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                <Code2 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  Build and deliver software? Join the Developer Network
                </h4>
                <p className="text-[11px] text-muted">
                  Keep your client account active or transition safely with preserved project and financial records.
                </p>
              </div>
            </div>
            <Link href="/join-developer" className="shrink-0">
              <Button size="sm" variant="outline" className="border-accent/40 text-accent hover:bg-accent/10" rightIcon={<ArrowRight className="h-3 w-3" />}>
                Join as Developer
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Pending Developer Alert Banner */}
      {!isClient && !isVerified && (
        <Card className="border-warning/40 bg-warning/5 p-5 shadow-sm">
          <div className="flex items-start space-x-3.5">
            <div className="h-9 w-9 rounded-lg bg-warning/10 border border-warning/30 flex items-center justify-center text-warning shrink-0 mt-0.5">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-bold text-foreground">
                  Application Under Review: PENDING_DEVELOPER_APPROVAL
                </h4>
                <Badge variant="warning" size="sm">Awaiting Review</Badge>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Your technical credentials, project history, and code profiles are currently undergoing verification by executive leadership. Project claim privileges and private developer community discussions will automatically unlock once approved. You can explore the marketplace and reach out to Platform Support if you have any questions.
              </p>
              <div className="pt-2 flex items-center space-x-3">
                <Link href="/dashboard/support">
                  <Button size="sm" variant="outline" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                    Contact Platform Support
                  </Button>
                </Link>
                <Link href="/dashboard/projects">
                  <Button size="sm" variant="ghost">
                    Preview Marketplace
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Metrics Row - Tailored by Role */}
      {isClient ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Projects */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Active Projects</span>
              <FolderGit2 className="h-4 w-4 text-status-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {myProjects.length}
              </div>
              <p className="text-[10px] text-muted mt-1">Submitted & active</p>
            </CardContent>
          </Card>

          {/* Conversations */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Conversations</span>
              <MessageSquare className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {clientStats.conversations}
              </div>
              <p className="text-[10px] text-muted mt-1">Anonymous chat threads</p>
            </CardContent>
          </Card>

          {/* Support Tickets */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Support Tickets</span>
              <LifeBuoy className="h-4 w-4 text-electric-purple" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {clientStats.tickets}
              </div>
              <p className="text-[10px] text-muted mt-1">Active requests</p>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Notifications</span>
              <Bell className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {clientStats.unreadNotifications}
              </div>
              <p className="text-[10px] text-muted mt-1">Unread updates</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {/* Credits */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Credits</span>
              <Coins className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-accent">
                {balance !== null ? balance : dashboardMetrics.credits}
              </div>
              <p className="text-[10px] text-muted mt-1">Ledger balance</p>
            </CardContent>
          </Card>

          {/* Projects */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Projects</span>
              <FolderGit2 className="h-4 w-4 text-status-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {dashboardMetrics.projects || myProjects.length}
              </div>
              <p className="text-[10px] text-muted mt-1">Associated projects</p>
            </CardContent>
          </Card>

          {/* Claims */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Claims</span>
              <Clock className="h-4 w-4 text-electric-purple" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {dashboardMetrics.claims}
              </div>
              <p className="text-[10px] text-muted mt-1">Project claims</p>
            </CardContent>
          </Card>

          {/* Messages */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Messages</span>
              <MessageSquare className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {dashboardMetrics.messages}
              </div>
              <p className="text-[10px] text-muted mt-1">Encrypted chat</p>
            </CardContent>
          </Card>

          {/* Inquiries */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Inquiries</span>
              <Mail className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {dashboardMetrics.inquiries}
              </div>
              <p className="text-[10px] text-muted mt-1">Confidential leads</p>
            </CardContent>
          </Card>

          {/* Profile Views */}
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-[11px] font-medium text-muted uppercase tracking-wider">Profile Views</span>
              <Eye className="h-4 w-4 text-muted" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">
                {dashboardMetrics.profileViews}
              </div>
              <p className="text-[10px] text-muted mt-1">Public visits</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Work & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {isClient ? 'My Projects' : 'Current Claimed Projects'}
              </CardTitle>
              <Badge variant="default" size="sm">
                Anonymous Mode
              </Badge>
            </div>
            <CardDescription>
              {isClient
                ? 'Projects awaiting proposals or actively in execution'
                : 'Projects currently under proposal and client chat review'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {myProjects.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">
                {isClient ? (
                  <span>
                    No projects found.{' '}
                    <Link href="/start-project" className="text-accent hover:underline">
                      Start your first project
                    </Link>
                  </span>
                ) : (
                  'No projects found.'
                )}
              </div>
            ) : (
              myProjects.slice(0, 3).map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-surface p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted">{p.project_number}</span>
                    <Badge variant="warning" size="sm">
                      {p.status}
                    </Badge>
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">{p.title}</h4>
                  <div className="pt-2 flex items-center space-x-2">
                    <Link href="/dashboard/messages">
                      <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                        Open Anonymous Chat
                      </Button>
                    </Link>
                    {isClient && (
                      <Link href={`/dashboard/support?action=create&projectId=${p.id}`}>
                        <Button variant="ghost" size="sm" className="text-muted hover:text-foreground">
                          Support
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Info & Guide Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isClient ? 'Client Operations Guide' : 'Platform Operating System'}
            </CardTitle>
            <CardDescription>
              {isClient ? 'Enterprise merit-based delivery protocol' : 'Merit-based anonymous marketplace protocol'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted leading-relaxed">
            {isClient ? (
              <>
                <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-1">
                  <h5 className="font-semibold text-foreground">1. Zero-Bias Developer Matching</h5>
                  <p>Proposals are evaluated strictly on architectural rigor and milestones, eliminating pedigree or demographic bias.</p>
                </div>
                <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-1">
                  <h5 className="font-semibold text-foreground">2. Escrow & Milestone Safety</h5>
                  <p>Payments and progress are protected through automated milestone verification and signoff.</p>
                </div>
                <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-1">
                  <h5 className="font-semibold text-foreground">3. 24/7 Dedicated Operations Support</h5>
                  <p>Open tickets directly on any active or completed project to initiate tripartite support bridges with our operations team.</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-2">
                  <h5 className="font-semibold text-foreground">1. Zero-Bias Selection</h5>
                  <p>Client and Developer identities remain shielded during claims and proposal evaluation.</p>
                </div>
                <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-2">
                  <h5 className="font-semibold text-foreground">2. 100% Automated Refunds</h5>
                  <p>If another developer is selected, your claimed 1 credit is immediately refunded back to your wallet.</p>
                </div>
                <div className="p-3 bg-surface-elevated rounded-lg border border-border space-y-2">
                  <h5 className="font-semibold text-foreground">3. Public Attribution</h5>
                  <p>Upon milestone completion and client signoff, projects are published to the public showcase with permanent credit to the engineer.</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
