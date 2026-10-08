import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Local synthetic Catalog stub only. Production must use a real Gateway.
    proxy: { '/api': { target: process.env.P00_STUB_TARGET ?? 'http://127.0.0.1:18082', changeOrigin: true } },
  },
});
