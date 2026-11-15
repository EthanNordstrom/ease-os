/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colours come from CSS variables so the light and dark themes share every class.
        ink: { 950: 'rgb(var(--ink-950) / <alpha-value>)', 900: 'rgb(var(--ink-900) / <alpha-value>)', 850: 'rgb(var(--ink-850) / <alpha-value>)', 800: 'rgb(var(--ink-800) / <alpha-value>)', 700: 'rgb(var(--ink-700) / <alpha-value>)', 600: 'rgb(var(--ink-600) / <alpha-value>)', 500: 'rgb(var(--ink-500) / <alpha-value>)' },
        fg: { DEFAULT: 'rgb(var(--fg) / <alpha-value>)', 2: 'rgb(var(--fg-2) / <alpha-value>)', 3: 'rgb(var(--fg-3) / <alpha-value>)' },
        acid: { DEFAULT: 'rgb(var(--acid) / <alpha-value>)', dim: 'rgb(var(--acid-dim) / <alpha-value>)', ink: 'rgb(var(--acid-ink) / <alpha-value>)' },
        warn: 'rgb(var(--warn) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter Tight Variable"', 'Inter Tight', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { DEFAULT: '6px', lg: '10px', xl: '14px' },
    },
  },
  plugins: [],
};
