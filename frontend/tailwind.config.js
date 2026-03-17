export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'sans-serif'] },
      colors: {
        navy: { 900: '#0f1b2d', 800: '#162032', 700: '#1e2d42' },
        cyan: { 500: '#06b6d4', 600: '#0891b2' }
      }
    }
  },
  plugins: []
};
