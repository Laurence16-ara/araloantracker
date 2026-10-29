/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Fraunces"', 'Georgia', 'serif'],
      },
      colors: {
        paper: '#F6F3EC',
        card: '#FFFDF8',
        ink: { DEFAULT: '#1D1B16', soft: '#57524A', faint: '#8F887C' },
        line: '#E5DFD2',
        moss: { DEFAULT: '#1F5C46', dark: '#16422F', light: '#E3EFE8' },
        amber: { DEFAULT: '#B7791F', light: '#FBF0DC' },
        rust: { DEFAULT: '#B23B2E', light: '#F8E3DF' },
      },
      boxShadow: { card: '0 1px 0 rgba(29,27,22,0.04), 0 1px 3px rgba(29,27,22,0.06)' },
    },
  },
  plugins: [],
}
