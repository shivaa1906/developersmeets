'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';
import {
  Users,
  Briefcase,
  UserCheck,
  CheckSquare,
  Coins,
  CreditCard,
  LifeBuoy,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { siteConfig } from '@/config/site';

interface PlatformOverviewData {
  users: {
    total: number;
    developers: number;
    clients: number;
    verifiedDevelopers: number;
    pendingDevelopers: number;
  };
  projects: {
    total: number;
    pendingApproval: number;
    openMarketplace: number;
    activeWorkspace: number;
    completed: number;
    pipelineValueInr: number;
  };
  economy: {
    totalCreditTransactions: number;
    totalCreditsCirculated: number;
    totalRevenueInr: number;
    successfulPaymentsCount: number;
  };
}

export default function AdminDashboardPage() {
  const leadership = siteConfig.company.leadership;
  const [data, setData] = React.useState<PlatformOverviewData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchOverview = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<PlatformOverviewData>('/analytics/platform');
      setData(res);
    } catch (_err) {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const statCards = [
    {
      title: 'Total Developers',
      value: data ? `${data.users.developers}` : '...',
      sub: data ? `${data.users.verifiedDevelopers} Verified • ${data.users.pendingDevelopers} Pending` : 'Loading...',
      icon: <Users className="h-4 w-4 text-accent" />,
    },
    {
      title: 'Pending Applications',
      value: data ? `${data.users.pendingDevelopers}` : '0',
      sub: 'Requires Executive Approval',
      icon: <UserCheck className="h-4 w-4 text-status-warning" />,
      alert: data ? data.users.pendingDevelopers > 0 : false,
    },
    {
      title: 'Total Projects',
      value: data ? `${data.projects.total}` : '...',
      sub: data
        ? `${data.projects.openMarketplace} Open • ${data.projects.activeWorkspace} Active • ${data.projects.completed} Completed`
        : 'Loading...',
      icon: <Briefcase className="h-4 w-4 text-foreground" />,
    },
    {
      title: 'Marketplace Pipeline',
      value: data ? `₹${data.projects.pipelineValueInr.toLocaleString()}` : '...',
      sub: 'Total pipeline budget value',
      icon: <CheckSquare className="h-4 w-4 text-electric-purple" />,
    },
    {
      title: 'Credit Ledger Circulation',
      value: data ? `${data.economy.totalCreditsCirculated} Cr` : '...',
      sub: data ? `${data.economy.totalCreditTransactions} ledger transactions` : 'Loading...',
      icon: <Coins className="h-4 w-4 text-status-success" />,
    },
    {
      title: 'Total Platform Revenue',
      value: data ? `₹${data.economy.totalRevenueInr.toLocaleString()}` : '...',
      sub: data ? `${data.economy.successfulPaymentsCount} processed payments` : 'Loading...',
      icon: <CreditCard className="h-4 w-4 text-accent" />,
    },
    {
      title: 'Pending Project Approvals',
      value: data ? `${data.projects.pendingApproval}` : '0',
      sub: 'Submitted by clients',
      icon: <LifeBuoy className="h-4 w-4 text-status-warning" />,
      alert: data ? data.projects.pendingApproval > 0 : false,
    },
    {
      title: 'Completed & Published',
      value: data ? `${data.projects.completed}` : '0',
      sub: 'Public developer attribution',
      icon: <ShieldCheck className="h-4 w-4 text-foreground" />,
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Executive Command Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-extrabold text-foreground">Executive Administration HQ</h1>
            <Badge variant="warning">ADMIN PRIVILEGED</Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            Global governance, developer admissions, project claims oversight, and credit ledger operations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={fetchOverview}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Link href="/admin/developers">
            <Button size="sm" variant="secondary">
              Review Pending Devs ({data?.users.pendingDevelopers || 0})
            </Button>
          </Link>
          <Link href="/admin/projects">
            <Button size="sm">Review Projects</Button>
          </Link>
        </div>
      </div>

      {/* Leadership Responsibility Box */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-accent/30 bg-surface-elevated p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-accent tracking-wider block">
              Chief Executive Officer
            </span>
            <h3 className="text-base font-bold text-foreground mt-0.5">{leadership.ceo.name}</h3>
            <p className="text-xs text-muted mt-1">
              Full platform administration, developer verification, credit and payment policies.
            </p>
          </div>
          <Badge variant="default" size="sm">
            CEO / Admin
          </Badge>
        </div>

        <div className="rounded-xl border border-electric-purple/30 bg-surface-elevated p-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-electric-purple tracking-wider block">
              Managing Director
            </span>
            <h3 className="text-base font-bold text-foreground mt-0.5">{leadership.md.name}</h3>
            <p className="text-xs text-muted mt-1">
              Technical project oversight, milestone delivery tracking, and operational analytics.
            </p>
          </div>
          <Badge variant="electric" size="sm">
            MD
          </Badge>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} className={`bg-surface-elevated ${stat.alert ? 'border-status-warning/40 shadow-sm' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-medium text-muted uppercase tracking-wider">{stat.title}</span>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-foreground">{stat.value}</div>
              <p className="text-[11px] text-muted mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Developer Applications</CardTitle>
              <Link href="/admin/developers" className="text-xs text-accent hover:underline">
                Open Queue
              </Link>
            </div>
            <CardDescription>Verify developer credentials and grant welcome credits</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Every approved developer receives 10 initial credits and full marketplace claiming permissions.
            </p>
            <div className="mt-4">
              <Link href="/admin/developers">
                <Button size="sm" variant="secondary">Go to Developer Verification</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Project Approval Pipeline</CardTitle>
              <Link href="/admin/projects" className="text-xs text-accent hover:underline">
                Open Pipeline
              </Link>
            </div>
            <CardDescription>Approve submitted client projects into the public developer marketplace</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted">
              Configure maximum claim slots, deadlines, and requirements with client identity shielding.
            </p>
            <div className="mt-4">
              <Link href="/admin/projects">
                <Button size="sm" variant="secondary">Go to Project Pipeline</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
