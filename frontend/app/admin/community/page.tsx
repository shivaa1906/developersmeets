'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Hash, Plus, Shield } from 'lucide-react';

export default function AdminCommunityPage() {
  const channels = [
    { name: '#general', type: 'Public to Verified', members: 42, activity: 'Active today' },
    { name: '#announcements', type: 'Executive Broadcast', members: 48, activity: 'Admin only posting' },
    { name: '#frontend', type: 'Technical Channel', members: 28, activity: 'Active' },
    { name: '#backend', type: 'Technical Channel', members: 34, activity: 'Active' },
    { name: '#ai-ml', type: 'Technical Channel', members: 22, activity: 'Active' },
    { name: '#projects', type: 'Marketplace Discussions', members: 45, activity: 'Active' },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Community & Channel Governance</h1>
          <p className="text-xs text-muted mt-1">
            Manage private developer channels, moderator privileges, content guidelines, and user permissions.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured Channels</CardTitle>
          <CardDescription>Private community channels accessible strictly to approved developers</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel Name</TableHead>
                <TableHead>Access Policy</TableHead>
                <TableHead>Member Count</TableHead>
                <TableHead className="text-right">Activity Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((ch) => (
                <TableRow key={ch.name}>
                  <TableCell className="font-mono text-xs font-semibold text-accent flex items-center space-x-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    <span>{ch.name}</span>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">{ch.type}</TableCell>
                  <TableCell className="font-mono text-xs text-muted">{ch.members} Devs</TableCell>
                  <TableCell className="text-xs text-muted text-right font-mono">{ch.activity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
