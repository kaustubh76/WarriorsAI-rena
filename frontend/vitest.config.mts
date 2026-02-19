import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/lib/api/__tests__/setup.ts'],
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/api/**/*.ts', 'src/lib/hashing/**/*.ts'],
      exclude: ['src/lib/api/__tests__/**', 'src/lib/api/index.ts', 'src/lib/hashing/__tests__/**'],
    },
  },
});
