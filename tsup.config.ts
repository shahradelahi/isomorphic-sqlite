import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  removeNodeProtocol: false,
  external: ['bun:sqlite', 'node:sqlite', 'sqlite3'],
  target: 'esnext',
  outDir: 'dist',
});
