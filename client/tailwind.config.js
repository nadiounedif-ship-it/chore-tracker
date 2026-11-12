/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f28b50',
          600: '#d97745',
          700: '#b85d35',
          800: '#944b30',
          900: '#713d2c',
        },
        boss: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#e69164',
          600: '#ce7550',
          700: '#a95d43',
        },
        slate: {
          50: '#fffaf4', 100: '#f8f0e7', 200: '#eee2d3', 300: '#ddcbbb', 400: '#b3a18f',
          500: '#8b7a68', 600: '#6d5e50', 700: '#51463d', 800: '#39322d', 900: '#28231f',
        },
        worker: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        }
      }
    },
  },
  plugins: [],
}
