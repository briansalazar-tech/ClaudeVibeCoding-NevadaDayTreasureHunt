/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// .env lives at the repo root so client and server share one file.
const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const port = Number(env.CLIENT_PORT) || 5173;
  const host = env.CLIENT_HOST || undefined;
  // The client calls /api on its own origin and Vite forwards it to the API server, so a phone
  // on the same Wi-Fi reaches the API through the dev server too. VITE_API_URL overrides this.
  // The Host header passes through unchanged: the API refuses changes whose Origin doesn't match
  // the host the browser sent them to.
  const proxy = {
    '/api': { target: `http://localhost:${Number(env.PORT) || 3001}`, changeOrigin: false },
  };
  return {
    envDir,
    plugins: [react()],
    server: { port, host, proxy },
    preview: { port, host, proxy },
    // MapLibre alone is about 1 MB minified, and the password checker's dictionaries (a chunk of
    // their own, loaded only on the screens that set a password) about 1.7 MB.
    build: { chunkSizeWarningLimit: 1800 },
    test: {
      name: 'client',
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
