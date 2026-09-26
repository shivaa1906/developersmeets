'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react';

interface TicketRow {
  id: string;
  ticket_number: string;
  project_title: string;
  client_number: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  created_at: string;
}

export default function AdminSupportPage() {
  const { addToast } = useToast();
  const [tickets, setTickets] = React.useState<TicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);

  const fetchTickets = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ tickets: TicketRow[] }>('/support/tickets');
      setTickets(res.tickets || []);
    } catch (_err) {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleResolveTicket = async (id: string, ticketNumber: string) => {
    setResolvingId(id);
    try {
      await apiClient.patch(`/support/tickets/${id}/status`, { status: 'RESOLVED' });
      addToast(
        'success',
        'Support Ticket Resolved',
        `Ticket ${ticketNumber} has been resolved and closed.`
      );
      await fetchTickets();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Unable to update status.');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Post-Completion Support Bridges</h1>
          <p className="text-xs text-muted mt-1">
            Normal project chat closes permanently upon project completion. Post-delivery assistance is strictly mediated via Support Bridges.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={fetchTickets}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Active Support Tickets</CardTitle>
            <div className="flex items-center space-x-1.5 text-xs text-accent font-mono bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Identity Shielded</span>
            </div>
          </div>
          <CardDescription>
            Executive and support agents act as technical mediators without exposing client personal contact information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted">Loading support tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">No support tickets found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs font-bold text-foreground">
                      {t.ticket_number}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{t.project_title}</TableCell>
                    <TableCell className="font-mono text-xs text-accent">{t.client_number}</TableCell>
                    <TableCell className="text-xs text-muted max-w-xs truncate">{t.subject}</TableCell>
                    <TableCell>
                      <Badge variant={t.priority === 'HIGH' ? 'danger' : 'outline'} size="sm">
                        {t.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'RESOLVED' ? 'success' : 'warning'} size="sm">
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status !== 'RESOLVED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          isLoading={resolvingId === t.id}
                          onClick={() => handleResolveTicket(t.id, t.ticket_number)}
                          leftIcon={<CheckCircle2 className="h-3 w-3" />}
                        >
                          Mark Resolved
                        </Button>
                      )}
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
