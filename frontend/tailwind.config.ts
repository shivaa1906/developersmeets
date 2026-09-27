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
      },
    },
  },
  plugins: [],
};

export default config;
