/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '3xl': '1.5rem',
        '2xl': '1.25rem',
        xl: '1rem',
        lg: '0.75rem',
        md: '0.5rem',
      },
      boxShadow: {
        'soft': '0 10px 30px -12px rgba(2, 6, 23, 0.25)',
        'soft-xl': '0 20px 60px -15px rgba(2, 6, 23, 0.35)',
        'glow': '0 4px 12px rgba(99, 102, 241, 0.2)',
        'glow-lg': '0 8px 20px rgba(99, 102, 241, 0.25)',
        'glow-cyan': '0 4px 12px rgba(6, 182, 212, 0.2)',
        'glow-emerald': '0 4px 12px rgba(16, 185, 129, 0.2)',
        'inner-glow': 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-down': {
          '0%': { opacity: 0, transform: 'translateY(-12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'shimmer-slow': {
          '0%': { backgroundPosition: '-100% 0' },
          '100%': { backgroundPosition: '100% 0' },
        },
        pulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.85 },
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
          '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
        },
        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-up': 'fade-up 600ms ease-out both',
        'fade-down': 'fade-down 600ms ease-out both',
        'fade-in': 'fade-in 400ms ease-out',
        'slide-in': 'slide-in 400ms ease-out',
        'slide-up': 'slide-up 400ms ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'shimmer-slow': 'shimmer-slow 3s linear infinite',
        'pulse': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-soft': 'pulse-soft 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce': 'bounce 1s infinite',
        'bounce-slow': 'bounce-slow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'scale-in': 'scale-in 300ms ease-out',
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.3))',
        'glass-gradient-dark': 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
        'accent-gradient': 'linear-gradient(135deg, #6366f1, #06b6d4)',
        'accent-gradient-dark': 'linear-gradient(135deg, #4f46e5, #0891b2)',
        'accent-gradient-vibrant': 'linear-gradient(135deg, #8b5cf6, #ec4899, #f59e0b)',
        'mesh-gradient': 'radial-gradient(at 40% 20%, rgba(99, 102, 241, 0.3) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(6, 182, 212, 0.3) 0px, transparent 50%), radial-gradient(at 80% 100%, rgba(139, 92, 246, 0.3) 0px, transparent 50%), radial-gradient(at 0% 100%, rgba(236, 72, 153, 0.3) 0px, transparent 50%)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
