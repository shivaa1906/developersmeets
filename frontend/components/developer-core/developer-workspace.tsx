'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { InteractiveKeyboard } from './interactive-keyboard';
import { CodePanel } from './code-panel';
import { TerminalPanel } from './terminal-panel';
import { KeyboardEventHUD } from './keyboard-event-hud';
import { SystemStatusBadges } from './system-status';
import { mechanicalAudio } from './keyboard-sound';

interface DeveloperWorkspaceProps {
  className?: string;
}

export function DeveloperWorkspace({ className = '' }: DeveloperWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Keyboard State & Audio
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [lastKeyEvent, setLastKeyEvent] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // 2. Pointer & Kinematics State
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [splitDistance, setSplitDistance] = useState(0);
  const [transformStyle, setTransformStyle] = useState('perspective(1200px) rotateX(0deg) rotateY(0deg)');

  // Refs for animation loop & idle timer
  const targetRef = useRef({ rotX: 0, rotY: 0, split: 0 });
  const currentRef = useRef({ rotX: 0, rotY: 0, split: 0 });
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);

  // ─────────────────────────────────────────────────────────────
  // 3. Centralized Keyboard Event Handler & Audio Synchronization
  // ─────────────────────────────────────────────────────────────
  const normalizeKey = useCallback((e: KeyboardEvent): string => {
    // Build combo string if modifier keys are active
    const parts: string[] = [];
    if (e.ctrlKey && e.key !== 'Control') parts.push('CTRL');
    if (e.altKey && e.key !== 'Alt') parts.push('ALT');
    if (e.metaKey && e.key !== 'Meta') parts.push('CMD');
    if (e.shiftKey && e.key !== 'Shift') parts.push('SHIFT');

    let baseKey = e.key.toUpperCase();
    if (e.code === 'Space' || baseKey === ' ') baseKey = 'SPACE';
    else if (e.code === 'Escape' || baseKey === 'ESCAPE') baseKey = 'ESC';
    else if (e.code === 'Backspace') baseKey = 'BACKSPACE';
    else if (e.code === 'Enter') baseKey = 'ENTER';
    else if (e.code === 'Tab') baseKey = 'TAB';
    else if (e.code === 'CapsLock') baseKey = 'CAPS';
    else if (e.code === 'ArrowUp') baseKey = '↑';
    else if (e.code === 'ArrowDown') baseKey = '↓';
    else if (e.code === 'ArrowLeft') baseKey = '←';
    else if (e.code === 'ArrowRight') baseKey = '→';

    if (parts.length > 0 && !parts.includes(baseKey)) {
      return `${parts.join(' + ')} + ${baseKey}`;
    }
    return baseKey;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept or play sound if user is typing in form inputs, textareas, or contenteditable
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Play immediate mechanical keyboard sound (< 15ms latency, synchronous)
      mechanicalAudio.playKeyClick(e.key, e.repeat, e.code);

      const keyName = normalizeKey(e);
      const rawCode = e.key.toUpperCase();
      const keyCode = e.code.toUpperCase();

      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.add(rawCode);
        next.add(keyCode);
        if (e.code === 'Space') next.add('SPACE');
        if (e.code === 'Enter') next.add('ENTER');
        if (e.code === 'Escape') next.add('ESC');
        if (e.code === 'Backspace') next.add('BACKSPACE');
        if (e.code === 'Tab') next.add('TAB');
        return next;
      });

      setLastKeyEvent(keyName);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const rawCode = e.key.toUpperCase();
      const keyCode = e.code.toUpperCase();

      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(rawCode);
        next.delete(keyCode);
        if (e.code === 'Space') next.delete('SPACE');
        if (e.code === 'Enter') next.delete('ENTER');
        if (e.code === 'Escape') next.delete('ESC');
        if (e.code === 'Backspace') next.delete('BACKSPACE');
        if (e.code === 'Tab') next.delete('TAB');
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [normalizeKey]);

  // ─────────────────────────────────────────────────────────────
  // 4. Pointer Interaction & Inertia Loop with Auto-Return
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const updateKinematics = () => {
      if (!prefersReducedMotion) {
        // Spring lerp interpolation (0.08 damping)
        currentRef.current.rotX += (targetRef.current.rotX - currentRef.current.rotX) * 0.08;
        currentRef.current.rotY += (targetRef.current.rotY - currentRef.current.rotY) * 0.08;
        currentRef.current.split += (targetRef.current.split - currentRef.current.split) * 0.08;

        setTransformStyle(
          `perspective(1200px) rotateX(${currentRef.current.rotX.toFixed(2)}deg) rotateY(${currentRef.current.rotY.toFixed(2)}deg)`
        );
        setSplitDistance(Math.round(currentRef.current.split * 100) / 100);
      }

      rafRef.current = requestAnimationFrame(updateKinematics);
    };

    rafRef.current = requestAnimationFrame(updateKinematics);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1; // -1 to 1
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1; // -1 to 1

    setPointer({ x, y });

    // Target rotations (clamped to subtle 4-6 degrees)
    targetRef.current.rotY = x * 5.5;
    targetRef.current.rotX = -y * 4.5;

    // Split separation follows lateral pointer displacement (max ~16px)
    targetRef.current.split = Math.min(Math.abs(x) * 16, 16);

    // Reset inactivity timer: return to unified form after 850ms of stillness
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      targetRef.current.rotX = 0;
      targetRef.current.rotY = 0;
      targetRef.current.split = 0;
    }, 850);
  };

  const handlePointerLeave = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    targetRef.current.rotX = 0;
    targetRef.current.rotY = 0;
    targetRef.current.split = 0;
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`relative w-full max-w-[680px] flex flex-col items-center select-none ${className}`}
      style={{
        perspective: '1200px',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* 3D Dynamic Transformed Container */}
      <div
        className="w-full flex flex-col space-y-4 will-change-transform"
        style={{
          transform: transformStyle,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.05s linear',
        }}
      >
        {/* Top Control Strip: HUD + Sound Toggle + Secondary Telemetry */}
        <div className="flex items-center justify-between gap-3 px-1 w-full">
          <div className="flex items-center space-x-2">
            <KeyboardEventHUD
              lastKeyEvent={lastKeyEvent}
              activeKeysCount={activeKeys.size}
              className="shrink-0"
            />
            {/* Audio Toggle Indicator */}
            <button
              type="button"
              onClick={() => {
                const next = mechanicalAudio.toggleSound();
                setSoundEnabled(next);
              }}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border text-[10px] font-mono transition-all duration-150 select-none ${
                soundEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/20 shadow-sm'
                  : 'border-border/60 bg-surface-elevated/40 text-muted-foreground hover:border-border hover:text-foreground'
              }`}
              title={soundEnabled ? 'Mute mechanical keyboard audio' : 'Enable mechanical keyboard audio'}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="h-3 w-3 text-emerald-400" />
                  <span className="font-semibold tracking-wider">SOUND ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold tracking-wider">SOUND OFF</span>
                </>
              )}
            </button>
          </div>
          <SystemStatusBadges className="hidden sm:flex" />
        </div>

        {/* Floating Developer Suite: Code Editor + Terminal Panels */}
        <div
          className="grid grid-cols-1 md:grid-cols-12 gap-3 w-full"
          style={{
            transform: 'translateZ(20px)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Floating Code Editor Panel */}
          <div className="md:col-span-7">
            <CodePanel lastKeyEvent={lastKeyEvent} />
          </div>

          {/* Floating Terminal Panel */}
          <div className="md:col-span-5 flex flex-col justify-between">
            <TerminalPanel />
          </div>
        </div>

        {/* Centerpiece: 3D Mechanical Developer Keyboard */}
        <div
          className="w-full pt-1"
          style={{
            transform: 'translateZ(35px)',
            transformStyle: 'preserve-3d',
          }}
        >
          <InteractiveKeyboard
            activeKeys={activeKeys}
            splitOffset={splitDistance}
          />
        </div>
      </div>

      {/* Subtle Specular Horizon Sheen */}
      <div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-4/5 h-16 bg-emerald-500/10 blur-2xl rounded-full pointer-events-none -z-10"
        style={{
          transform: `translateX(${(pointer.x * 30).toFixed(1)}px)`,
          transition: 'transform 0.2s ease-out',
        }}
      />
    </div>
  );
}
