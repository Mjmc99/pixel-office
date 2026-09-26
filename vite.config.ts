import { defineConfig } from 'vite'

// base './' so the build works from any sub-path (GitHub Pages, a Pi, a USB stick)
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  server: { port: 5173 },
})
