'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import { cn } from '@/lib/utils';
import {
  Terminal,
  Menu,
  X,
  ArrowRight,
  LayoutDashboard,
  LogOut,
  User,
  Settings,
  Bell,
  LifeBuoy,
  Briefcase,
  Users,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ThemeNavbarToggle } from '@/components/ui/theme-selector';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isDeveloper, isClient, isExecutive, isSupport } = useAuth();
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

  const dashboardHref = isExecutive
    ? '/admin/dashboard'
    : isSupport
    ? '/admin/support'
    : '/dashboard';

  const userDisplayName =
    user?.role === 'CLIENT'
      ? user.clientNumber || user.name || 'Client'
      : user?.name || user?.email?.split('@')[0] || 'Member';

  const userInitials = (
    user?.role === 'CLIENT'
      ? user.clientNumber?.slice(0, 2) || 'CL'
      : (user?.name || user?.email || 'US').slice(0, 2)
  ).toUpperCase();

  // Avatar Account Dropdown Menu Items
  const accountMenuItems: DropdownItem[] = [
    {
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-3.5 w-3.5 text-accent" />,
      onClick: () => router.push(dashboardHref),
    },
    {
      label: 'Profile',
      icon: <User className="h-3.5 w-3.5" />,
      onClick: () => router.push('/dashboard/profile'),
    },
    {
      label: 'Notifications',
      icon: <Bell className="h-3.5 w-3.5" />,
      onClick: () => router.push('/dashboard/notifications'),
    },
    {
      label: 'Settings',
      icon: <Settings className="h-3.5 w-3.5" />,
      onClick: () => router.push('/dashboard/settings'),
    },
    {
      label: 'Support',
      icon: <LifeBuoy className="h-3.5 w-3.5" />,
      onClick: () => router.push(isExecutive ? '/admin/support' : '/dashboard/support'),
    },
    {
      label: 'Sign Out',
      icon: <LogOut className="h-3.5 w-3.5" />,
      destructive: true,
      onClick: logout,
    },
  ];

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

        {/* Desktop Navigation */}
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

        {/* Actions - Role Based Desktop Bar */}
        <div className="hidden md:flex items-center space-x-3">
          <ThemeNavbarToggle />
          {user ? (
            <div className="flex items-center space-x-3">
              {/* CLIENT Authenticated State */}
              {isClient && (
                <>
                  <Link href="/dashboard">
                    <Button size="sm" variant="ghost" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                      Dashboard
                    </Button>
                  </Link>
                  <Link href="/start-project">
                    <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                      Start a Project
                    </Button>
                  </Link>
                </>
              )}

              {/* DEVELOPER Authenticated State */}
              {isDeveloper && !isExecutive && (
                <>
                  <Link href="/dashboard">
                    <Button size="sm" variant="ghost" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                      Dashboard
                    </Button>
                  </Link>
                  <Link href="/dashboard/projects">
                    <Button size="sm" variant="ghost" leftIcon={<Briefcase className="h-3.5 w-3.5" />}>
                      Projects
                    </Button>
                  </Link>
                  <Link href="/dashboard/community">
                    <Button size="sm" variant="ghost" leftIcon={<Users className="h-3.5 w-3.5" />}>
                      Community
                    </Button>
                  </Link>
                  <Link href="/dashboard/support">
                    <Button size="sm" variant="ghost" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                      Support
                    </Button>
                  </Link>
                </>
              )}

              {/* LEADERSHIP (CEO / MD / ADMIN) Authenticated State */}
              {isExecutive && (
                <>
                  <Link href="/admin/dashboard">
                    <Button size="sm" variant="ghost" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                      Dashboard
                    </Button>
                  </Link>
                  <Link href="/start-project">
                    <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                      Start a Project
                    </Button>
                  </Link>
                  <Link href="/admin/support">
                    <Button size="sm" variant="ghost" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                      Support
                    </Button>
                  </Link>
                </>
              )}

              {/* SUPPORT Authenticated State */}
              {isSupport && !isExecutive && !isClient && (
                <>
                  <Link href="/admin/support">
                    <Button size="sm" variant="outline" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                      Support Queue
                    </Button>
                  </Link>
                </>
              )}

              {/* Account Dropdown Trigger */}
              <div className="pl-2 border-l border-border">
                <Dropdown
                  align="right"
                  items={accountMenuItems}
                  trigger={
                    <button
                      type="button"
                      className="flex items-center space-x-2 rounded-full p-1 hover:bg-surface-elevated focus:outline-none transition-colors border border-transparent hover:border-border"
                      aria-label="Account Menu"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 border border-accent/30 text-accent text-xs font-bold overflow-hidden">
                        {user?.profileImage || user?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.profileImage || user.avatarUrl}
                            alt="Avatar"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          userInitials
                        )}
                      </div>
                      <span className="text-xs font-medium text-foreground truncate max-w-[120px] hidden lg:inline-block">
                        {userDisplayName}
                      </span>
                      <ChevronDown className="h-3 w-3 text-muted" />
                    </button>
                  }
                />
              </div>
            </div>
          ) : (
            /* GUEST User Navigation Actions */
            <div className="flex items-center space-x-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link href="/join-developer">
                <Button variant="ghost" size="sm" className="hidden lg:inline-flex text-muted hover:text-accent">
                  Join Developer Network
                </Button>
              </Link>
              <Link href="/start-project">
                <Button size="sm" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                  Start a Project
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu toggle & theme toggle */}
        <div className="flex md:hidden items-center space-x-2">
          <ThemeNavbarToggle />
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
        <div className="md:hidden border-b border-border bg-surface px-4 py-4 space-y-4">
          <nav className="flex flex-col space-y-1">
            {siteConfig.navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-surface-elevated hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="pt-3 border-t border-border flex flex-col space-y-2">
            {user ? (
              <>
                <div className="px-3 py-1.5 flex items-center justify-between text-xs text-muted bg-surface-elevated rounded-lg border border-border">
                  <span className="truncate">
                    Signed in as <strong className="text-foreground">{userDisplayName}</strong>
                  </span>
                  <span className="font-mono text-[10px] text-accent font-semibold ml-2">
                    {user.role}
                  </span>
                </div>

                {/* Role specific mobile links */}
                {isClient && (
                  <>
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="outline" className="w-full justify-start" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                        Dashboard
                      </Button>
                    </Link>
                    <Link href="/start-project" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" className="w-full justify-start" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                        Start a Project
                      </Button>
                    </Link>
                  </>
                )}

                {isDeveloper && !isExecutive && (
                  <>
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="outline" className="w-full justify-start" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                        Dashboard
                      </Button>
                    </Link>
                    <Link href="/dashboard/projects" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="ghost" className="w-full justify-start" leftIcon={<Briefcase className="h-3.5 w-3.5" />}>
                        Projects
                      </Button>
                    </Link>
                    <Link href="/dashboard/community" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="ghost" className="w-full justify-start" leftIcon={<Users className="h-3.5 w-3.5" />}>
                        Community
                      </Button>
                    </Link>
                    <Link href="/dashboard/support" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="ghost" className="w-full justify-start" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                        Support
                      </Button>
                    </Link>
                  </>
                )}

                {isExecutive && (
                  <>
                    <Link href="/admin/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="outline" className="w-full justify-start" leftIcon={<LayoutDashboard className="h-3.5 w-3.5" />}>
                        Dashboard
                      </Button>
                    </Link>
                    <Link href="/start-project" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" className="w-full justify-start" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
                        Start a Project
                      </Button>
                    </Link>
                    <Link href="/admin/support" onClick={() => setMobileMenuOpen(false)}>
                      <Button size="sm" variant="ghost" className="w-full justify-start" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                        Support
                      </Button>
                    </Link>
                  </>
                )}

                {isSupport && !isExecutive && !isClient && (
                  <Link href="/admin/support" onClick={() => setMobileMenuOpen(false)}>
                    <Button size="sm" variant="outline" className="w-full justify-start" leftIcon={<LifeBuoy className="h-3.5 w-3.5" />}>
                      Support Queue
                    </Button>
                  </Link>
                )}

                <div className="pt-2 border-t border-border flex flex-col space-y-1">
                  <Link href="/dashboard/profile" onClick={() => setMobileMenuOpen(false)}>
                    <Button size="sm" variant="ghost" className="w-full justify-start text-xs text-muted" leftIcon={<User className="h-3.5 w-3.5" />}>
                      Profile
                    </Button>
                  </Link>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center space-x-2 px-3 py-2 text-xs text-status-danger hover:bg-status-danger/10 rounded-md transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            ) : (
              /* GUEST Mobile Menu */
              <>
                <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">
                    Login
                  </Button>
                </Link>
                <Link href="/join-developer" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm" className="w-full text-accent hover:bg-accent/10">
                    Join Developer Network
                  </Button>
                </Link>
                <Link href="/start-project" onClick={() => setMobileMenuOpen(false)}>
                  <Button size="sm" className="w-full" rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
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
