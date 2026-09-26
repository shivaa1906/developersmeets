'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  User,
  FolderGit2,
  MessageSquare,
  Users2,
  Mail,
  Coins,
  Settings,
  LogOut,
  Terminal,
  Bell,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';

const iconMap: Record<string, React.ReactNode> = {
  Overview: <LayoutDashboard className="h-4 w-4" />,
  Profile: <User className="h-4 w-4" />,
  Projects: <FolderGit2 className="h-4 w-4" />,
  Messages: <MessageSquare className="h-4 w-4" />,
  Community: <Users2 className="h-4 w-4" />,
  Support: <LifeBuoy className="h-4 w-4" />,
  Notifications: <Bell className="h-4 w-4" />,
  Inquiries: <Mail className="h-4 w-4" />,
  'Credits & Wallet': <Coins className="h-4 w-4" />,
  Settings: <Settings className="h-4 w-4" />,
};

const clientNav = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Projects', href: '/dashboard/projects' },
  { label: 'Messages', href: '/dashboard/messages' },
  { label: 'Support', href: '/dashboard/support' },
  { label: 'Notifications', href: '/dashboard/notifications' },
  { label: 'Settings', href: '/dashboard/settings' },
];

const developerNav = [
  { label: 'Overview', href: '/dashboard' },
  { label: 'Profile', href: '/dashboard/profile' },
  { label: 'Projects', href: '/dashboard/projects' },
  { label: 'Messages', href: '/dashboard/messages' },
  { label: 'Community', href: '/dashboard/community' },
  { label: 'Support', href: '/dashboard/support' },
  { label: 'Credits & Wallet', href: '/dashboard/credits' },
  { label: 'Settings', href: '/dashboard/settings' },
];

export const DashboardShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, isLoading, logout } = useAuth();
  const { subscribe } = useRealtime();
  const { addToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);

  const isClient = user?.role === 'CLIENT';
  const navItems = isClient ? clientNav : developerNav;

  React.useEffect(() => {
    if (!isLoading && (!token || !user)) {
      router.push(`/login?next=${encodeURIComponent(pathname)}&redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, token, user, pathname, router]);

  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const roleDisplay = isClient
    ? user?.clientNumber || 'Client'
    : user?.role === 'CEO'
    ? 'Chief Executive Officer'
    : user?.role === 'MD'
    ? 'Managing Director'
    : user?.role === 'SUPPORT'
    ? 'Support Staff'
    : 'Verified Developer';

  React.useEffect(() => {
    if (!user?.id) return;

    // Fetch initial unread count
    apiClient
      .get<{ unreadCount: number }>('/notifications?limit=1')
      .then((res) => {
        if (typeof res.unreadCount === 'number') {
          setUnreadCount(res.unreadCount);
        }
      })
      .catch(() => {});

    // Subscribe to personal notification channel
    const userChannel = `user:${user.id}`;
    const unsubscribe = subscribe(userChannel, (event: any) => {
      if (event.event === 'notification:new') {
        const notif = event.data;
        setUnreadCount((prev) => prev + 1);
        addToast('info', notif.title || 'Notification', notif.message);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id, subscribe, addToast]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-[#080808] md:flex">
        {/* Brand */}
        <div className="flex h-16 items-center px-6 border-b border-border">
          <Link href="/" className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
              <Terminal className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-wider">
              NEXUS<span className="text-accent">.DEV</span>
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {isClient ? 'Client Portal' : 'Developer Workspace'}
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center space-x-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
                    : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                )}
              >
                {iconMap[item.label]}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User preview & footer */}
        <div className="border-t border-border p-4">
          <div className="flex items-center justify-between rounded-lg bg-surface p-2.5 border border-border">
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent font-semibold text-xs">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                <div className="flex items-center space-x-1.5">
                  <p className="text-[10px] text-muted">{roleDisplay}</p>
                  {(user?.uid || user?.publicUid) && (
                    <span className="text-[9px] font-mono text-accent/80 bg-accent/10 px-1 py-0.5 rounded" title={`UID: ${user.uid || user.publicUid}`}>
                      {user.uid || user.publicUid}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={logout} title="Sign Out" className="text-muted hover:text-status-danger p-1">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-[#080808]/70 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center space-x-3">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-1.5 text-muted hover:bg-surface-elevated hover:text-foreground focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              <Terminal className="h-5 w-5 text-accent" />
            </button>
            <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-muted">
              {isClient ? 'Client Portal' : 'Developer Portal'}
            </span>
            <span className="hidden sm:inline text-muted">/</span>
            <span className="text-xs font-medium text-foreground truncate max-w-[120px] sm:max-w-none">
              {navItems.find((n) => n.href === pathname)?.label || 'Dashboard'}
            </span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            {/* Credit Counter Pill - Only for Developers */}
            {!isClient && (
              <Link
                href="/dashboard/credits"
                className="flex items-center space-x-1.5 sm:space-x-2 rounded-full border border-accent/30 bg-accent/10 px-2.5 sm:px-3 py-1 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
              >
                <Coins className="h-3.5 w-3.5" />
                <span>Wallet</span>
              </Link>
            )}

            {/* Notification Bell */}
            <Link
              href="/dashboard/notifications"
              className="relative rounded-lg p-2 text-muted hover:bg-surface-elevated hover:text-foreground transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-black">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-[#0a0a0a] px-4 py-4 space-y-2">
            <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
              {isClient ? 'Client Portal Menu' : 'Workspace Menu'}
            </div>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center space-x-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-accent/10 text-accent border border-accent/20'
                      : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                  )}
                >
                  {iconMap[item.label]}
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted truncate">{displayName} ({roleDisplay})</span>
              <button
                onClick={logout}
                className="flex items-center space-x-1 text-xs text-status-danger hover:underline"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
