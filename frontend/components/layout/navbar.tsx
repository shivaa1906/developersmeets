'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Terminal, Menu, X, ArrowRight, LayoutDashboard, LogOut, User } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isAuthPage =
    pathname === '/login' ||
    pathname.startsWith('/register') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';
  const isDashboardPage = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');

  if (isAuthPage || isDashboardPage) {
    return null;
  }

  const dashboardHref =
    user?.role === 'CEO' || user?.role === 'MD' || user?.role === 'ADMIN'
      ? '/admin/dashboard'
      : user?.role === 'SUPPORT'
      ? '/admin/support'
      : '/dashboard';

  const userDisplayName =
    user?.role === 'CLIENT'
      ? user.clientNumber || 'Client'
      : user?.name || user?.email?.split('@')[0] || 'Member';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent shadow-accent-glow">
            <Terminal className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-wider text-foreground">
              NEXUS<span className="text-accent">.DEV</span>
            </span>
            <span className="text-[9px] uppercase tracking-widest text-muted">Engineering Co.</span>
          </div>
        </Link>

        {/* Desktop Navigation - Strictly public, no internal dashboard exposure */}
        <nav className="hidden md:flex items-center space-x-6 text-xs font-medium">
          {siteConfig.navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'transition-colors hover:text-accent tracking-wide',
                  isActive ? 'text-accent font-semibold' : 'text-muted'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <Link href={dashboardHref}>
                <Button size="sm" variant="default" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                  Dashboard
                </Button>
              </Link>
              <div className="flex items-center space-x-2 pl-2 border-l border-border">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-bold">
                  {userDisplayName.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                  {userDisplayName}
                </span>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="text-muted hover:text-status-danger p-1 rounded transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link href="/register/developer">
                <Button variant="ghost" size="sm" className="hidden lg:inline-flex text-muted hover:text-accent">
                  Join Developer Network
                </Button>
              </Link>
              <Link href="/register/client">
                <Button variant="outline" size="sm">
                  Get Started
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Start a Project
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <div className="flex md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-muted hover:text-foreground focus:outline-none"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-surface px-4 py-4 space-y-3">
          <nav className="flex flex-col space-y-2">
            {siteConfig.navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pt-3 border-t border-border flex flex-col space-y-2">
            {user ? (
              <>
                <div className="px-3 py-1 flex items-center justify-between text-xs text-muted">
                  <span>Signed in as <strong className="text-foreground">{userDisplayName}</strong></span>
                  <button onClick={logout} className="text-status-danger hover:underline flex items-center space-x-1">
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
                <Link href={dashboardHref} onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                    Open Dashboard
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">
                    Login
                  </Button>
                </Link>
                <Link href="/register/developer" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full text-accent hover:bg-accent/10">
                    Join Developer Network
                  </Button>
                </Link>
                <Link href="/register/client" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="secondary" size="sm" className="w-full">
                    Get Started (Client)
                  </Button>
                </Link>
                <Link href="/contact" onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full">
                    Start a Project
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
