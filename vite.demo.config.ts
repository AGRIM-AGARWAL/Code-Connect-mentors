// Demo build: no backend, sample data in the browser. `npm run build:demo` → dist-demo/
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  build: { outDir: 'dist-demo', rollupOptions: { output: { inlineDynamicImports: true } } },
})
