/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#1D9E75',
        amber: '#BA7517',
        danger: '#E24B4A',
        info: '#185FA5',
      },
    },
  },
  plugins: [],
};
