/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      /* =======================================================================
         COLORS - Brand & Semantic
         ======================================================================= */
      colors: {
        // Primary - Blue (Brand Core from Logo)
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
          950: 'var(--color-primary-950)',
          DEFAULT: 'var(--color-primary)',
        },
        // Accent - Cyan (Secondary Brand from Logo)
        accent: {
          50: 'var(--color-accent-50)',
          100: 'var(--color-accent-100)',
          200: 'var(--color-accent-200)',
          300: 'var(--color-accent-300)',
          400: 'var(--color-accent-400)',
          500: 'var(--color-accent-500)',
          600: 'var(--color-accent-600)',
          700: 'var(--color-accent-700)',
          800: 'var(--color-accent-800)',
          900: 'var(--color-accent-900)',
          950: 'var(--color-accent-950)',
          DEFAULT: 'var(--color-accent)',
        },
        // Gold - Premium Accent
        gold: {
          50: 'var(--color-gold-50)',
          100: 'var(--color-gold-100)',
          200: 'var(--color-gold-200)',
          300: 'var(--color-gold-300)',
          400: 'var(--color-gold-400)',
          500: 'var(--color-gold-500)',
          600: 'var(--color-gold-600)',
          700: 'var(--color-gold-700)',
          800: 'var(--color-gold-800)',
          900: 'var(--color-gold-900)',
          950: 'var(--color-gold-950)',
          DEFAULT: 'var(--color-gold)',
          light: 'var(--color-gold-light)',
        },
        // Semantic Mappings
        background: 'var(--color-background)',
        'background-alt': 'var(--color-background-alt)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)',
          elevated: 'var(--color-surface-elevated)',
        },
        // Text Colors
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-tertiary': 'var(--color-text-tertiary)',
        'text-disabled': 'var(--color-text-disabled)',
        'text-inverse': 'var(--color-text-inverse)',
        'text-link': 'var(--color-text-link)',
        // Border Colors
        border: {
          DEFAULT: 'var(--color-border)',
          hover: 'var(--color-border-hover)',
          focus: 'var(--color-border-focus)',
          error: 'var(--color-border-error)',
        },
        // Status Colors
        success: {
          50: 'var(--color-success-50)',
          100: 'var(--color-success-100)',
          500: 'var(--color-success-500)',
          600: 'var(--color-success-600)',
          700: 'var(--color-success-700)',
          DEFAULT: 'var(--color-success)',
        },
        warning: {
          50: 'var(--color-warning-50)',
          100: 'var(--color-warning-100)',
          500: 'var(--color-warning-500)',
          600: 'var(--color-warning-600)',
          700: 'var(--color-warning-700)',
          DEFAULT: 'var(--color-warning)',
        },
        error: {
          50: 'var(--color-error-50)',
          100: 'var(--color-error-100)',
          500: 'var(--color-error-500)',
          600: 'var(--color-error-600)',
          700: 'var(--color-error-700)',
          DEFAULT: 'var(--color-error)',
        },
        info: {
          50: 'var(--color-info-50)',
          100: 'var(--color-info-100)',
          500: 'var(--color-info-500)',
          600: 'var(--color-info-600)',
          700: 'var(--color-info-700)',
          DEFAULT: 'var(--color-info)',
        },
        // Glass
        glass: {
          DEFAULT: 'var(--glass-background)',
          light: 'var(--glass-background-light)',
          dark: 'var(--glass-background-dark)',
          border: 'var(--glass-border)',
        },
      },

      /* =======================================================================
         TYPOGRAPHY
         ======================================================================= */
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        serif: ['Playfair Display', 'ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        '9xl': ['8rem', { lineHeight: '1' }],
      },

      /* =======================================================================
         SPACING
         ======================================================================= */
      spacing: {
        '4.5': '1.125rem',
        '5.5': '1.375rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '17': '4.25rem',
        '18': '4.5rem',
        '19': '4.75rem',
        '21': '5.25rem',
        '22': '5.5rem',
        '25': '6.25rem',
        '26': '6.5rem',
        '30': '7.5rem',
        '34': '8.5rem',
        '38': '9.5rem',
        '42': '10.5rem',
        '50': '12.5rem',
        '54': '13.5rem',
        '58': '14.5rem',
        '62': '15.5rem',
        '66': '16.5rem',
        '68': '17rem',
        '70': '17.5rem',
        '74': '18.5rem',
        '76': '19rem',
        '78': '19.5rem',
        '82': '20.5rem',
        '84': '21rem',
        '86': '21.5rem',
        '88': '22rem',
        '90': '22.5rem',
        '92': '23rem',
        '94': '23.5rem',
        '100': '25rem',
        '104': '26rem',
        '108': '27rem',
        '112': '28rem',
        '116': '29rem',
        '120': '30rem',
        '128': '32rem',
        '144': '36rem',
      },

      /* =======================================================================
         BORDER RADIUS
         ======================================================================= */
      borderRadius: {
        'xs': 'var(--radius-xs)',
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'DEFAULT': 'var(--radius-DEFAULT)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        'full': 'var(--radius-full)',
        'button': 'var(--radius-button)',
        'input': 'var(--radius-input)',
        'card': 'var(--radius-card)',
        'modal': 'var(--radius-modal)',
        'badge': 'var(--radius-badge)',
      },

      /* =======================================================================
         BOX SHADOW
         ======================================================================= */
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'sm': 'var(--shadow-sm)',
        'DEFAULT': 'var(--shadow-DEFAULT)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
        'inner': 'var(--shadow-inner)',
        'none': 'var(--shadow-none)',
        'primary': 'var(--shadow-primary)',
        'primary-lg': 'var(--shadow-primary-lg)',
        'accent': 'var(--shadow-accent)',
        'gold': 'var(--shadow-gold)',
        'error': 'var(--shadow-error)',
        'card': 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },

      /* =======================================================================
         TRANSITIONS
         ======================================================================= */
      transitionDuration: {
        '75': '75ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '500': '500ms',
        '700': '700ms',
        '1000': '1000ms',
      },
      transitionTimingFunction: {
        'ease-out': 'var(--ease-out)',
        'ease-in': 'var(--ease-in)',
        'ease-in-out': 'var(--ease-in-out)',
        'bounce': 'var(--ease-bounce)',
        'spring': 'var(--ease-spring)',
      },

      /* =======================================================================
         Z-INDEX
         ======================================================================= */
      zIndex: {
        'dropdown': 'var(--z-dropdown)',
        'sticky': 'var(--z-sticky)',
        'fixed': 'var(--z-fixed)',
        'modal-backdrop': 'var(--z-modal-backdrop)',
        'modal': 'var(--z-modal)',
        'popover': 'var(--z-popover)',
        'tooltip': 'var(--z-tooltip)',
        'toast': 'var(--z-toast)',
      },

      /* =======================================================================
         LAYOUT
         ======================================================================= */
      width: {
        'sidebar': 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-width-collapsed)',
      },
      maxWidth: {
        'content': 'var(--content-max-width)',
        'container-sm': 'var(--container-sm)',
        'container-md': 'var(--container-md)',
        'container-lg': 'var(--container-lg)',
        'container-xl': 'var(--container-xl)',
        'container-2xl': 'var(--container-2xl)',
      },
      height: {
        'header': 'var(--header-height)',
        'footer': 'var(--footer-height)',
        'mobile-nav': 'var(--mobile-nav-height)',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },

      /* =======================================================================
         ANIMATIONS
         ======================================================================= */
      animation: {
        'fade-in': 'fadeIn 300ms ease-out',
        'fade-in-up': 'fadeInUp 300ms ease-out',
        'fade-in-down': 'fadeInDown 300ms ease-out',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'slide-in-right': 'slideInRight 300ms ease-out',
        'slide-in-left': 'slideInLeft 300ms ease-out',
        'slide-in-bottom': 'slideInBottom 300ms ease-out',
        'bounce-in': 'bounceIn 500ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInBottom: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--color-primary-400)' },
          '50%': { boxShadow: '0 0 20px 4px var(--color-primary-400)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },

      /* =======================================================================
         BACKDROP BLUR
         ======================================================================= */
      backdropBlur: {
        'glass': 'var(--glass-blur)',
        'glass-heavy': 'var(--glass-blur-heavy)',
      },

      /* =======================================================================
         ASPECT RATIO
         ======================================================================= */
      aspectRatio: {
        '2/3': '2 / 3',
        '3/2': '3 / 2',
        '3/4': '3 / 4',
        '4/3': '4 / 3',
        '5/4': '5 / 4',
        '4/5': '4 / 5',
        '9/16': '9 / 16',
        '21/9': '21 / 9',
      },
    },
  },
  plugins: [
    // Custom plugin for additional utilities
    function({ addUtilities, addComponents }) {
      // Touch target utility
      addUtilities({
        '.touch-target': {
          'min-height': '44px',
          'min-width': '44px',
        },
      });

      // Focus ring utility
      addUtilities({
        '.focus-ring': {
          '&:focus-visible': {
            outline: '2px solid var(--ring-color)',
            'outline-offset': '2px',
          },
        },
      });

      // Glass effect utilities
      addUtilities({
        '.glass': {
          background: 'var(--glass-background)',
          'backdrop-filter': 'blur(var(--glass-blur))',
          '-webkit-backdrop-filter': 'blur(var(--glass-blur))',
          border: '1px solid var(--glass-border)',
        },
        '.glass-dark': {
          background: 'var(--glass-background-dark)',
          'backdrop-filter': 'blur(var(--glass-blur))',
          '-webkit-backdrop-filter': 'blur(var(--glass-blur))',
          border: '1px solid var(--glass-border-light)',
        },
      });

      // Scrollbar utilities
      addUtilities({
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
          'scrollbar-color': 'var(--color-neutral-300) transparent',
          '&::-webkit-scrollbar': {
            width: '6px',
            height: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            'background-color': 'var(--color-neutral-300)',
            'border-radius': '9999px',
          },
        },
        '.scrollbar-hide': {
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
      });

      // Text gradient utility
      addUtilities({
        '.text-gradient': {
          background: 'linear-gradient(135deg, var(--color-accent-500), var(--color-primary-600))',
          '-webkit-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
          'background-clip': 'text',
        },
        '.text-gradient-gold': {
          background: 'linear-gradient(135deg, var(--color-gold-500), var(--color-gold-300))',
          '-webkit-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
          'background-clip': 'text',
        },
      });
    },
  ],
};
