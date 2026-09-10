import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        primary: {
          50: 'rgb(var(--c-primary-50) / <alpha-value>)',
          100: 'rgb(var(--c-primary-100) / <alpha-value>)',
          200: 'rgb(var(--c-primary-200) / <alpha-value>)',
          300: 'rgb(var(--c-primary-300) / <alpha-value>)',
          400: 'rgb(var(--c-primary-400) / <alpha-value>)',
          500: 'rgb(var(--c-primary-500) / <alpha-value>)',
          600: 'rgb(var(--c-primary-600) / <alpha-value>)',
          700: 'rgb(var(--c-primary-700) / <alpha-value>)',
          800: 'rgb(var(--c-primary-800) / <alpha-value>)',
          900: 'rgb(var(--c-primary-900) / <alpha-value>)',
          DEFAULT: 'rgb(var(--c-primary-600) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--c-accent-600) / <alpha-value>)',
          soft: 'rgb(var(--c-accent-50) / <alpha-value>)',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: 'rgb(248 250 252)',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 16px -2px rgb(15 23 42 / 0.06)',
        'card-hover':
          '0 2px 4px 0 rgb(15 23 42 / 0.05), 0 12px 28px -6px rgb(15 23 42 / 0.12)',
        sidebar: '1px 0 0 0 rgb(226 232 240)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(12px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-top': { from: { opacity: '0', transform: 'translateY(-100%) scale(.95)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.55' } },
      },
      animation: {
        'fade-in': 'fade-in .25s ease-out both',
        'scale-in': 'scale-in .18s ease-out both',
        'slide-in-right': 'slide-in-right .2s ease-out both',
        'slide-in-top': 'slide-in-top .3s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      typography: {
        DEFAULT: { css: { maxWidth: 'none' } },
      },
    },
  },
  plugins: [],
} satisfies Config
