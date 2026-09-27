'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils';
import {
  ShieldAlert,
  Users,
  Briefcase,
  UserCheck,
  CheckSquare,
  Coins,
  CreditCard,
  MessageCircle,
  MessagesSquare,
  LifeBuoy,
  BarChart3,
  Sliders,
  LogOut,
  Terminal,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ThemeNavbarToggle } from '@/components/ui/theme-selector';

const adminIconMap: Record<string, React.ReactNode> = {
  'Admin Overview': <ShieldAlert className="h-4 w-4" />,
  Developers: <Users className="h-4 w-4" />,
  Projects: <Briefcase className="h-4 w-4" />,
  Clients: <UserCheck className="h-4 w-4" />,
  Claims: <CheckSquare className="h-4 w-4" />,
  'Credits Ledger': <Coins className="h-4 w-4" />,
  Payments: <CreditCard className="h-4 w-4" />,
  Inquiries: <MessageCircle className="h-4 w-4" />,
  Community: <MessagesSquare className="h-4 w-4" />,
  'Support Bridges': <LifeBuoy className="h-4 w-4" />,
  Analytics: <BarChart3 className="h-4 w-4" />,
  'Platform Settings': <Sliders className="h-4 w-4" />,
};

export const AdminShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isSupport = user?.role === 'SUPPORT';
  const navItems = React.useMemo(() => {
    if (isSupport) {
      // Support sees: Support Queue, Tickets, Bridges
      // Support must not automatically receive credit-management permissions or admin controls
      return siteConfig.adminNav.filter((item) =>
        ['Support Bridges', 'Inquiries'].includes(item.label)
      );
    }
    return siteConfig.adminNav;
  }, [isSupport]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Admin Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-surface-elevated md:flex">
        {/* Brand */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-border">
          <Link href={isSupport ? "/admin/support" : "/admin/dashboard"} className="flex items-center space-x-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-status-warning/40 bg-status-warning/10 text-status-warning">
              <Terminal className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider">
                {isSupport ? 'SUPPORT' : 'EXECUTIVE'}<span className="text-status-warning">.HQ</span>
              </span>
              <span className="text-[9px] uppercase tracking-widest text-muted">
                {isSupport ? 'Operations Suite' : 'Control Suite'}
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-3 py-4 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {isSupport ? 'Support Operations' : 'Administration'}
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
                    ? 'bg-status-warning/10 text-status-warning border border-status-warning/20'
                    : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                )}
              >
                {adminIconMap[item.label]}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Identity Footprint */}
        <div className="border-t border-border p-4 bg-surface">
          <div className="rounded-lg bg-surface p-3 border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                {isSupport ? 'Staff Session' : 'Executive Sign-in'}
              </span>
              <span className="h-2 w-2 rounded-full bg-status-success animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">
                {user?.name || (isSupport ? 'Support Specialist' : siteConfig.company.leadership.ceo.name)}
              </p>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <p className="text-[10px] text-accent">
                  {user?.role === 'CEO'
                    ? 'Chief Executive Officer'
                    : user?.role === 'MD'
                    ? 'Managing Director'
                    : user?.role === 'ADMIN'
                    ? 'Administrator'
                    : 'Support Staff'}
                </p>
                {(user?.uid || user?.publicUid) && (
                  <span className="text-[9px] font-mono text-accent/80 bg-accent/10 px-1 py-0.5 rounded" title={`UID: ${user.uid || user.publicUid}`}>
                    {user.uid || user.publicUid}
                  </span>
                )}
              </div>
            </div>
            {!isSupport && (
              <div className="pt-1 border-t border-border/50 text-[10px] text-muted">
                MD: <span className="text-foreground font-medium">{siteConfig.company.leadership.md.name}</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 sm:px-6 backdrop-blur-md">
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-1.5 text-muted hover:bg-surface-elevated hover:text-foreground focus:outline-none"
              aria-label="Toggle admin menu"
            >
              <Terminal className="h-5 w-5 text-status-warning" />
            </button>
            <span className="rounded bg-status-warning/10 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-status-warning border border-status-warning/30 uppercase tracking-widest truncate">
              {isSupport ? 'SUPPORT' : 'SUPERADMIN'}
            </span>
            <span className="hidden sm:inline text-xs text-muted">/</span>
            <span className="hidden sm:inline text-xs font-medium text-foreground truncate max-w-[140px] sm:max-w-none">
              {navItems.find((n) => n.href === pathname)?.label || (isSupport ? 'Support Operations' : 'Administration')}
            </span>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-4">
            <ThemeNavbarToggle />
            <Link href="/dashboard" className="hidden xs:inline text-[11px] sm:text-xs text-muted hover:text-accent transition-colors">
              Developer View
            </Link>
            <Link href="/" className="hidden sm:inline text-xs text-muted hover:text-foreground transition-colors">
              Public Site
            </Link>
            <button onClick={logout} className="text-muted hover:text-status-danger transition-colors p-1" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-surface px-4 py-4 space-y-2">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Executive Modules
            </div>
            <div className="grid grid-cols-2 gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center space-x-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-status-warning/10 text-status-warning border border-status-warning/20'
                        : 'text-muted hover:bg-surface-elevated hover:text-foreground'
                    )}
                  >
                    {adminIconMap[item.label]}
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted">
              <Link href="/dashboard" className="text-accent hover:underline">
                Switch to Developer View
              </Link>
              <button onClick={logout} className="text-status-danger hover:underline">
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};
