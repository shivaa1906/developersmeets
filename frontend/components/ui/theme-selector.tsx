'use client';

import * as React from 'react';
import { useTheme, type ThemeMode } from '@/hooks/use-theme';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Monitor, Sun, Moon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeOption {
  id: ThemeMode;
  name: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  previewBg: string;
  previewBorder: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'system',
    name: 'System',
    label: 'Default System',
    description: 'Automatically synchronizes with your device operating system preference.',
    icon: Monitor,
    previewBg: 'bg-gradient-to-r from-slate-100 to-slate-900',
    previewBorder: 'border-accent/40',
  },
  {
    id: 'bright',
    name: 'Bright',
    label: 'Bright Theme',
    description: 'Clean white surfaces with high contrast, slate text, and sky blue accents.',
    icon: Sun,
    previewBg: 'bg-white border-slate-200',
    previewBorder: 'border-sky-500',
  },
  {
    id: 'dark',
    name: 'Dark',
    label: 'Dark Theme',
    description: 'Futuristic deep space black surfaces with glowing cyan accents.',
    icon: Moon,
    previewBg: 'bg-[#050505] border-neutral-800',
    previewBorder: 'border-cyan-400',
  },
];

/**
 * Rich Theme Settings Card for User & Admin Settings Pages
 */
export function ThemeSettingsCard() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <Card className="border border-border bg-surface shadow-surface-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-foreground font-semibold">Appearance & Theme</CardTitle>
            <CardDescription className="text-xs text-muted mt-1">
              Choose your preferred visual mode or sync automatically with your device.
            </CardDescription>
          </div>
          <div className="text-xs font-mono px-2.5 py-1 rounded-full border border-border bg-surface-elevated text-muted">
            Active: <span className="text-accent font-semibold uppercase">{resolvedTheme}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            const Icon = opt.icon;

            return (
              <button
                type="button"
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                className={cn(
                  'relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 outline-none',
                  isSelected
                    ? 'border-accent bg-accent/5 shadow-accent-glow ring-1 ring-accent'
                    : 'border-border bg-surface-elevated hover:border-accent/40 hover:bg-surface-highlight'
                )}
              >
                <div className="flex items-center justify-between mb-3 w-full">
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg border',
                      isSelected
                        ? 'border-accent/40 bg-accent/15 text-accent'
                        : 'border-border bg-surface text-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs shadow-sm">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </div>
                  )}
                </div>

                <div className="text-sm font-semibold text-foreground flex items-center space-x-1.5">
                  <span>{opt.name}</span>
                  {opt.id === 'system' && (
                    <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20">
                      DEFAULT
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted mt-1 leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Compact Navbar Theme Toggle Dropdown for Fast Switching
 */
export function ThemeNavbarToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const ActiveIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-surface-elevated hover:border-accent/40 transition-colors focus:outline-none"
        title={`Theme: ${theme} (Active: ${resolvedTheme})`}
        aria-label="Toggle visual theme"
      >
        <ActiveIcon className="h-4 w-4 text-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] font-mono uppercase text-muted tracking-wider border-b border-border mb-1">
            Visual Theme
          </div>
          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left',
                  isSelected
                    ? 'bg-accent/10 text-accent font-semibold'
                    : 'text-foreground hover:bg-surface-elevated'
                )}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
