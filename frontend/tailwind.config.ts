import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './styles/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#FFFFFF',
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#F8FAFC',
          highlight: '#F1F5F9',
          border: '#E2E8F0',
        },
        foreground: '#0F172A',
        muted: {
          DEFAULT: '#64748B',
          foreground: '#94A3B8',
        },
        border: '#E2E8F0',
        accent: {
          DEFAULT: '#0284C7',
          foreground: '#FFFFFF',
          glow: 'rgba(2, 132, 199, 0.2)',
          muted: 'rgba(2, 132, 199, 0.1)',
        },
        electric: {
          cyan: '#0284C7',
          blue: '#2563EB',
          purple: '#7C3AED',
        },
        status: {
          success: '#059669',
          warning: '#D97706',
          danger: '#DC2626',
          info: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'accent-glow': '0 0 25px -5px rgba(2, 132, 199, 0.25)',
        'surface-card': '0 4px 20px -2px rgba(15, 23, 42, 0.06)',
        'subtle-border': 'inset 0 0 0 1px #E2E8F0',
      },
    },
  },
  plugins: [],
};

export default config;
