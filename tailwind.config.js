/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        'app-bg': 'rgb(var(--color-app-bg) / <alpha-value>)',
        'surface': 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        'surface-elevated-hover': 'rgb(var(--color-surface-elevated-hover) / <alpha-value>)',
        'border': 'rgb(var(--color-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--color-border-strong) / <alpha-value>)',
        'content': 'rgb(var(--color-content) / <alpha-value>)',
        'content-muted': 'rgb(var(--color-content-muted) / <alpha-value>)',
        'content-subtle': 'rgb(var(--color-content-subtle) / <alpha-value>)',
        'primary': 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-primary-hover) / <alpha-value>)',
        'success': 'rgb(var(--color-success) / <alpha-value>)',
        'success-hover': 'rgb(var(--color-success-hover) / <alpha-value>)',
        'danger': 'rgb(var(--color-danger) / <alpha-value>)',
        'warning': 'rgb(var(--color-warning) / <alpha-value>)',
        'warning-hover': 'rgb(var(--color-warning-hover) / <alpha-value>)',
        'tertiary': 'rgb(var(--color-tertiary) / <alpha-value>)',
        'tertiary-hover': 'rgb(var(--color-tertiary-hover) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}
