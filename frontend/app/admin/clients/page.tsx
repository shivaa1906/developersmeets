'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';

export default function AdminClientsPage() {
  const clients = [
    {
      id: 'c-01',
      client_number: 'Client #001',
      real_name: 'Ravi Kumar',
      company_name: 'Apex Retail Labs',
      email: 'ravi@apexretail.io',
      phone: '+91 9988776655',
      projects_count: 2,
      created_at: '2026-09-01',
    },
    {
      id: 'c-04',
      client_number: 'Client #004',
      real_name: 'Vikram Mehta',
      company_name: 'DataVibe Technologies',
      email: 'vikram@datavibe.tech',
      phone: '+91 9811223344',
      projects_count: 1,
      created_at: '2026-09-22',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Client Directory</h1>
        <p className="text-xs text-muted mt-1">
          Internal private client records. Client identities are shielded by platform tags (e.g. Client #001) in all marketplace interactions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Registered Clients</CardTitle>
            <div className="flex items-center space-x-1.5 text-xs text-status-warning bg-status-warning/10 px-2.5 py-1 rounded-md border border-status-warning/30 font-mono">
              <Lock className="h-3.5 w-3.5" />
              <span>Admin Confidential</span>
            </div>
          </div>
          <CardDescription>
            Only CEO and privileged Admin can view real company and contact details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Public Tag</TableHead>
                <TableHead>Internal Real Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Confidential Contact</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead className="text-right">Created Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-bold text-accent">
                    {c.client_number}
                  </TableCell>
                  <TableCell className="text-xs font-semibold text-foreground">
                    {c.real_name}
                  </TableCell>
                  <TableCell className="text-xs text-muted">{c.company_name}</TableCell>
                  <TableCell className="text-xs text-muted font-mono">
                    <div>{c.email}</div>
                    <div className="text-[10px] text-muted/70">{c.phone}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground">
                    {c.projects_count} Projects
                  </TableCell>
                  <TableCell className="text-xs text-muted text-right font-mono">
                    {c.created_at}
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
