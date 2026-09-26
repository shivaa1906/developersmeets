'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function AdminPaymentsPage() {
  const payments = [
    {
      id: 'pay-001',
      gateway: 'Razorpay',
      gateway_id: 'pay_NzkD83jf93kd',
      developer: 'Ritesh Lingamallu',
      amount: '₹500',
      credits: '10 Credits',
      status: 'SUCCESS',
      date: '2026-09-20 09:00:00',
    },
    {
      id: 'pay-002',
      gateway: 'Razorpay',
      gateway_id: 'pay_NzkD99jf11qa',
      developer: 'Rahul Kumar',
      amount: '₹1,000',
      credits: '20 Credits',
      status: 'SUCCESS',
      date: '2026-09-22 14:12:00',
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gateway Payments & Verification</h1>
        <p className="text-xs text-muted mt-1">
          Server-verified gateway events. Only authenticated webhook signatures generate credit ledger transactions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Logs</CardTitle>
          <CardDescription>Direct webhook verification status and idempotency keys</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Ref</TableHead>
                <TableHead>Developer</TableHead>
                <TableHead>Gateway ID</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-semibold text-foreground">{p.id}</TableCell>
                  <TableCell className="text-xs font-medium text-foreground">{p.developer}</TableCell>
                  <TableCell className="font-mono text-xs text-muted">{p.gateway_id}</TableCell>
                  <TableCell className="font-mono text-xs font-bold text-foreground">{p.amount}</TableCell>
                  <TableCell className="font-mono text-xs text-accent">{p.credits}</TableCell>
                  <TableCell>
                    <Badge variant="success" size="sm">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted text-right font-mono">{p.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
