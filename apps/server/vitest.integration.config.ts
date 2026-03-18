import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    root: './',
    include: [
      'src/**/*.integration.test.ts',
      'src/**/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
