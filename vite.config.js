import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@react-google-maps/api'],
    esbuildOptions: {
      target: 'esnext'
    }
  },
  ssr: {
    noExternal: ['@react-google-maps/api']
  }
})
