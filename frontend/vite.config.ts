import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = process.env.P02_GATEWAY_TARGET ?? env.P02_GATEWAY_TARGET ?? process.env.P00_STUB_TARGET ?? 'http://127.0.0.1:58080';
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // The application uses the real integration Gateway. P00 fixtures are opt-in.
      proxy: { '/api': { target, changeOrigin: true } },
    },
  };
});
