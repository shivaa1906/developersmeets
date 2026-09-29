'use client';

import React from 'react';
import { KeyboardKey } from './keyboard-key';

interface InteractiveKeyboardProps {
  activeKeys: Set<string>;
  splitOffset?: number; // 0 to ~18px
  className?: string;
}

// ─────────────────────────────────────────────────────────────
// Keyboard Layout Matrix (Compact 68-Key Developer Layout)
// ─────────────────────────────────────────────────────────────

interface KeyDef {
  id: string;
  label: string;
  subLabel?: string;
  width?: number;
  accent?: 'default' | 'emerald' | 'cyan' | 'accent';
}

const ROW_1_LEFT: KeyDef[] = [
  { id: 'ESC', label: 'ESC', accent: 'emerald', width: 1 },
  { id: '1', label: '1', subLabel: '!' },
  { id: '2', label: '2', subLabel: '@' },
  { id: '3', label: '3', subLabel: '#' },
  { id: '4', label: '4', subLabel: '$' },
  { id: '5', label: '5', subLabel: '%' },
];

const ROW_1_RIGHT: KeyDef[] = [
  { id: '6', label: '6', subLabel: '^' },
  { id: '7', label: '7', subLabel: '&' },
  { id: '8', label: '8', subLabel: '*' },
  { id: '9', label: '9', subLabel: '(' },
  { id: '0', label: '0', subLabel: ')' },
  { id: '-', label: '-', subLabel: '_' },
  { id: '=', label: '=', subLabel: '+' },
  { id: 'BACKSPACE', label: 'BKSP', width: 1.5, accent: 'accent' },
];

const ROW_2_LEFT: KeyDef[] = [
  { id: 'TAB', label: 'TAB', width: 1.5 },
  { id: 'Q', label: 'Q' },
  { id: 'W', label: 'W' },
  { id: 'E', label: 'E' },
  { id: 'R', label: 'R' },
  { id: 'T', label: 'T' },
];

const ROW_2_RIGHT: KeyDef[] = [
  { id: 'Y', label: 'Y' },
  { id: 'U', label: 'U' },
  { id: 'I', label: 'I' },
  { id: 'O', label: 'O' },
  { id: 'P', label: 'P' },
  { id: '[', label: '[', subLabel: '{' },
  { id: ']', label: ']', subLabel: '}' },
  { id: '\\', label: '\\', subLabel: '|', width: 1 },
];

const ROW_3_LEFT: KeyDef[] = [
  { id: 'CAPS', label: 'CAPS', width: 1.75 },
  { id: 'A', label: 'A' },
  { id: 'S', label: 'S' },
  { id: 'D', label: 'D' },
  { id: 'F', label: 'F' },
  { id: 'G', label: 'G' },
];

const ROW_3_RIGHT: KeyDef[] = [
  { id: 'H', label: 'H' },
  { id: 'J', label: 'J' },
  { id: 'K', label: 'K' },
  { id: 'L', label: 'L' },
  { id: ';', label: ';', subLabel: ':' },
  { id: "'", label: "'", subLabel: '"' },
  { id: 'ENTER', label: 'ENTER', width: 1.75, accent: 'emerald' },
];

const ROW_4_LEFT: KeyDef[] = [
  { id: 'SHIFT_L', label: 'SHIFT', width: 2.25 },
  { id: 'Z', label: 'Z' },
  { id: 'X', label: 'X' },
  { id: 'C', label: 'C' },
  { id: 'V', label: 'V' },
  { id: 'B', label: 'B' },
];

const ROW_4_RIGHT: KeyDef[] = [
  { id: 'N', label: 'N' },
  { id: 'M', label: 'M' },
  { id: ',', label: ',', subLabel: '<' },
  { id: '.', label: '.', subLabel: '>' },
  { id: '/', label: '/', subLabel: '?' },
  { id: 'SHIFT_R', label: 'SHIFT', width: 1.75 },
  { id: '↑', label: '↑', width: 1, accent: 'accent' },
];

const ROW_5_LEFT: KeyDef[] = [
  { id: 'CTRL_L', label: 'CTRL', width: 1.25 },
  { id: 'ALT_L', label: 'ALT', width: 1.25 },
  { id: 'CMD_L', label: 'CMD', width: 1.25 },
  { id: 'SPACE_L', label: 'SPACE', width: 2.75 },
];

const ROW_5_RIGHT: KeyDef[] = [
  { id: 'SPACE_R', label: 'SPACE', width: 2.75 },
  { id: 'CMD_R', label: 'CMD', width: 1.25 },
  { id: '←', label: '←', width: 1 },
  { id: '↓', label: '↓', width: 1 },
  { id: '→', label: '→', width: 1 },
];

