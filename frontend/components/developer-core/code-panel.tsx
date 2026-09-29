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
      className={`relative w-full rounded-2xl border border-white/15 bg-gradient-to-b from-[#151b22] to-[#0e1318] shadow-[0_16px_40px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] p-4 sm:p-5 text-left font-mono select-none ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* High-Definition Editor Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3.5 text-xs">
        <div className="flex items-center space-x-3">
          {/* Mac-Style Window Dots */}
          <div className="flex items-center space-x-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56] shadow-[0_0_6px_rgba(255,95,86,0.6)]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e] shadow-[0_0_6px_rgba(255,189,46,0.6)]" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f] shadow-[0_0_6px_rgba(39,201,63,0.6)]" />
          </div>
          <div className="flex items-center space-x-1.5 pl-2 text-slate-200">
            <FileCode className="h-4 w-4 text-emerald-400" />
            <span className="font-bold text-xs sm:text-sm text-white tracking-tight">
              nexus.orchestrator.ts
            </span>
          </div>
        </div>

        {/* Crisp Escrow Status Pill */}
        <div className="flex items-center space-x-1.5 text-[11px] font-bold text-emerald-300 bg-emerald-950/70 px-2.5 py-1 rounded-md border border-emerald-400/40 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
          <span>ESCROW ACTIVE</span>
        </div>
      </div>

      {/* Code Editor Body with Razor-Sharp 4K Typography */}
      <div className="text-xs sm:text-[13px] leading-6 sm:leading-7 text-slate-200 space-y-0.5 overflow-x-auto">
        <div className="flex items-start">
          <span className="text-slate-500 font-semibold w-7 select-none shrink-0">01</span>
          <span className="text-slate-400 italic">{'// Nexus Autonomous Engineering Core'}</span>
        </div>
        <div className="flex items-start">
          <span className="text-slate-500 font-semibold w-7 select-none shrink-0">02</span>
          <span>
            <span className="text-purple-400 font-bold">const</span>{' '}
            <span className="text-sky-300 font-bold">project</span>{' '}
            <span className="text-white font-semibold">=</span>{' '}
            <span className="text-purple-400 font-bold">await</span>{' '}
            <span className="text-emerald-400 font-bold">nexus</span>.<span className="text-teal-300 font-bold">build</span>({'{'}
          </span>
        </div>
        <div className="flex items-start pl-7">
          <span className="text-slate-500 font-semibold w-7 -ml-7 select-none shrink-0">03</span>
          <span>
            <span className="text-slate-300 font-medium">engineer:</span>{' '}
            <span className="text-amber-300 font-semibold">&quot;verified&quot;</span>,
          </span>
        </div>
        <div className="flex items-start pl-7">
          <span className="text-slate-500 font-semibold w-7 -ml-7 select-none shrink-0">04</span>
          <span>
            <span className="text-slate-300 font-medium">stack:</span>{' '}
            <span className="text-white font-semibold">[</span>
            <span className="text-amber-300 font-semibold">&quot;React&quot;</span>,{' '}
            <span className="text-amber-300 font-semibold">&quot;Node&quot;</span>,{' '}
            <span className="text-amber-300 font-semibold">&quot;AI&quot;</span>
            <span className="text-white font-semibold">]</span>,
          </span>
        </div>
        <div className="flex items-start pl-7">
          <span className="text-slate-500 font-semibold w-7 -ml-7 select-none shrink-0">05</span>
          <span>
            <span className="text-slate-300 font-medium">delivery:</span>{' '}
            <span className="text-amber-300 font-semibold">&quot;guaranteed&quot;</span>
          </span>
        </div>
        <div className="flex items-start">
          <span className="text-slate-500 font-semibold w-7 select-none shrink-0">06</span>
          <span className="text-white font-bold">{'}'});</span>
        </div>

        {/* Dynamic Key Event Interactive Banner */}
        <div className="flex items-center pt-2 mt-1 border-t border-white/10 text-emerald-300 bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-400/40">
          <span className="text-emerald-400/80 font-bold w-7 select-none shrink-0">07</span>
          <div className="flex items-center space-x-2">
            <span className="text-emerald-400 font-extrabold text-sm">&gt;</span>
            <span className="text-slate-200 font-semibold">keyboard.event(</span>
            <span className="text-emerald-300 font-extrabold text-sm px-1.5 py-0.5 rounded bg-black/60 border border-emerald-400/50 shadow-sm">
              &quot;{lastKeyEvent || 'READY'}&quot;
            </span>
            <span className="text-slate-200 font-semibold">)</span>
            <span className="inline-block h-4 w-2 bg-emerald-400 animate-pulse ml-1.5" />
          </div>
        </div>
      </div>

      {/* Footer System Status Strip (High-Visibility Crisp Badges) */}
      <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs font-bold font-mono">
        <div className="flex items-center space-x-1.5 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="tracking-wider">BUILD SUCCESS</span>
        </div>
        <div className="flex items-center space-x-1.5 text-sky-400">
          <Zap className="h-4 w-4" />
          <span className="tracking-wider">DEPLOYMENT READY</span>
        </div>
        <div className="flex items-center space-x-1.5 text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
          <span className="tracking-wider">SYSTEM ONLINE</span>
        </div>
      </div>
    </div>
  );
}
