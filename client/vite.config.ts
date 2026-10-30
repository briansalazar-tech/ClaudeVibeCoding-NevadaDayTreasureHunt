/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// .env lives at the repo root so client and server share one file.
const envDir = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const port = Number(env.CLIENT_PORT) || 5173;
  return {
    envDir,
    plugins: [react()],
    server: { port, host: env.CLIENT_HOST || undefined },
    preview: { port, host: env.CLIENT_HOST || undefined },
    // MapLibre alone is about 1 MB minified.
    build: { chunkSizeWarningLimit: 1600 },
    test: {
      name: 'client',
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
