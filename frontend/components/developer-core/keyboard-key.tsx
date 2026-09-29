'use client';

import React from 'react';

export interface KeyboardKeyProps {
  id: string;
  label: string;
  subLabel?: string;
  width?: number; // width multiplier in "u" (1 = normal square, 1.5 = tab, 2.25 = enter/shift, etc.)
  isPressed?: boolean;
  accent?: 'default' | 'emerald' | 'cyan' | 'accent';
  className?: string;
}

export function KeyboardKey({
  label,
  subLabel,
  width = 1,
  isPressed = false,
  accent = 'default',
  className = '',
}: KeyboardKeyProps) {
  // Compute flex/width style based on standard mechanical keyboard units
  const widthClass =
    width === 1
      ? 'flex-1 min-w-[28px] sm:min-w-[34px] max-w-[42px]'
      : width === 1.25
      ? 'w-[40px] sm:w-[48px] shrink-0'
      : width === 1.5
      ? 'w-[46px] sm:w-[56px] shrink-0'
      : width === 1.75
      ? 'w-[54px] sm:w-[64px] shrink-0'
      : width === 2
      ? 'w-[62px] sm:w-[72px] shrink-0'
      : width === 2.25
      ? 'w-[70px] sm:w-[82px] shrink-0'
      : width === 2.75
      ? 'w-[84px] sm:w-[98px] shrink-0'
      : width === 6.25
      ? 'flex-[6.25] min-w-[140px] sm:min-w-[190px]'
      : 'flex-1';

  // Base styling for graphite keycaps
  const isAccentKey = accent === 'emerald' || accent === 'accent';

  return (
    <div
      className={`relative h-[32px] sm:h-[38px] ${widthClass} select-none transition-all duration-[120ms] ease-out ${
        isPressed
          ? 'translate-y-[3px] scale-[0.98]'
          : 'translate-y-0 hover:-translate-y-[1px]'
      } ${className}`}
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Mechanical Key Switch Stem / Shadow base */}
      <div
        className={`absolute inset-0 rounded-[5px] sm:rounded-[6px] transition-colors duration-[120ms] ${
          isPressed
            ? 'bg-emerald-950/80 shadow-[0_1px_0_#051c14]'
            : isAccentKey
            ? 'bg-[#08291e] shadow-[0_3px_0_#041710,0_5px_8px_rgba(0,0,0,0.6)]'
            : 'bg-[#0e1311] shadow-[0_3px_0_#060908,0_5px_8px_rgba(0,0,0,0.6)]'
        }`}
      />

      {/* Keycap Surface with Dish Profile */}
      <div
        className={`relative h-full w-full rounded-[4px] sm:rounded-[5px] flex flex-col items-center justify-center p-1 border text-center transition-all duration-[100ms] ${
          isPressed
            ? 'border-emerald-400/90 bg-[#0d2a1f] shadow-[inset_0_1px_3px_rgba(0,0,0,0.7),0_0_12px_rgba(52,211,153,0.45)]'
            : isAccentKey
            ? 'border-emerald-500/40 bg-gradient-to-b from-[#143d2e] to-[#0c241b] hover:border-emerald-400/60'
            : 'border-[#26312b]/80 bg-gradient-to-b from-[#19221d] to-[#121815] hover:border-[#384a40]'
        }`}
      >
        {/* Sub-label (shift character or secondary command) */}
        {subLabel && (
          <span
            className={`text-[8px] sm:text-[9px] font-mono leading-none transition-colors duration-100 ${
              isPressed
                ? 'text-emerald-300 font-bold'
                : 'text-muted-foreground/60'
            }`}
          >
            {subLabel}
          </span>
        )}

        {/* Primary Legend */}
        <span
          className={`font-mono leading-none tracking-tight uppercase transition-all duration-100 ${
            label.length > 3
              ? 'text-[8px] sm:text-[9px]'
              : 'text-[10px] sm:text-[11px] font-semibold'
          } ${
            isPressed
              ? 'text-emerald-300 font-bold drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]'
              : isAccentKey
              ? 'text-emerald-400 font-medium'
              : 'text-slate-300'
          }`}
        >
          {label}
        </span>

        {/* Emissive Underglow LED Indicator on keypress */}
        {isPressed && (
          <span className="absolute bottom-[2px] h-[2px] w-3/5 rounded-full bg-emerald-400/90 blur-[1px] pointer-events-none" />
        )}
      </div>
    </div>
  );
}
