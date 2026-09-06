import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// The dev server proxies /api to this app's own backend process, so the dev
// and production origins behave identically.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@ui': fileURLToPath(new URL('../../packages/ui/src', import.meta.url)) },
  },
  server: {
    port: 5320,
    host: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4320', changeOrigin: true } },
  },
  build: {
    target: 'es2022',
    cssTarget: 'chrome110',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
