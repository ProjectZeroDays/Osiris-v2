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
    include: ['src/**/*.test.ts'],
    // Live-network integration tests are opt-in via RUN_LIVE_TESTS=1
    testTimeout: 30000,
  },
});
