import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        rc: {
          bg: {
            primary: 'var(--rc-bg-primary)',
            surface: 'var(--rc-bg-surface)',
            elevated: 'var(--rc-bg-elevated)',
            hover: 'var(--rc-bg-hover)',
          },
          border: {
            default: 'var(--rc-border-default)',
            subtle: 'var(--rc-border-subtle)',
          },
          text: {
            primary: 'var(--rc-text-primary)',
            secondary: 'var(--rc-text-secondary)',
            dim: 'var(--rc-text-dim)',
          },
          accent: 'var(--rc-accent)',
          bf: {
            lean: 'var(--rc-bf-lean)',
            mid: 'var(--rc-bf-mid)',
            high: 'var(--rc-bf-high)',
          },
          delta: {
            positive: 'var(--rc-delta-positive)',
            negative: 'var(--rc-delta-negative)',
            neutral: 'var(--rc-delta-neutral)',
          },
        },
      },
      fontFamily: {
        mono: ['Space Mono', 'SF Mono', 'Fira Code', 'monospace'],
        body: ['DM Sans', 'SF Pro', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        'rc-xs': '10px',
        'rc-sm': '12px',
        'rc-base': '14px',
        'rc-lg': '18px',
        'rc-xl': '28px',
        'rc-hero': '48px',
      },
      borderRadius: {
        panel: '12px',
      },
      boxShadow: {
        panel: '0 8px 32px rgba(0, 0, 0, 0.5)',
        glow: '0 0 20px rgba(62, 207, 180, 0.2)',
      },
    },
  },
  plugins: [],
};

export default config;
