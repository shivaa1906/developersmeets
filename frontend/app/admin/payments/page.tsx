'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { RefreshCw, CreditCard, AlertCircle } from 'lucide-react';

interface PaymentItem {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  gateway: string;
  gateway_payment_id: string;
  status: string;
  created_at: string;
  user_email: string;
  user_role: string;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = React.useState<PaymentItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchPayments = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ payments: PaymentItem[] }>('/admin/payments');
      setPayments(res.payments || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment transactions from server.');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gateway Payments & Verification</h1>
          <p className="text-xs text-muted mt-1">
            Server-verified gateway events. Only authenticated webhook signatures generate credit ledger transactions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchPayments}
          disabled={loading}
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Logs</CardTitle>
          <CardDescription>Direct webhook verification status and idempotency keys</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <p className="text-xs text-muted">Retrieving verified payments ledger...</p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <AlertCircle className="h-8 w-8 text-status-danger" />
              <p className="text-xs font-semibold text-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchPayments}>
                Retry Loading
              </Button>
            </div>
          ) : payments.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <CreditCard className="h-10 w-10 text-muted opacity-40" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No payment records found</p>
                <p className="text-xs text-muted max-w-md">
                  Gateway events will appear here in real time when developers purchase credits via supported payment gateways.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment Ref</TableHead>
                  <TableHead>User / Payer</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>Gateway ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs font-semibold text-foreground">
                      {p.id.substring(0, 12)}...
                    </TableCell>
                    <TableCell className="text-xs font-medium text-foreground">
                      <div>{p.user_email}</div>
                      <span className="text-[10px] text-muted font-mono">{p.user_role}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted font-mono">{p.gateway}</TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {p.gateway_payment_id || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {p.currency === 'INR' ? '₹' : `${p.currency} `}
                      {Number(p.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === 'SUCCESS' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted text-right font-mono">
                      {new Date(p.created_at).toLocaleString()}
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
