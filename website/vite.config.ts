import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),
    tailwindcss(),
  ],
  build: {
    target: 'esnext', // Needed for final build
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext', // ✅ This fixes the pre-bundling error
    },
  },
})
