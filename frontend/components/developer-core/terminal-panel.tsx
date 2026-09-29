'use client';

import React from 'react';
import { Terminal as TerminalIcon, GitBranch, Cpu, Activity } from 'lucide-react';

interface TerminalPanelProps {
  className?: string;
}

export function TerminalPanel({ className = '' }: TerminalPanelProps) {
  return (
    <div
      className={`rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-[#090d0b]/95 backdrop-blur-xl p-3 sm:p-4 text-left font-mono select-none shadow-xl ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Terminal Bar */}
      <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-2 text-[10px] text-muted-foreground">
        <div className="flex items-center space-x-2">
          <TerminalIcon className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-semibold text-slate-300">nexus-deploy-agent</span>
        </div>
        <div className="flex items-center space-x-2 text-[9px]">
          <span className="flex items-center space-x-1 text-slate-400">
            <GitBranch className="h-2.5 w-2.5" />
            <span>main</span>
          </span>
          <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            LIVE
          </span>
        </div>
      </div>

      {/* Terminal Output */}
      <div className="text-[10px] sm:text-[11px] leading-relaxed text-slate-300 space-y-1">
        <div className="text-emerald-400 font-semibold flex items-center space-x-1.5">
          <span>$</span>
          <span className="text-slate-200">nexus deploy --cluster=prod-asia-1</span>
        </div>
        <div className="text-muted-foreground/80 pl-2">
          &gt; validating architecture blueprints &amp; KYC...
        </div>
        <div className="text-muted-foreground/80 pl-2">
          &gt; checking dependencies: 0 vulnerabilities found
        </div>
        <div className="text-muted-foreground/80 pl-2">
          &gt; running automated tests: 14/14 steps passed
        </div>
        <div className="text-cyan-400/90 pl-2">
          &gt; build complete: immutable transaction sealed
        </div>
        <div className="text-emerald-400 font-semibold pl-2">
          &gt; deployment ready: zero-downtime release
        </div>
      </div>

      {/* System Status Line */}
      <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between text-[9px] font-mono">
        <div className="flex items-center space-x-1.5 text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold tracking-wider">SYSTEM ONLINE</span>
        </div>
        <div className="text-muted-foreground flex items-center space-x-1">
          <Activity className="h-3 w-3 text-emerald-500/60" />
          <span>LATENCY: 12ms</span>
        </div>
      </div>
    </div>
  );
}