export function InteractiveKeyboard({
  activeKeys,
  splitOffset = 0,
  className = '',
}: InteractiveKeyboardProps) {
  // Check whether a key is currently pressed
  const isKeyPressed = (id: string): boolean => {
    if (activeKeys.has(id)) return true;

    // Shift aliases
    if ((id === 'SHIFT_L' || id === 'SHIFT_R') && (activeKeys.has('SHIFT') || activeKeys.has('SHIFTLEFT') || activeKeys.has('SHIFTRIGHT'))) {
      return true;
    }
    // Control aliases
    if ((id === 'CTRL_L' || id === 'CTRL_R') && (activeKeys.has('CTRL') || activeKeys.has('CONTROL') || activeKeys.has('CONTROLLEFT') || activeKeys.has('CONTROLRIGHT'))) {
      return true;
    }
    // Alt aliases
    if ((id === 'ALT_L' || id === 'ALT_R') && (activeKeys.has('ALT') || activeKeys.has('ALTLEFT') || activeKeys.has('ALTRIGHT'))) {
      return true;
    }
    // Cmd / Meta aliases
    if ((id === 'CMD_L' || id === 'CMD_R') && (activeKeys.has('CMD') || activeKeys.has('META') || activeKeys.has('METALEFT') || activeKeys.has('METARIGHT'))) {
      return true;
    }
    // Space aliases
    if ((id === 'SPACE_L' || id === 'SPACE_R') && (activeKeys.has('SPACE') || activeKeys.has(' '))) {
      return true;
    }
    // Arrow aliases
    if (id === '↑' && (activeKeys.has('ARROWUP') || activeKeys.has('UP') || activeKeys.has('↑'))) return true;
    if (id === '↓' && (activeKeys.has('ARROWDOWN') || activeKeys.has('DOWN') || activeKeys.has('↓'))) return true;
    if (id === '←' && (activeKeys.has('ARROWLEFT') || activeKeys.has('LEFT') || activeKeys.has('←'))) return true;
    if (id === '→' && (activeKeys.has('ARROWRIGHT') || activeKeys.has('RIGHT') || activeKeys.has('→'))) return true;

    return false;
  };

  return (
    <div
      className={`relative w-full rounded-2xl border border-white/15 bg-gradient-to-b from-[#161c22] via-[#11161a] to-[#0c0f13] p-3 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl ${className}`}
      style={{
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Machined Aluminum Bezel Top Bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3 px-1 text-xs font-mono select-none">
        <div className="flex items-center space-x-3">
          {/* USB-C CNC Port Indicator */}
          <div className="h-2 w-7 rounded-full bg-[#080b0d] border border-white/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.9)]" />
          <span className="text-[10px] sm:text-xs text-slate-300 font-bold tracking-wider uppercase">
            NEXUS-CORE-68 // CNC WORKSTATION
          </span>
        </div>

        {/* Telemetry Status LEDs with HD Glow */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-300">ONLINE</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span
              className={`h-2 w-2 rounded-full transition-all duration-100 ${
                activeKeys.size > 0
                  ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
                  : 'bg-slate-700'
              }`}
            />
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-300">INPUT</span>
          </div>
        </div>
      </div>

      {/* Main Key Matrix with Split Capability */}
      <div className="relative flex justify-center items-center gap-2 sm:gap-3 overflow-x-auto pb-1">
        {/* Left Keyboard Cluster */}
        <div
          className="flex flex-col gap-1.5 flex-1 max-w-[310px] sm:max-w-[370px] will-change-transform"
          style={{
            transform: `translateX(-${splitOffset}px) rotateZ(-${(splitOffset * 0.08).toFixed(2)}deg)`,
            transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            transformStyle: 'preserve-3d',
          }}
        >
          <div className="flex gap-1.5">
            {ROW_1_LEFT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_2_LEFT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_3_LEFT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_4_LEFT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_5_LEFT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>
        </div>

        {/* Subtle Mechanical Expansion Seam / Split Hinge */}
        <div
          className="hidden sm:flex flex-col justify-center items-center opacity-60 shrink-0 select-none pointer-events-none"
          style={{
            width: `${Math.max(splitOffset * 1.5, 4)}px`,
            transition: 'width 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="h-4/5 w-[1px] bg-gradient-to-b from-transparent via-emerald-400/50 to-transparent" />
        </div>

        {/* Right Keyboard Cluster */}
        <div
          className="flex flex-col gap-1.5 flex-1 max-w-[360px] sm:max-w-[440px] will-change-transform"
          style={{
            transform: `translateX(${splitOffset}px) rotateZ(${(splitOffset * 0.08).toFixed(2)}deg)`,
            transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            transformStyle: 'preserve-3d',
          }}
        >
          <div className="flex gap-1.5">
            {ROW_1_RIGHT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_2_RIGHT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_3_RIGHT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_4_RIGHT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>

          <div className="flex gap-1.5">
            {ROW_5_RIGHT.map((key) => (
              <KeyboardKey key={key.id} {...key} isPressed={isKeyPressed(key.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
