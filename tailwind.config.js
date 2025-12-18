/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0f172a',      // slate-900 - основной фон
          surface: '#1e293b',  // slate-800 - поверхности
          card: '#334155',     // slate-700 - карточки
          border: '#475569',   // slate-600 - границы
          text: {
            primary: '#f1f5f9',   // slate-100 - основной текст
            secondary: '#cbd5e1', // slate-300 - вторичный текст
            muted: '#94a3b8',     // slate-400 - приглушенный текст
          },
        },
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
}

