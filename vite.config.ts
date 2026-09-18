import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
      '@client': fileURLToPath(new URL('./src/client', import.meta.url))
    }
  },
  server: {
    port: 3000,
    open: false,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      },
      '/api': {
        target: 'http://localhost:3001'
      }
    }
  }
});
