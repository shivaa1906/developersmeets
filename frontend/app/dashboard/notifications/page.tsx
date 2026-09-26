'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { Bell, CheckCheck, Clock, ArrowRight, ShieldCheck, Mail } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link?: string;
  created_at: string;
}

export default function NotificationsPage() {
  const { addToast } = useToast();
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [markingAll, setMarkingAll] = React.useState(false);

  const fetchNotifications = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get<{ notifications: NotificationItem[] }>('/notifications');
      setNotifications(res.notifications || []);
    } catch (_err) {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await apiClient.post('/notifications/read-all', {});
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      addToast('success', 'Updated', 'All notifications marked as read.');
    } catch (err: any) {
      addToast('error', 'Error', err.message || 'Failed to mark notifications read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`, {});
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    } catch (_e) {}
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-xs text-muted mt-1">
            Stay updated on project milestones, developer proposals, and support ticket activities.
          </p>
        </div>

        {notifications.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleMarkAllRead}
            isLoading={markingAll}
            leftIcon={<CheckCheck className="h-3.5 w-3.5" />}
          >
            Mark All as Read
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="h-4 w-4 text-accent" />
              <span>Activity Feed</span>
            </div>
            <Badge variant="outline" size="sm">
              {notifications.filter((n) => !n.is_read).length} Unread
            </Badge>
          </CardTitle>
          <CardDescription>Real-time updates delivered to your platform account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="py-8 text-center text-xs text-muted">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised border border-border text-muted">
                <Bell className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-foreground">No notifications yet</div>
              <p className="text-xs text-muted max-w-sm mx-auto">
                You will receive alerts here when developers submit proposals to your projects or when support agents reply.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-lg border transition-all flex items-start justify-between gap-4 ${
                  item.is_read
                    ? 'bg-surface/50 border-border text-muted'
                    : 'bg-surface border-accent/30 text-foreground shadow-sm'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xs font-bold text-foreground">{item.title}</h4>
                    {!item.is_read && (
                      <span className="h-2 w-2 rounded-full bg-accent inline-block" />
                    )}
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      {item.type}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{item.message}</p>
                  <div className="flex items-center space-x-3 pt-1 text-[10px] text-muted font-mono">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(item.created_at).toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {item.link && (
                    <Link href={item.link} onClick={() => handleMarkRead(item.id)}>
                      <Button size="sm" variant="outline" className="text-xs h-7">
                        <span>View</span>
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                  {!item.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMarkRead(item.id)}
                      className="text-xs h-7 text-muted hover:text-foreground"
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
