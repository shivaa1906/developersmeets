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
        background: '#050505',
        surface: {
          DEFAULT: '#0D0D0D',
          elevated: '#141414',
          highlight: '#1C1C1C',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        foreground: '#FFFFFF',
        muted: {
          DEFAULT: '#A1A1AA',
          foreground: '#71717A',
        },
        border: 'rgba(255, 255, 255, 0.08)',
        accent: {
          DEFAULT: '#00F0FF',
          foreground: '#050505',
          glow: 'rgba(0, 240, 255, 0.25)',
          muted: 'rgba(0, 240, 255, 0.1)',
        },
        electric: {
          cyan: '#00F0FF',
          blue: '#3B82F6',
          purple: '#8B5CF6',
        },
        status: {
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        'accent-glow': '0 0 25px -5px rgba(0, 240, 255, 0.3)',
        'surface-card': '0 4px 20px -2px rgba(0, 0, 0, 0.7)',
        'subtle-border': 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
