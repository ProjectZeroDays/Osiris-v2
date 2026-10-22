import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside a React Server Component graph. The
      // integration modules import it as a guard, so the tests alias it to a
      // no-op rather than each test file stubbing it.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Live-network integration tests are opt-in via RUN_LIVE_TESTS=1
    testTimeout: 30000,
    // A hook that loads a route and its dependency graph can take longer
    // than a test may reasonably take, and the default ten seconds is not
    // enough when a hundred and fifty files are transforming in parallel.
    // The hook that timed out was not slow on its own: it was slow
    // because the machine was busy, and it failed the whole file.
    hookTimeout: 60000,
  },
});
