'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';
import { Hash, Plus, Shield, RefreshCw, AlertCircle, MessageSquare } from 'lucide-react';

interface ChannelItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_private: boolean;
  is_archived?: boolean;
  created_at: string;
}

export default function AdminCommunityPage() {
  const [channels, setChannels] = React.useState<ChannelItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchChannels = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ channels: ChannelItem[] }>('/community/channels?includeArchived=true');
      setChannels(res.channels || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load community channels.');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Community & Channel Governance</h1>
          <p className="text-xs text-muted mt-1">
            Manage private developer channels, moderator privileges, content guidelines, and user permissions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchChannels}
          disabled={loading}
          className="flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured Channels</CardTitle>
          <CardDescription>Private community channels accessible strictly to approved developers</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="h-6 w-6 animate-spin text-accent" />
              <p className="text-xs text-muted">Loading channels...</p>
            </div>
          ) : error ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <AlertCircle className="h-8 w-8 text-status-danger" />
              <p className="text-xs font-semibold text-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchChannels}>
                Retry Loading
              </Button>
            </div>
          ) : channels.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
              <MessageSquare className="h-10 w-10 text-muted opacity-40" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">No channels found</p>
                <p className="text-xs text-muted max-w-md">
                  Channels provisioned by the platform or created by administrators will be listed here.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Access Policy</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Created Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell className="font-mono text-xs font-semibold text-accent flex items-center space-x-1.5">
                      <Hash className="h-3.5 w-3.5" />
                      <span>{ch.name.startsWith('#') ? ch.name : `#${ch.name}`}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">{ch.slug}</TableCell>
                    <TableCell className="text-xs text-foreground">
                      {ch.is_private ? 'Private / Restricted' : 'Public to Verified Developers'}
                    </TableCell>
                    <TableCell className="text-xs text-muted max-w-xs truncate">
                      {ch.description || 'General discussion'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ch.is_archived ? 'outline' : 'success'} size="sm">
                        {ch.is_archived ? 'ARCHIVED' : 'ACTIVE'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted text-right font-mono">
                      {new Date(ch.created_at).toLocaleDateString()}
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
