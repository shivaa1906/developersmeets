'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { RefreshCw, Briefcase, AlertCircle } from 'lucide-react';

interface ClaimItem {
  id: string;
  project_id: string;
  developer_id: string;
  developer_tag?: string;
  credit_cost: number;
  status: string;
  refund_status?: string;
  claimed_at: string;
  project_number: string;
  project_title: string;
  developer_username: string;
  developer_name: string;
}

export default function AdminClaimsPage() {
  const [claims, setClaims] = React.useState<ClaimItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchClaims = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ claims: ClaimItem[] }>('/admin/claims');
      setClaims(res.claims || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load claims history from server.');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Project Claims Oversight</h1>
          <p className="text-xs text-muted mt-1">
            Monitor developer project slot claims, credit escrow locks, client selections, and auto-refund executions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchClaims}
          disabled={loading}
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Claims History</CardTitle>
          <CardDescription>
            Selected developers keep claim fee consumed; unselected candidates receive immediate 100% credit refund.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <p className="text-xs text-muted">Loading claims log...</p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <AlertCircle className="h-8 w-8 text-status-danger" />
              <p className="text-xs font-semibold text-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchClaims}>
                Retry Loading
              </Button>
            </div>
          ) : claims.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <Briefcase className="h-10 w-10 text-muted opacity-40" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No claims found</p>
                <p className="text-xs text-muted max-w-md">
                  When verified developers claim open project slots using their credit wallet, the transactions will appear here.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Anonymous Tag</TableHead>
                  <TableHead>Developer Identity (Admin)</TableHead>
                  <TableHead>Claim Time</TableHead>
                  <TableHead>Claim Cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Escrow / Refund State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      <div>{c.project_number}</div>
                      <div className="text-[10px] text-muted truncate max-w-[180px]">{c.project_title}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-accent">
                      {c.developer_tag || 'Developer'}
                    </TableCell>
                    <TableCell className="text-xs text-foreground">
                      <div className="font-medium">{c.developer_name || c.developer_username}</div>
                      <div className="text-[10px] text-muted font-mono">@{c.developer_username}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted font-mono">
                      {new Date(c.claimed_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground">
                      {c.credit_cost} {c.credit_cost === 1 ? 'Credit' : 'Credits'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === 'SELECTED'
                            ? 'success'
                            : c.status === 'NOT_SELECTED'
                            ? 'outline'
                            : 'warning'
                        }
                        size="sm"
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted text-right font-mono">
                      {c.refund_status || (c.status === 'SELECTED' ? 'CONSUMED' : c.status === 'NOT_SELECTED' ? 'REFUNDED' : 'ESCROW_ACTIVE')}
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
