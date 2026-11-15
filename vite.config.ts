import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

function parseBackendOrigin(value: string | undefined) {
  if (value === undefined || value.length === 0) {
    throw new Error('DEV_MENU_BACKEND_ORIGIN is required when starting the development server.');
  }

  const backendOrigin = URL.parse(value);
  if (
    backendOrigin === null ||
    (backendOrigin.protocol !== 'http:' && backendOrigin.protocol !== 'https:') ||
    backendOrigin.username.length > 0 ||
    backendOrigin.password.length > 0 ||
    backendOrigin.pathname !== '/' ||
    backendOrigin.search.length > 0 ||
    backendOrigin.hash.length > 0
  ) {
    throw new Error(
      'DEV_MENU_BACKEND_ORIGIN must be an HTTP(S) origin without credentials, path, query, or fragment.',
    );
  }

  return backendOrigin.origin;
}

export default defineConfig(({ command, mode }) => {
  const isDevelopmentServer = command === 'serve' && mode !== 'test';
  const backendOrigin = isDevelopmentServer
    ? parseBackendOrigin(loadEnv(mode, process.cwd(), 'DEV_MENU_').DEV_MENU_BACKEND_ORIGIN)
    : undefined;

  return {
    plugins: [react()],
    publicDir: false,
    build: {
      sourcemap: false,
    },
    ...(backendOrigin === undefined
      ? {}
      : {
          server: {
            proxy: {
              '/api': {
                target: backendOrigin,
                changeOrigin: false,
              },
            },
          },
        }),
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/shared/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'tests/harness/**/*.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary', 'html'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          'src/generated/**',
          'src/app/main.tsx',
          'src/vite-env.d.ts',
        ],
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
          'src/features/practice-proposal/model/**': {
            statements: 90,
            branches: 90,
            functions: 90,
            lines: 90,
          },
          'src/features/practice-proposal/api/**': {
            statements: 90,
            branches: 90,
            functions: 90,
            lines: 90,
          },
          'src/features/practice-proposal/hooks/**': {
            statements: 90,
            branches: 80,
            functions: 90,
            lines: 90,
          },
          'src/features/shared-history/model/**': {
            statements: 90,
            branches: 90,
            functions: 90,
            lines: 90,
          },
          'src/features/shared-history/api/**': {
            statements: 90,
            branches: 90,
            functions: 90,
            lines: 90,
          },
          'src/features/shared-history/hooks/**': {
            statements: 90,
            branches: 80,
            functions: 90,
            lines: 90,
          },
        },
      },
    },
  };
});
