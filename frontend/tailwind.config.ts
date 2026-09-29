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
        background: 'rgb(var(--background) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          elevated: 'rgb(var(--surface-elevated) / <alpha-value>)',
          highlight: 'rgb(var(--surface-highlight) / <alpha-value>)',
          border: 'rgb(var(--border) / <alpha-value>)',
        },
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
          glow: 'rgba(var(--accent-glow), 0.25)',
          muted: 'rgba(var(--accent-glow), 0.1)',
        },
        electric: {
          cyan: 'rgb(var(--electric-cyan) / <alpha-value>)',
          blue: 'rgb(var(--electric-blue) / <alpha-value>)',
          purple: 'rgb(var(--electric-purple) / <alpha-value>)',
        },
        klydex: {
          emerald: '#2C8C68',
          forest: '#0B332B',
          mint: '#E4F1E9',
          lightBg: '#F6F6F4',
          darkBg: '#0A0E0C',
          darkCard: '#121815',
          darkBorder: '#1F2924',
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
        'accent-glow': '0 0 25px -5px rgba(var(--accent-glow), 0.25)',
        'surface-card': 'var(--card-shadow)',
        'subtle-border': 'inset 0 0 0 1px rgb(var(--border))',
        'klydex-emerald': '0 0 35px -5px rgba(44, 140, 104, 0.35)',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
      },
      animation: {
        marquee: 'marquee 35s linear infinite',
        'pulse-slow': 'pulse-slow 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
