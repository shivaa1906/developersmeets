'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, Users, CheckCircle2, Coins } from 'lucide-react';

export default function AdminAnalyticsPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Operational & Marketplace Analytics</h1>
        <p className="text-xs text-muted mt-1">
          Executive performance telemetry for CEO Ritesh Lingamallu and MD M. Shiva Gopi.
        </p>
      </div>

      {/* Analytics KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Selection Rate</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-accent">94.2%</div>
            <p className="text-[11px] text-muted mt-1">Projects successfully matched to developer</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Average Claims Per Project</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-foreground">4.1 / 5</div>
            <p className="text-[11px] text-muted mt-1">High competitive claim velocity</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Milestone Delivery Score</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-status-success">98.6%</div>
            <p className="text-[11px] text-muted mt-1">Zero milestone disputes this quarter</p>
          </CardContent>
        </Card>

        <Card className="bg-surface-elevated">
          <CardHeader className="pb-2">
            <span className="text-xs text-muted uppercase font-semibold">Automated Refund Volume</span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold font-mono text-electric-purple">100%</div>
            <p className="text-[11px] text-muted mt-1">Instant credit return to unselected devs</p>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Master Business Flow Conversion</CardTitle>
          <CardDescription>
            Pipeline metrics from Client Submission to Public Case Study Publishing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">1. Client Submissions (Total: 28)</span>
              <span className="font-mono text-foreground">100%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
              <div className="h-full bg-accent w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">2. Admin Approved for Claims (Total: 24)</span>
              <span className="font-mono text-foreground">85.7%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
              <div className="h-full bg-accent/80 w-[85.7%]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">3. Fully Claimed & Evaluated (Total: 21)</span>
              <span className="font-mono text-foreground">75.0%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
              <div className="h-full bg-electric-purple w-[75%]" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">4. Completed & Published to Portfolio (Total: 16)</span>
              <span className="font-mono text-foreground">57.1%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-elevated overflow-hidden">
              <div className="h-full bg-status-success w-[57.1%]" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
