'use client';

import React from 'react';
import { ShieldCheck, GitBranch, Lock } from 'lucide-react';

interface SystemStatusProps {
  className?: string;
}

export function SystemStatusBadges({ className = '' }: SystemStatusProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 select-none font-mono text-[11px] ${className}`}>
      <div className="flex items-center space-x-1.5 rounded-lg border border-white/15 bg-[#151b22]/90 px-3 py-1.5 text-slate-200 font-bold shadow-sm">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse" />
        <span className="text-white">SYSTEM ONLINE</span>
      </div>

      <div className="flex items-center space-x-1.5 rounded-lg border border-white/15 bg-[#151b22]/90 px-3 py-1.5 text-slate-200 font-semibold shadow-sm">
        <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-slate-100">GIT SYNC</span>
      </div>

      <div className="flex items-center space-x-1.5 rounded-lg border border-white/15 bg-[#151b22]/90 px-3 py-1.5 text-slate-200 font-semibold shadow-sm">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-slate-100">ESCROW SECURED</span>
      </div>

      <div className="flex items-center space-x-1.5 rounded-lg border border-white/15 bg-[#151b22]/90 px-3 py-1.5 text-slate-200 font-semibold shadow-sm">
        <Lock className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-slate-100">VERIFIED ENGINEERS</span>
      </div>
    </div>
  );
}
