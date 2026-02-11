import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: [
      'src/__tests__/components/**/*.{test,spec}.{ts,tsx}',
      'src/__tests__/i18n/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules',
      'dist',
      'e2e',
      // Skip integration tests that require full app context
      'src/__tests__/plugin-ui-loading.integration.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'src/__tests__/setup.ts',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Map @/components/ui to @wordrhyme/ui components
      '@/components/ui': path.resolve(__dirname, '../../packages/ui/src/components/ui'),
      '@wordrhyme/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
});
