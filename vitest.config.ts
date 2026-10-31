import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'shared', include: ['shared/src/**/*.test.ts'] } },
      { test: { name: 'data-pipeline', include: ['data-pipeline/{src,test}/**/*.test.ts'] } },
      { test: { name: 'server', include: ['server/test/**/*.test.ts'], environment: 'node' } },
      'client/vite.config.ts',
    ],
  },
});
