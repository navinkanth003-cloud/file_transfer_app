import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Whether to polyfill `global` variable
      global: true,
      // Whether to polyfill `process` variable
      process: true,
      // Whether to polyfill `Buffer` variable
      buffer: true,
      // Whether to polyfill `util` variable
      util: true,
      // Whether to polyfill `stream` variable
      stream: true,
      // Whether to polyfill `events` variable
      events: true,
      // Whether to polyfill `string_decoder` variable
      string_decoder: true,
      // Whether to polyfill `punycode` variable
      punycode: true,
    }),
  ],
  optimizeDeps: {
    include: ['simple-peer', 'readable-stream', 'stream-browserify'],
  },
})
