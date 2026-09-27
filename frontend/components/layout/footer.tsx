'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { siteConfig } from '@/config/site';
import { Terminal, Shield, Cpu, Code2 } from 'lucide-react';

export const Footer: React.FC = () => {
  const pathname = usePathname();

  const isAuthPage = pathname === '/login' || pathname === '/register';
  const isDashboardPage = pathname.startsWith('/dashboard') || pathname.startsWith('/admin');

  if (isAuthPage || isDashboardPage) {
    return null;
  }

  return (
    <footer className="border-t border-border bg-surface-elevated text-muted">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand & mission */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
                <Terminal className="h-4 w-4" />
              </div>
              <span className="text-sm font-bold tracking-wider text-foreground">
                NEXUS<span className="text-accent">.DEV</span>
              </span>
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-muted">
              {siteConfig.company.tagline} {siteConfig.company.description} A premium ecosystem bridging verified engineering talent with mission-critical client systems.
            </p>
            <div className="pt-2 flex items-center space-x-4 text-xs">
              <div className="flex items-center space-x-1.5 text-foreground">
                <Shield className="h-3.5 w-3.5 text-accent" />
                <span className="text-[11px]">Strict Verification</span>
              </div>
              <div className="flex items-center space-x-1.5 text-foreground">
                <Cpu className="h-3.5 w-3.5 text-electric-purple" />
                <span className="text-[11px]">Milestone Escrow</span>
              </div>
            </div>
          </div>

          {/* Platform */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Platform</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/projects" className="hover:text-foreground transition-colors">
                  Project Showcase
                </Link>
              </li>
              <li>
                <Link href="/developers" className="hover:text-foreground transition-colors">
                  Developer Network
                </Link>
              </li>
              <li>
                <Link href="/dashboard/projects" className="hover:text-foreground transition-colors">
                  Marketplace
                </Link>
              </li>
              <li>
                <Link href="/careers" className="hover:text-foreground transition-colors">
                  Careers & Bounties
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Company</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/company" className="hover:text-foreground transition-colors">
                  About & Leadership
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground transition-colors">
                  Client Inquiries
                </Link>
              </li>
              <li>
                <span className="text-[11px] text-muted">
                  CEO: <strong className="text-foreground">{siteConfig.company.leadership.ceo.name}</strong>
                </span>
              </li>
              <li>
                <span className="text-[11px] text-muted">
                  MD: <strong className="text-foreground">{siteConfig.company.leadership.md.name}</strong>
                </span>
              </li>
            </ul>
          </div>

          {/* Portals */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Portals</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/dashboard" className="hover:text-foreground transition-colors">
                  Developer Dashboard
                </Link>
              </li>
              <li>
                <Link href="/admin/dashboard" className="hover:text-foreground transition-colors">
                  Executive Admin
                </Link>
              </li>
              <li>
                <Link href="/dashboard/credits" className="hover:text-foreground transition-colors">
                  Credit Wallet
                </Link>
              </li>
              <li>
                <Link href="/dashboard/community" className="hover:text-foreground transition-colors">
                  Private Community
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between border-t border-border pt-6 sm:flex-row text-xs text-muted">
          <p>© {new Date().getFullYear()} {siteConfig.company.name}. All rights reserved.</p>
          <div className="flex items-center space-x-6 mt-4 sm:mt-0">
            <Link href="/company" className="hover:text-foreground transition-colors">
              Security & Privacy
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Support Bridge
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
