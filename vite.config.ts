/// <reference types="vite/client" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].[hash].js`,
        chunkFileNames: `assets/[name].[hash].js`,
        assetFileNames: `assets/[name].[hash].[ext]`
      }
    }
  },
  optimizeDeps: {
    include: [
      '@chakra-ui/react',
      '@emotion/react',
      '@emotion/styled',
      'framer-motion',
      'react-router-dom'
    ]
  },
  server: {
    port: 3000,
    // Dev-only. `npm run dev` serves the SPA but has no /api — those are
    // Vercel functions. `vercel dev` DOES run them, but cannot serve this app:
    // vercel.json's catch-all rewrite (/((?!assets/).*) -> /index.html)
    // swallows /src/main.tsx, so the module arrives as HTML and React never
    // mounts. Running both and proxying is what makes admin and portal
    // screens — which are entirely API-driven — testable locally at all:
    //
    //   npx vercel dev --listen 3999      (functions)
    //   npm run dev                        (this, on 3000)
    //
    // Without vercel dev running, /api requests simply fail and the static
    // pages behave exactly as before.
    proxy: {
      '/api': { target: 'http://localhost:3999', changeOrigin: true },
    },
  },
  base: '/',
})
