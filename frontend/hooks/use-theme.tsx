'use client';

import * as React from 'react';

export type ThemeMode = 'system' | 'bright' | 'dark';
export type ResolvedTheme = 'bright' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'nexus_theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // By default, for non-logged-in landing page viewers, theme is 'system'
  const [theme, setThemeState] = React.useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('bright');
  const [mounted, setMounted] = React.useState(false);

  // Initialize from localStorage or default to 'system'
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
      if (stored === 'system' || stored === 'bright' || stored === 'dark') {
        setThemeState(stored);
      } else {
        setThemeState('system');
      }
    } catch {
      setThemeState('system');
    }
    setMounted(true);
  }, []);

  // Sync class on <html> and resolvedTheme state
  React.useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    const getSystemTheme = (): ResolvedTheme => {
      if (typeof window === 'undefined') return 'bright';
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'bright';
    };

    const applyTheme = (currentTheme: ThemeMode) => {
      const active: ResolvedTheme =
        currentTheme === 'system' ? getSystemTheme() : currentTheme;

      setResolvedTheme(active);

      if (active === 'dark') {
        root.classList.add('dark');
        root.classList.remove('light');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.add('light');
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    applyTheme(theme);

    // If 'system', attach listener for live OS theme switching
    if (theme === 'system' && typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemChange = (e: MediaQueryListEvent) => {
        const active: ResolvedTheme = e.matches ? 'dark' : 'bright';
        setResolvedTheme(active);
        if (active === 'dark') {
          root.classList.add('dark');
          root.classList.remove('light');
          root.style.colorScheme = 'dark';
        } else {
          root.classList.add('light');
          root.classList.remove('dark');
          root.style.colorScheme = 'light';
        }
      };

      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }
  }, [theme, mounted]);

  const setTheme = React.useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
