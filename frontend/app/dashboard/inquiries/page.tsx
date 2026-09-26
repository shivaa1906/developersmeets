'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Mail, Clock, MessageSquare } from 'lucide-react';

export default function DashboardInquiriesPage() {
  const inquiries = [
    {
      id: 'inq-1',
      client_tag: 'Client #002',
      subject: 'Inquiry regarding Distributed Event Mesh Architecture',
      preview:
        'We reviewed your published case study for PRJ-2026-0001 and would like to understand your availability for a Q4 enterprise deployment.',
      date: '2 days ago',
      status: 'NEW',
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Direct Client Inquiries</h1>
        <p className="text-xs text-muted mt-1">
          Confidential inquiries routed to you through the platform proxy based on your public portfolio.
        </p>
      </div>

      <div className="space-y-4">
        {inquiries.map((inq) => (
          <Card key={inq.id} className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-xs text-accent">{inq.client_tag}</span>
                  <Badge variant="default" size="sm">
                    {inq.status}
                  </Badge>
                  <span className="text-[10px] text-muted">{inq.date}</span>
                </div>
                <h4 className="text-sm font-bold text-foreground">{inq.subject}</h4>
                <p className="text-xs text-muted leading-relaxed">{inq.preview}</p>
              </div>

              <Button size="sm" variant="secondary" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                Respond via Bridge
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
