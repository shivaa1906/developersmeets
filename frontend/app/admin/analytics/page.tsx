'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { siteConfig } from '@/config/site';
import { BarChart3, TrendingUp, Users, CheckCircle2, Coins, RefreshCw, AlertCircle } from 'lucide-react';

interface AnalyticsData {
  verifiedDevelopers: number;
  clients: number;
  totalProjects: number;
  totalClaims: number;
  avgClaimsPerProject: string;
  totalInquiries: number;
  totalSupportTickets: number;
  projectsByStatus: Array<{ status: string; count: number }>;
  totalCreditsInCirculation: number;
  totalRevenueInr: number;
}

export default function AdminAnalyticsPage() {
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAnalytics = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ analytics: AnalyticsData }>('/admin/analytics');
      setData(res.analytics);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch platform analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Derive counts from projectsByStatus
  const statusCounts = React.useMemo(() => {
    const map = new Map<string, number>();
    if (data?.projectsByStatus) {
      for (const p of data.projectsByStatus) {
        map.set(p.status, Number(p.count));
      }
    }
    return map;
  }, [data]);

  const totalProjects = data?.totalProjects || 0;
  const approvedProjects =
    (statusCounts.get('OPEN_FOR_CLAIMS') || 0) +
    (statusCounts.get('CLAIMS_ACTIVE') || 0) +
    (statusCounts.get('SELECTION_PENDING') || 0) +
    (statusCounts.get('DEVELOPER_SELECTED') || 0) +
    (statusCounts.get('IN_PROGRESS') || 0) +
    (statusCounts.get('SUBMITTED_FOR_REVIEW') || 0) +
    (statusCounts.get('COMPLETED') || 0) +
    (statusCounts.get('PUBLISHED') || 0);

  const activeOrClaimed =
    (statusCounts.get('CLAIMS_ACTIVE') || 0) +
    (statusCounts.get('SELECTION_PENDING') || 0) +
    (statusCounts.get('DEVELOPER_SELECTED') || 0) +
    (statusCounts.get('IN_PROGRESS') || 0) +
    (statusCounts.get('SUBMITTED_FOR_REVIEW') || 0) +
    (statusCounts.get('COMPLETED') || 0) +
    (statusCounts.get('PUBLISHED') || 0);

  const completedOrPublished =
    (statusCounts.get('COMPLETED') || 0) +
    (statusCounts.get('PUBLISHED') || 0);

  const approvedPct = totalProjects > 0 ? ((approvedProjects / totalProjects) * 100).toFixed(1) : '0.0';
  const claimedPct = totalProjects > 0 ? ((activeOrClaimed / totalProjects) * 100).toFixed(1) : '0.0';
  const completedPct = totalProjects > 0 ? ((completedOrPublished / totalProjects) * 100).toFixed(1) : '0.0';

  const ceoName = siteConfig.company.leadership.ceo.name;
  const mdName = siteConfig.company.leadership.md.name;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operational & Marketplace Analytics</h1>
          <p className="text-xs text-muted mt-1">
            Executive performance telemetry for CEO {ceoName} and MD {mdName}. Real-time queries from database ledgers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAnalytics}
          disabled={loading}
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-accent" />
          <p className="text-xs text-muted">Aggregating platform metrics from database...</p>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
            <AlertCircle className="h-8 w-8 text-status-danger" />
            <p className="text-xs font-semibold text-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={fetchAnalytics}>
              Retry Loading
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Analytics KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-surface-elevated">
              <CardHeader className="pb-2">
                <span className="text-xs text-muted uppercase font-semibold">Verified Developers</span>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold font-mono text-accent">
                  {data?.verifiedDevelopers ?? 0}
                </div>
                <p className="text-[11px] text-muted mt-1">Approved active network members</p>
              </CardContent>
            </Card>

            <Card className="bg-surface-elevated">
              <CardHeader className="pb-2">
                <span className="text-xs text-muted uppercase font-semibold">Average Claims Per Project</span>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold font-mono text-foreground">
                  {data?.avgClaimsPerProject ?? '0.0'}
                </div>
                <p className="text-[11px] text-muted mt-1">Total claims: {data?.totalClaims ?? 0}</p>
              </CardContent>
            </Card>

            <Card className="bg-surface-elevated">
              <CardHeader className="pb-2">
                <span className="text-xs text-muted uppercase font-semibold">Credits in Circulation</span>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold font-mono text-status-success">
                  {data?.totalCreditsInCirculation ?? 0} Cr
                </div>
                <p className="text-[11px] text-muted mt-1">Total active wallet balances</p>
              </CardContent>
            </Card>

            <Card className="bg-surface-elevated">
              <CardHeader className="pb-2">
                <span className="text-xs text-muted uppercase font-semibold">Verified Gateway Revenue</span>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold font-mono text-electric-purple">
                  ₹{Number(data?.totalRevenueInr || 0).toLocaleString()}
                </div>
                <p className="text-[11px] text-muted mt-1">Total verified gateway payments</p>
              </CardContent>
            </Card>
          </div>

          {/* Conversion Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Master Business Flow Conversion</CardTitle>
              <CardDescription>
                Live pipeline metrics from Client Submission to Public Case Study Publishing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">1. Client Submissions (Total: {totalProjects})</span>
                  <span className="font-mono text-foreground">{totalProjects > 0 ? '100%' : '0%'}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-accent"
                    style={{ width: totalProjects > 0 ? '100%' : '0%' }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">2. Admin Approved for Claims (Total: {approvedProjects})</span>
                  <span className="font-mono text-foreground">{approvedPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-accent/80"
                    style={{ width: `${Math.min(100, Math.max(0, Number(approvedPct)))}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">3. Fully Claimed & Active (Total: {activeOrClaimed})</span>
                  <span className="font-mono text-foreground">{claimedPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-electric-purple"
                    style={{ width: `${Math.min(100, Math.max(0, Number(claimedPct)))}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">4. Completed & Published to Portfolio (Total: {completedOrPublished})</span>
                  <span className="font-mono text-foreground">{completedPct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full bg-status-success"
                    style={{ width: `${Math.min(100, Math.max(0, Number(completedPct)))}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
