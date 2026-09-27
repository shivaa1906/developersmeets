'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { Lock, RefreshCw, Users, AlertCircle } from 'lucide-react';

interface ClientItem {
  id: string;
  client_number: string;
  company_name: string;
  private_name: string;
  phone: string;
  created_at: string;
  user_uid: string;
  user_public_uid?: string;
  email: string;
  user_status: string;
  projects_count: number;
}

export default function AdminClientsPage() {
  const [clients, setClients] = React.useState<ClientItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchClients = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ clients: ClientItem[] }>('/admin/clients');
      setClients(res.clients || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load client records.');
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Client Directory</h1>
          <p className="text-xs text-muted mt-1">
            Internal private client records. Client identities are shielded by platform tags (e.g. Client #001) in all marketplace interactions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchClients}
          disabled={loading}
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <p className="text-xs text-muted">Loading client directory...</p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <AlertCircle className="h-8 w-8 text-status-danger" />
              <p className="text-xs font-semibold text-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchClients}>
                Retry Loading
              </Button>
            </div>
          ) : clients.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <Users className="h-10 w-10 text-muted opacity-40" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No clients registered yet</p>
                <p className="text-xs text-muted max-w-md">
                  Client profiles will appear here once clients complete onboarding or submit project proposals.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Public Tag</TableHead>
                  <TableHead>Internal Contact Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Confidential Contact</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Account Status</TableHead>
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
                      {c.private_name || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{c.company_name || 'Independent'}</TableCell>
                    <TableCell className="text-xs text-muted font-mono">
                      <div>{c.email}</div>
                      {c.phone && <div className="text-[10px] text-muted/70">{c.phone}</div>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground">
                      {c.projects_count} {Number(c.projects_count) === 1 ? 'Project' : 'Projects'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.user_status === 'ACTIVE' ? 'success' : 'danger'}
                        size="sm"
                      >
                        {c.user_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted text-right font-mono">
                      {new Date(c.created_at).toLocaleDateString()}
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
