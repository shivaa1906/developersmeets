'use client';

import React from 'react';
import { ShieldCheck, GitBranch, Cpu, Lock, CheckCircle2, Zap } from 'lucide-react';

interface SystemStatusProps {
  className?: string;
}

export function SystemStatusBadges({ className = '' }: SystemStatusProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 select-none font-mono text-[10px] ${className}`}>
      <div className="flex items-center space-x-1.5 rounded-full border border-border/60 bg-surface/80 dark:bg-black/60 px-2.5 py-1 text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span>SYSTEM ONLINE</span>
      </div>

      <div className="flex items-center space-x-1.5 rounded-full border border-border/60 bg-surface/80 dark:bg-black/60 px-2.5 py-1 text-muted-foreground">
        <GitBranch className="h-2.5 w-2.5 text-emerald-400" />
        <span>GIT SYNC</span>
      </div>

      <div className="flex items-center space-x-1.5 rounded-full border border-border/60 bg-surface/80 dark:bg-black/60 px-2.5 py-1 text-muted-foreground">
        <ShieldCheck className="h-2.5 w-2.5 text-emerald-400" />
        <span>ESCROW SECURED</span>
      </div>

      <div className="flex items-center space-x-1.5 rounded-full border border-border/60 bg-surface/80 dark:bg-black/60 px-2.5 py-1 text-muted-foreground">
        <Lock className="h-2.5 w-2.5 text-emerald-400" />
        <span>VERIFIED ENGINEERS</span>
      </div>
    </div>
  );
}
