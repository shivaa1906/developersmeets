'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AdminClaimsPage() {
  const claims = [
    {
      id: 'clm-01',
      project_number: 'PRJ-2026-0004',
      developer_tag: 'Developer #01',
      real_developer: 'Ritesh Lingamallu',
      claimed_at: '2026-09-24 10:15',
      credit_cost: 1,
      status: 'CLAIMED',
      refund_status: 'ESCROW_ACTIVE',
    },
    {
      id: 'clm-02',
      project_number: 'PRJ-2026-0004',
      developer_tag: 'Developer #02',
      real_developer: 'Rahul Kumar',
      claimed_at: '2026-09-24 11:30',
      credit_cost: 1,
      status: 'CLAIMED',
      refund_status: 'ESCROW_ACTIVE',
    },
    {
      id: 'clm-03',
      project_number: 'PRJ-2026-0002',
      developer_tag: 'Developer #02',
      real_developer: 'Rahul Kumar',
      claimed_at: '2026-09-21 14:00',
      credit_cost: 1,
      status: 'NOT_SELECTED',
      refund_status: 'REFUNDED (+1 Cr)',
    },
    {
      id: 'clm-04',
      project_number: 'PRJ-2026-0002',
      developer_tag: 'Developer #01',
      real_developer: 'M. Shiva Gopi',
      claimed_at: '2026-09-21 09:20',
      credit_cost: 1,
      status: 'SELECTED',
      refund_status: 'CONSUMED (Lead)',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Project Claims Oversight</h1>
        <p className="text-xs text-muted mt-1">
          Monitor developer project slot claims, credit escrow locks, client selections, and auto-refund executions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Claims History</CardTitle>
          <CardDescription>
            Selected developers keep claim fee consumed; unselected candidates receive immediate 100% credit refund.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Anonymous Tag</TableHead>
                <TableHead>Real Developer (Admin)</TableHead>
                <TableHead>Claim Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ledger Refund State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-semibold text-foreground">
                    {c.project_number}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-accent">{c.developer_tag}</TableCell>
                  <TableCell className="text-xs text-foreground">{c.real_developer}</TableCell>
                  <TableCell className="text-xs text-muted font-mono">{c.claimed_at}</TableCell>
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
                  <TableCell className="text-right font-mono text-xs font-semibold">
                    <span
                      className={
                        c.refund_status.includes('REFUNDED')
                          ? 'text-status-success'
                          : c.refund_status.includes('CONSUMED')
                          ? 'text-muted'
                          : 'text-accent'
                      }
                    >
                      {c.refund_status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
