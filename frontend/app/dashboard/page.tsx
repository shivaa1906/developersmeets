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
} from 'lucide-react';

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const [balance, setBalance] = React.useState<number | null>(null);
  const [myProjects, setMyProjects] = React.useState<any[]>([]);

  React.useEffect(() => {
    apiClient.get<{ balance: number }>('/credits/balance')
      .then((res) => setBalance(res.balance))
      .catch(() => setBalance(10));

    apiClient.get<{ projects: any[] }>('/projects/my-projects')
      .then((res) => setMyProjects(res.projects || []))
      .catch(() => setMyProjects([]));
  }, []);

  const isClient = user?.role === 'CLIENT';
  const isVerified = user?.verificationStatus === 'VERIFIED' || user?.role === 'CEO' || user?.role === 'MD';

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
          <Link href="/dashboard/projects">
            <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
              {isClient ? 'My Projects' : 'Browse Marketplace'}
            </Button>
          </Link>
          {!isClient && (
            <Link href="/dashboard/credits">
              <Button variant="outline" size="sm">
                Wallet & Credits
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {!isClient && (
          <Card className="bg-surface-elevated">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">Credit Wallet</span>
              <Coins className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-accent">
                {balance !== null ? `${balance} Credits` : '...'}
              </div>
              <p className="text-[11px] text-muted mt-1">₹{balance !== null ? balance * 50 : 500} platform value</p>
            </CardContent>
          </Card>
        )}

        <Card className="bg-surface-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">
              {isClient ? 'Submitted Projects' : 'Active Claims'}
            </span>
            <Clock className="h-4 w-4 text-electric-purple" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">{myProjects.length} Active</div>
            <p className="text-[11px] text-muted mt-1">In platform queue</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Active Workspace</span>
            <FolderGit2 className="h-4 w-4 text-status-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-status-success">
              {myProjects.filter((p) => p.status === 'IN_PROGRESS').length} In Progress
            </div>
            <p className="text-[11px] text-muted mt-1">Milestone delivery tracking</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Completed</span>
            <ShieldCheck className="h-4 w-4 text-muted" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {myProjects.filter((p) => p.status === 'PUBLISHED').length} Published
            </div>
            <p className="text-[11px] text-muted mt-1">Public portfolio attributed</p>
          </CardContent>
        </Card>
      </div>

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
              <div className="p-8 text-center text-xs text-muted">No projects found.</div>
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
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Info & Guide Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform Operating System</CardTitle>
            <CardDescription>Merit-based anonymous marketplace protocol</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-muted leading-relaxed">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
