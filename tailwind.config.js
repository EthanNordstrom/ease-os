/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0A0A0B', 900: '#111113', 850: '#161618', 800: '#1C1C1F', 700: '#26262A', 600: '#34343A', 500: '#4A4A52' },
        fg: { DEFAULT: '#EDEDE8', 2: '#B4B4AC', 3: '#8C8C86' },
        acid: { DEFAULT: '#B9DB6E', dim: '#8FAA55', ink: '#14180B' },
        warn: '#E0A86A',
        bad: '#E07A6A',
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
