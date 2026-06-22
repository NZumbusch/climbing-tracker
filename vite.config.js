import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  base: '/climbing-tracker/',
  optimizeDeps: {
    include: ['html2pdf.js', 'svelte-dnd-action']
  }
})
