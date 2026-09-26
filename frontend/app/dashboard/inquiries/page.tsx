'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface InquiryItem {
  id: string;
  client_tag: string;
  subject: string;
  preview: string;
  created_at: string;
  status: string;
}

export default function DashboardInquiriesPage() {
  const [inquiries, setInquiries] = React.useState<InquiryItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient
      .get<{ inquiries: InquiryItem[] }>('/developers/inquiries')
      .then((res) => {
        setInquiries(res.inquiries || []);
      })
      .catch(() => {
        setInquiries([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Direct Client Inquiries</h1>
        <p className="text-xs text-muted mt-1">
          Confidential inquiries routed to you through the platform proxy based on your public portfolio.
        </p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted">Loading inquiries...</div>
        ) : inquiries.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted">
            No incoming client inquiries yet. Once your public projects and portfolio are viewed, clients can contact you confidentially.
          </Card>
        ) : (
          inquiries.map((inq) => (
            <Card key={inq.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-xs text-accent">{inq.client_tag}</span>
                    <Badge variant="default" size="sm">
                      {inq.status}
                    </Badge>
                    <span className="text-[10px] text-muted">
                      {new Date(inq.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-foreground">{inq.subject}</h4>
                  <p className="text-xs text-muted leading-relaxed">{inq.preview}</p>
                </div>

                <Button size="sm" variant="secondary" leftIcon={<MessageSquare className="h-3.5 w-3.5" />}>
                  Respond via Bridge
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
