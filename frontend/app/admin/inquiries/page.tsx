'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { MessageSquare, RefreshCw, AlertCircle } from 'lucide-react';

interface InquiryItem {
  id: string;
  client_id?: string;
  developer_id: string;
  client_tag: string;
  subject: string;
  preview?: string;
  message: string;
  status: string;
  created_at: string;
  developer_username: string;
  developer_name: string;
  client_number?: string;
  company_name?: string;
}

export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = React.useState<InquiryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchInquiries = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ inquiries: InquiryItem[] }>('/admin/inquiries');
      setInquiries(res.inquiries || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load inquiries from server.');
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Inquiries Oversight</h1>
          <p className="text-xs text-muted mt-1">
            Monitor communications routed from public project pages and client portals to verified developers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchInquiries}
          disabled={loading}
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquiry Pipeline</CardTitle>
          <CardDescription>All direct inquiries preserved with confidential client tags</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <p className="text-xs text-muted">Loading inquiry pipeline...</p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <AlertCircle className="h-8 w-8 text-status-danger" />
              <p className="text-xs font-semibold text-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchInquiries}>
                Retry Loading
              </Button>
            </div>
          ) : inquiries.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <MessageSquare className="h-10 w-10 text-muted opacity-40" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No inquiries found</p>
                <p className="text-xs text-muted max-w-md">
                  Inquiries initiated by clients towards verified developers will be recorded and displayed here.
                </p>
              </div>
            </div>
          ) : (
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
                    <TableCell className="font-mono text-xs text-accent font-semibold">
                      {inq.client_tag || inq.client_number || 'Client'}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-foreground">
                      <div>{inq.subject}</div>
                      {inq.preview && (
                        <div className="text-[11px] text-muted line-clamp-1 font-normal">{inq.preview}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      <div className="text-foreground font-medium">{inq.developer_name || inq.developer_username}</div>
                      <div className="font-mono text-[10px] text-muted">@{inq.developer_username}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inq.status === 'RESPONDED' ? 'success' : inq.status === 'NEW' ? 'warning' : 'outline'}
                        size="sm"
                      >
                        {inq.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted text-right font-mono">
                      {new Date(inq.created_at).toLocaleDateString()}
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
