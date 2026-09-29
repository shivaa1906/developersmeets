'use client';

import React from 'react';
import { Terminal as TerminalIcon, GitBranch, Activity } from 'lucide-react';

interface TerminalPanelProps {
  className?: string;
}

export function TerminalPanel({ className = '' }: TerminalPanelProps) {
  return (
    <div
      className={`relative w-full h-full rounded-2xl border border-white/15 bg-gradient-to-b from-[#151b22] to-[#0e1318] shadow-[0_16px_40px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 sm:p-5 text-left font-mono select-none flex flex-col justify-between ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div>
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3.5 text-xs">
          <div className="flex items-center space-x-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <TerminalIcon className="h-3.5 w-3.5" />
            </div>
            <span className="font-bold text-xs sm:text-sm text-white tracking-tight">nexus-deploy-agent</span>
          </div>
          <div className="flex items-center space-x-2 text-[11px] font-bold">
            <span className="flex items-center space-x-1.5 text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
              <GitBranch className="h-3 w-3 text-emerald-400" />
              <span>main</span>
            </span>
            <span className="text-emerald-300 font-extrabold bg-emerald-950/70 px-2.5 py-1 rounded-md border border-emerald-400/40 shadow-sm flex items-center space-x-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span>LIVE</span>
            </span>
          </div>
        </div>

        {/* Terminal Output with Razor-Sharp Typography */}
        <div className="text-xs sm:text-[12.5px] leading-6 text-slate-200 space-y-1.5 overflow-x-auto">
          <div className="text-emerald-400 font-bold flex items-center space-x-2">
            <span className="text-emerald-300 font-extrabold">&gt; $</span>
            <span className="text-white font-bold">nexus deploy --cluster=prod-asia-1</span>
          </div>
          <div className="text-slate-400 pl-3 flex items-center space-x-1.5">
            <span className="text-slate-500">✔</span>
            <span>validating architecture blueprints &amp; KYC...</span>
          </div>
          <div className="text-emerald-300 font-medium pl-3 flex items-center space-x-1.5">
            <span className="text-emerald-400">✔</span>
            <span>checking dependencies: 0 vulnerabilities</span>
          </div>
          <div className="text-emerald-300 font-medium pl-3 flex items-center space-x-1.5">
            <span className="text-emerald-400">✔</span>
            <span>running automated tests: 14/14 passed</span>
          </div>
          <div className="text-sky-300 font-semibold pl-3 flex items-center space-x-1.5">
            <span className="text-sky-400">⚡</span>
            <span>build complete: immutable transaction sealed</span>
          </div>
          <div className="text-emerald-300 font-extrabold pl-3 py-1.5 px-2.5 rounded-lg bg-emerald-950/60 border border-emerald-400/40 flex items-center space-x-1.5 mt-2">
            <span className="text-emerald-400">●</span>
            <span>deployment ready: zero-downtime release</span>
          </div>
        </div>
      </div>

      {/* System Status Line */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold font-mono">
        <div className="flex items-center space-x-2 text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
          <span className="tracking-wider">SYSTEM ONLINE</span>
        </div>
        <div className="text-slate-300 flex items-center space-x-1.5 text-[11px]">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span>LATENCY: <strong className="text-emerald-300 font-extrabold">12ms</strong></span>
        </div>
      </div>
    </div>
  );
}
