'use client';

import React from 'react';
import { Keyboard as KeyboardIcon } from 'lucide-react';

interface KeyboardEventHUDProps {
  lastKeyEvent: string | null;
  activeKeysCount: number;
  className?: string;
}

export function KeyboardEventHUD({
  lastKeyEvent,
  activeKeysCount,
  className = '',
}: KeyboardEventHUDProps) {
  const isKeyActive = activeKeysCount > 0 && !!lastKeyEvent;

  return (
    <div
      className={`rounded-xl border bg-gradient-to-r from-[#151b22] to-[#0e1318] px-3.5 sm:px-4 py-2 sm:py-2.5 shadow-[0_8px_25px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] flex items-center space-x-3 select-none transition-all duration-150 ${
        isKeyActive
          ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
          : 'border-white/15'
      } ${className}`}
    >
      <div
        className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg transition-colors duration-150 ${
          isKeyActive
            ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400/50 shadow-[0_0_10px_rgba(52,211,153,0.4)]'
            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        }`}
      >
        <KeyboardIcon className="h-4 w-4" />
      </div>

      <div className="flex flex-col text-left font-mono">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
          <span>KEY EVENT</span>
          {isKeyActive && (
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] animate-ping inline-block" />
          )}
        </span>
        <span
          className={`text-xs sm:text-sm font-extrabold leading-tight transition-all duration-100 ${
            isKeyActive
              ? 'text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]'
              : 'text-white'
          }`}
        >
          {lastKeyEvent ? `> ${lastKeyEvent}` : '> PRESS ANY KEY'}
        </span>
      </div>
    </div>
  );
}
