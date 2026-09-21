/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.vue',
    './src/components/**/*.vue',
    './src/App.vue',
    './index.html'
  ],
  corePlugins: {
    // Disable preflight to avoid breaking uni-app native component styles
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        // ── Primary Brand: Sustainability Green ──
        'sustainable': {
          50:  '#e6f4ec',
          100: '#c3e4cf',
          200: '#9dd4b0',
          300: '#74c48f',
          400: '#52b974',
          500: '#2ecc71',  // Accent green
          600: '#1B7A3D',  // PRIMARY brand green
          700: '#11562c',
          800: '#0b4323',
          900: '#053119',
        },
        // ── Secondary Brand: Retained Blue (bridge to existing UI) ──
        'brand-blue': {
          50:  '#e6f2ff',
          100: '#baddff',
          200: '#8dc6ff',
          300: '#5eafff',
          400: '#2f98ff',
          500: '#1890ff',  // Existing primary blue
          600: '#1476d9',
          700: '#0B3D6B',  // Deep navy accent
          800: '#0a3060',
          900: '#072248',
        },
        // ── Cyan accent (bridge gradient) ──
        'cyan-accent': {
          300: '#36cfc9',
          400: '#3DD6C8',
          500: '#2ec4b6',
        },
        // ── Semantic ──
        'danger': '#ff4d4f',
        'success': '#52c41a',
        'warning': '#f5a623',
        // ── Backgrounds ──
        'bg-light':  '#F4FCF5',
        'bg-dark':   '#0E1B16',
        'card-light': '#FFFFFF',
        'card-dark':  '#16213E',
        // ── Text ──
        'text-emphasis':   '#1A1A2E',
        'text-secondary':  '#5F6B65',
        'text-tertiary':   '#999999',
      },
      fontFamily: {
        'sans': [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI',
          'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
          'Helvetica Neue', 'Arial', 'sans-serif'
        ],
      },
      boxShadow: {
        'card':       '0 4px 24px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 8px 32px rgba(26, 90, 58, 0.12)',
        'glass':      '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.12)',
      },
      borderRadius: {
        'card': '24px',
        'xl':   '16px',
      },
      animation: {
        'fade-in':     'fadeIn 0.4s ease-out',
        'slide-up':    'slideUp 0.5s ease-out',
        'hero-pulse':  'heroPulse 6s ease-in-out infinite',
        'float':       'float 3s ease-in-out infinite',
        'check-pulse': 'checkPulse 0.4s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24rpx)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        heroPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        checkPulse: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.15)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
      },
    },
  },
  plugins: [],
}