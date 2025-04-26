/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        comet: {
          50: '#f5f8ff',
          100: '#e4edff',
          200: '#d9fbff', // Lightest comet color
          300: '#c2d8ff',
          400: '#a5b4ff',
          500: '#8a8dff',
          600: '#8362ff',
          700: '#7531fd', // Darkest comet color
          800: '#5f22d9',
          900: '#4b1bb0',
        },
        dark: {
          50: '#f6f8fd',
          100: '#eef0f7',
          200: '#e0e2ea',
          300: '#c5c7d4',
          400: '#9fa1b2',
          500: '#71738a',
          600: '#4c4f68',
          700: '#363952',
          800: '#22253a', // Primary dark background
          900: '#121320', // Darkest shade
          950: '#0a0a15',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 15px rgba(117, 49, 253, 0.15)',
        'glow-strong': '0 0 20px rgba(117, 49, 253, 0.3)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'comet-gradient': 'linear-gradient(to right, #d9fbff, #7531fd)',
      },
    },
  },
  plugins: [],
} 