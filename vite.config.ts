import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server must be reachable from a phone on the same Wi-Fi so Nimiq Pay
// can load the mini app from http://<mac-ip>:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
