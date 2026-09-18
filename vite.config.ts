import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@server': resolve(__dirname, 'src/server'),
      '@client': resolve(__dirname, 'src/client')
    }
  },
  server: {
    port: 3000,
    open: false
  }
});
