import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from https://<user>.github.io/geo-trivia/ on GitHub Pages.
export default defineConfig({
  base: '/geo-trivia/',
  plugins: [react()],
  build: {
    // Keep flag SVGs as separate files so only the flags shown get downloaded.
    assetsInlineLimit: (file) => (file.includes('flag-icons') ? false : undefined),
  },
})
