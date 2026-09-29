'use client';

import React from 'react';
import { FileCode, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface CodePanelProps {
  lastKeyEvent?: string | null;
  className?: string;
}

export function CodePanel({ lastKeyEvent, className = '' }: CodePanelProps) {
  return (
    <div
      className={`relative w-full rounded-2xl border border-border/80 dark:border-emerald-500/20 bg-[#070b09]/95 backdrop-blur-xl shadow-2xl p-4 sm:p-5 text-left font-mono select-none ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Editor Window Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-3 text-[11px] text-muted-foreground">
        <div className="flex items-center space-x-2">
          {/* Window Control Dots */}
          <div className="flex items-center space-x-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex items-center space-x-1 pl-2 text-slate-300">
            <FileCode className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-semibold text-xs text-foreground">nexus.orchestrator.ts</span>
          </div>
        </div>

        {/* Live System State Badge */}
        <div className="flex items-center space-x-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>ESCROW ACTIVE</span>
        </div>
      </div>

      {/* Code Area with Line Numbers & Syntax Highlighting */}
      <div className="text-[11px] sm:text-xs leading-relaxed text-slate-300 space-y-1 overflow-x-auto">
        <div className="flex items-start">
          <span className="text-muted-foreground/40 w-6 select-none shrink-0">01</span>
          <span className="text-muted-foreground/70">{'// Nexus Autonomous Engineering Core'}</span>
        </div>
        <div className="flex items-start">
          <span className="text-muted-foreground/40 w-6 select-none shrink-0">02</span>
          <span>
            <span className="text-purple-400 font-semibold">const</span>{' '}
            <span className="text-emerald-300 font-semibold">project</span>{' '}
            <span className="text-slate-400">=</span>{' '}
            <span className="text-purple-400">await</span>{' '}
            <span className="text-cyan-400">nexus</span>.<span className="text-emerald-400 font-semibold">build</span>({'{'}
          </span>
        </div>
        <div className="flex items-start pl-6">
          <span className="text-muted-foreground/40 w-6 -ml-6 select-none shrink-0">03</span>
          <span>
            <span className="text-slate-400">engineer:</span>{' '}
            <span className="text-amber-300">&quot;verified&quot;</span>,
          </span>
        </div>
        <div className="flex items-start pl-6">
          <span className="text-muted-foreground/40 w-6 -ml-6 select-none shrink-0">04</span>
          <span>
            <span className="text-slate-400">stack:</span>{' '}
            <span className="text-slate-400">[</span>
            <span className="text-amber-300">&quot;React&quot;</span>,{' '}
            <span className="text-amber-300">&quot;Node&quot;</span>,{' '}
            <span className="text-amber-300">&quot;AI&quot;</span>
            <span className="text-slate-400">]</span>,
          </span>
        </div>
        <div className="flex items-start pl-6">
          <span className="text-muted-foreground/40 w-6 -ml-6 select-none shrink-0">05</span>
          <span>
            <span className="text-slate-400">delivery:</span>{' '}
            <span className="text-amber-300">&quot;guaranteed&quot;</span>
          </span>
        </div>
        <div className="flex items-start">
          <span className="text-muted-foreground/40 w-6 select-none shrink-0">06</span>
          <span>{'}'});</span>
        </div>

        {/* Dynamic Key Event Interactive Line */}
        <div className="flex items-start pt-1.5 border-t border-border/30 text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded">
          <span className="text-muted-foreground/40 w-6 select-none shrink-0">07</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-emerald-400 font-bold">&gt;</span>
            <span className="text-slate-300 font-medium">keyboard.event(</span>
            <span className="text-emerald-300 font-bold">&quot;{lastKeyEvent || 'READY'}&quot;</span>
            <span className="text-slate-300 font-medium">)</span>
            <span className="inline-block h-3.5 w-1.5 bg-emerald-400 animate-pulse ml-1" />
          </div>
        </div>
      </div>

      {/* Footer System Status Strip (Per Specification) */}
      <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <div className="flex items-center space-x-1.5 text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-semibold tracking-wider">BUILD SUCCESS</span>
        </div>
        <div className="flex items-center space-x-1.5 text-cyan-400">
          <Zap className="h-3 w-3" />
          <span className="font-semibold tracking-wider">DEPLOYMENT READY</span>
        </div>
        <div className="flex items-center space-x-1.5 text-emerald-300">
          <ShieldCheck className="h-3 w-3" />
          <span className="font-semibold tracking-wider">SYSTEM ONLINE</span>
        </div>
      </div>
    </div>
  );
}
