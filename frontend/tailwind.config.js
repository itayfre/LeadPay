/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        ink: {
          50:  '#F8FAFB',
          100: '#F1F3F5',
          200: '#E2E6EB',
          300: '#B9C0C9',
          400: '#8C95A1',
          500: '#6B7480',
          700: '#3D4852',
          900: '#11161A',
          950: '#0B0F0E',
        },
        accent: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
        },
        danger: {
          50:  '#FEF2F2',
          500: '#EF4444',
          600: '#DC2626',
        },
        warn: {
          50:  '#FFFBEB',
          500: '#F59E0B',
          600: '#D97706',
        },
      },
    },
  },
  plugins: [],
}
