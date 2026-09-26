'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function AdminInquiriesPage() {
  const inquiries = [
    {
      id: 'inq-01',
      client_tag: 'Client #001',
      subject: 'Phase 2 Scale-out Support',
      developer_target: 'Ritesh Lingamallu (Lead)',
      date: '2026-09-24',
      status: 'ROUTED',
    },
    {
      id: 'inq-02',
      client_tag: 'Client #002',
      subject: 'Inquiry regarding Event Mesh Architecture',
      developer_target: 'Ritesh Lingamallu',
      date: '2026-09-24',
      status: 'PENDING_RESPONSE',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Client Inquiries Oversight</h1>
        <p className="text-xs text-muted mt-1">
          Monitor communications routed from public project pages and client portals to verified developers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquiry Pipeline</CardTitle>
          <CardDescription>All direct inquiries preserved with confidential client tags</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Target Developer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries.map((inq) => (
                <TableRow key={inq.id}>
                  <TableCell className="font-mono text-xs text-accent font-semibold">{inq.client_tag}</TableCell>
                  <TableCell className="text-xs font-semibold text-foreground">{inq.subject}</TableCell>
                  <TableCell className="text-xs text-muted">{inq.developer_target}</TableCell>
                  <TableCell>
                    <Badge variant="outline" size="sm">
                      {inq.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted text-right font-mono">{inq.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
