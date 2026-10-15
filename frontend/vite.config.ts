import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The application uses the real integration Gateway. P00 fixtures are opt-in.
    proxy: { '/api': { target: process.env.P02_GATEWAY_TARGET ?? process.env.P00_STUB_TARGET ?? 'http://127.0.0.1:58080', changeOrigin: true } },
  },
});
