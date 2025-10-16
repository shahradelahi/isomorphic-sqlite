import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    // env: { ISOMORPHIC_SQLITE_DRIVER: 'better-sqlite3' },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
