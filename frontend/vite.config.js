import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://dmi-zb0l.onrender.com',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
