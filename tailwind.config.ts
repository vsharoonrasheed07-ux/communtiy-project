import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F0EDE2',
        sidebar: '#17423B',
        'sidebar-hover': '#1E544B',
        primary: '#1F6F61',
        'primary-hover': '#185A4E',
        ink: '#1A2421',
        muted: '#5A6864',
        border: '#E0DDD2',
        risk: {
          'high-bg': '#F3CDC2',
          'high-text': '#8F3A2A',
          'medium-bg': '#F3DFAE',
          'medium-text': '#7A4F00',
          'low-bg': '#CFE6DC',
          'low-text': '#1F5A4C',
          'info-bg': '#CBDDF0',
          'info-text': '#234E78',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};

export default config;
