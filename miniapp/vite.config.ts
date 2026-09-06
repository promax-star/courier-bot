import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages: репозиторий courier-bot → база /courier-bot/, сборка в ../docs
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/courier-bot/',
  build: { outDir: '../docs', emptyOutDir: true },
})
