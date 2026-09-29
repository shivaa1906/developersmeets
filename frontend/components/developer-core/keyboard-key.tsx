'use client';

import React from 'react';

export interface KeyboardKeyProps {
  id: string;
  label: string;
  subLabel?: string;
  width?: number; // width multiplier in "u"
  isPressed?: boolean;
  accent?: 'default' | 'emerald' | 'cyan' | 'accent';
  className?: string;
}

/**
 * HD Mechanical Keycap (Double-shot PBT Profile)
 * High-visibility typography, crisp 4K borders, realistic 3D bevels, and tactile LED underglow.
 */
export function KeyboardKey({
  label,
  subLabel,
  width = 1,
  isPressed = false,
  accent = 'default',
  className = '',
}: KeyboardKeyProps) {
  // Width scaling
  const widthClass =
    width === 1
      ? 'flex-1 min-w-[32px] sm:min-w-[42px] max-w-[50px]'
      : width === 1.25
      ? 'w-[44px] sm:w-[54px] shrink-0'
      : width === 1.5
      ? 'w-[52px] sm:w-[66px] shrink-0'
      : width === 1.75
      ? 'w-[60px] sm:w-[76px] shrink-0'
      : width === 2
      ? 'w-[70px] sm:w-[86px] shrink-0'
      : width === 2.25
      ? 'w-[78px] sm:w-[96px] shrink-0'
      : width === 2.75
      ? 'w-[94px] sm:w-[118px] shrink-0'
      : width === 6.25
      ? 'flex-[6.25] min-w-[150px] sm:min-w-[220px]'
      : 'flex-1';

  const isAccent = accent === 'emerald' || accent === 'accent';

  return (
    <div
      className={`relative h-[36px] sm:h-[44px] ${widthClass} select-none transition-all duration-[90ms] ease-out ${
        isPressed
          ? 'translate-y-[3px] scale-[0.98]'
          : 'translate-y-0 hover:-translate-y-[1px]'
      } ${className}`}
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* 3D Mechanical Switch Stem / Lower Chassis Housing */}
      <div
        className={`absolute inset-0 rounded-[6px] sm:rounded-[7px] transition-all duration-[90ms] ${
          isPressed
            ? 'bg-[#051c14] shadow-[0_1px_0_#020b08]'
            : isAccent
            ? 'bg-[#07241a] shadow-[0_4px_0_#03120d,0_6px_12px_rgba(0,0,0,0.85)]'
            : 'bg-[#0b1014] shadow-[0_4px_0_#05080a,0_6px_12px_rgba(0,0,0,0.85)]'
        }`}
      />

      {/* 3D Keycap Dish Top Surface */}
      <div
        className={`relative h-full w-full rounded-[5px] sm:rounded-[6px] flex flex-col items-center justify-center p-1 border text-center transition-all duration-[80ms] ${
          isPressed
            ? 'border-emerald-400 bg-gradient-to-b from-[#0f3828] to-[#072418] shadow-[inset_0_2px_4px_rgba(0,0,0,0.8),0_0_14px_rgba(52,211,153,0.5)]'
            : isAccent
            ? 'border-t-emerald-400/50 border-x-emerald-500/30 border-b-emerald-950/80 bg-gradient-to-b from-[#113f2f] to-[#0a271d] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:border-emerald-400'
            : 'border-t-white/20 border-x-white/10 border-b-black/80 bg-gradient-to-b from-[#20272e] via-[#1a2026] to-[#14191e] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:border-white/30 hover:from-[#262e37]'
        }`}
      >
        {/* Sub-label (Symbols: !, @, #, etc.) */}
        {subLabel && (
          <span
            className={`text-[9px] sm:text-[10px] font-mono font-semibold leading-none tracking-tight transition-colors duration-80 ${
              isPressed
                ? 'text-emerald-200'
                : isAccent
                ? 'text-emerald-300/80'
                : 'text-slate-400'
            }`}
          >
            {subLabel}
          </span>
        )}

        {/* High-Contrast Primary Legend (A, B, ENTER, SPACE, etc.) */}
        <span
          className={`font-mono leading-none tracking-wider uppercase transition-all duration-80 ${
            label.length > 3
              ? 'text-[9px] sm:text-[10.5px] font-bold'
              : 'text-[11px] sm:text-[13px] font-bold'
          } ${
            isPressed
              ? 'text-emerald-200 drop-shadow-[0_0_8px_rgba(52,211,153,0.95)]'
              : isAccent
              ? 'text-emerald-300 drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]'
              : 'text-white'
          }`}
        >
          {label}
        </span>

        {/* Bottom Tactile LED Line when Key is Pressed */}
        {isPressed && (
          <span className="absolute bottom-[2px] h-[2.5px] w-2/3 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] pointer-events-none" />
        )}
      </div>
    </div>
  );
}
