/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#000066',
          green: '#07A04E',
          mint: '#D6FADC',
          lime: '#7EB751',
          forest: '#273C2C',
          blue: '#002C5F',
          cyan: '#AEECEF',
          yellow: '#F8F32B',
        },
      },
      fontFamily: {
        brand: ['Raleway', 'Inter', 'sans-serif'],
        editorial: ['Libre Baskerville', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
