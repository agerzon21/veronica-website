import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
  },
})
