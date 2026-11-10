/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#070d1f', 900: '#0b1530', 800: '#111f45', 700: '#1a2d5e' },
        brand: { DEFAULT: '#0070e0', dark: '#003087', soft: '#e6f1fd' },
        ink: { DEFAULT: '#0f172a', muted: '#52607a' },
        surface: { DEFAULT: '#f5f7fb', card: '#ffffff', line: '#e3e8f1' },
        ok: '#0f9d6b', warn: '#d98a0b', danger: '#d9364a',
      },
      borderRadius: { card: '14px' },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.05), 0 4px 14px rgba(15,23,42,.04)' },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
