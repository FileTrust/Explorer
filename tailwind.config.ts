import type { Config } from 'tailwindcss';

const themeColor = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: themeColor('--bg-base'),
          surface: themeColor('--bg-surface'),
          elevated: themeColor('--bg-elevated'),
          border: themeColor('--bg-border'),
          hover: themeColor('--bg-hover'),
        },
        ft: {
          blue: '#3b82f6',
          'blue-dim': '#1d4ed8',
          purple: '#8b5cf6',
          green: '#10b981',
          amber: '#f59e0b',
          red: '#ef4444',
          cyan: '#06b6d4',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
