/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      keyframes: {
        'glow-orange': {
          '0%, 100%': { boxShadow: '0 0 3px 0px rgba(249, 115, 22, 0.4)' },
          '50%': { boxShadow: '0 0 10px 4px rgba(249, 115, 22, 0.9)' },
        },
        'glow-blue': {
          '0%, 100%': { boxShadow: '0 0 3px 0px rgba(99, 179, 237, 0.4)' },
          '50%': { boxShadow: '0 0 10px 4px rgba(99, 179, 237, 0.95)' },
        },
      },
      animation: {
        'glow-orange': 'glow-orange 2s ease-in-out infinite',
        'glow-blue': 'glow-blue 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
