'use client';

import React from 'react';
import { Keyboard as KeyboardIcon, Radio } from 'lucide-react';

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
      className={`rounded-xl border border-border/80 dark:border-emerald-500/30 bg-[#070d0a]/90 backdrop-blur-md px-3.5 py-2 shadow-lg flex items-center space-x-3 select-none transition-all duration-150 ${
        isKeyActive
          ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
          : 'border-border/60'
      } ${className}`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-150 ${
          isKeyActive
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-emerald-500/10 text-emerald-400'
        }`}
      >
        <KeyboardIcon className="h-3.5 w-3.5" />
      </div>

      <div className="flex flex-col text-left font-mono">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center space-x-1">
          <span>KEY EVENT</span>
          {isKeyActive && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
          )}
        </span>
        <span
          className={`text-xs font-bold leading-tight transition-all duration-100 ${
            isKeyActive
              ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]'
              : 'text-slate-300'
          }`}
        >
          {lastKeyEvent ? `> ${lastKeyEvent}` : '> PRESS ANY KEY'}
        </span>
      </div>
    </div>
  );
}
