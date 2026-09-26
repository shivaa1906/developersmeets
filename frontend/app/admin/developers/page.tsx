'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { Check, X, Shield, ExternalLink, RefreshCw } from 'lucide-react';

interface DeveloperRow {
  id: string;
  display_name: string;
  username: string;
  email: string;
  role_title: string;
  experience: number;
  github_url: string;
  verification_status: string;
  created_at: string;
}

export default function AdminDevelopersPage() {
  const { addToast } = useToast();
  const [developers, setDevelopers] = React.useState<DeveloperRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);

  const fetchPendingDevs = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ pendingDevelopers: DeveloperRow[] }>('/admin/developers/pending');
      setDevelopers(res.pendingDevelopers || []);
    } catch (_err) {
      setDevelopers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPendingDevs();
  }, [fetchPendingDevs]);

  const handleApprove = async (id: string, name: string) => {
    setActionLoadingId(id);
    try {
      await apiClient.post(`/admin/developers/${id}/approve`);
      addToast(
        'success',
        'Developer Verified & Seeded',
        `${name} has been verified. 10 welcome credits have been deposited into their wallet.`
      );
      await fetchPendingDevs();
    } catch (err: any) {
      addToast('error', 'Approval Failed', err.message || 'Unable to approve developer.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoadingId(id);
    try {
      await apiClient.post(`/admin/developers/${id}/reject`, { reason: 'Application criteria not met.' });
      addToast('info', 'Developer Rejected', 'Developer application was rejected.');
      await fetchPendingDevs();
    } catch (err: any) {
      addToast('error', 'Rejection Failed', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Developer Applications & Verification</h1>
          <p className="text-xs text-muted mt-1">
            Review technical submissions, GitHub repos, and authorize verified marketplace claim permissions.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={fetchPendingDevs}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Verification Queue</CardTitle>
          <CardDescription>
            Candidates with PENDING_VERIFICATION cannot access the marketplace or community until approved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-8 text-center text-xs text-muted">Loading pending developer applications...</div>
          ) : developers.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              No pending developer applications at this time. All submissions are verified!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Role & Experience</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Executive Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {developers.map((dev) => (
                  <TableRow key={dev.id}>
                    <TableCell>
                      <div>
                        <span className="font-semibold text-foreground text-xs block">{dev.display_name}</span>
                        <span className="text-[10px] text-muted font-mono">@{dev.username}</span>
                        <span className="text-[10px] text-muted block">{dev.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="text-foreground font-medium block">{dev.role_title}</span>
                      <span className="text-[10px] text-muted">{dev.experience} Years Exp</span>
                    </TableCell>
                    <TableCell>
                      {dev.github_url ? (
                        <a
                          href={dev.github_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent hover:underline text-xs flex items-center space-x-1"
                        >
                          <span>GitHub</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted">No link</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="warning" size="sm">
                        {dev.verification_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-status-success text-white hover:bg-status-success/80"
                          isLoading={actionLoadingId === dev.id}
                          onClick={() => handleApprove(dev.id, dev.display_name)}
                          leftIcon={<Check className="h-3 w-3" />}
                        >
                          Verify & Grant 10 Credits
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          isLoading={actionLoadingId === dev.id}
                          onClick={() => handleReject(dev.id)}
                          leftIcon={<X className="h-3 w-3" />}
                        >
                          Reject
                        </Button>
                      </div>
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
