import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    env: {
      // Load from .env.local via dotenv in setup
    },
    setupFiles: ['./vitest.setup.ts'],
    // Sequential file execution — required to stay under 50 RPM Haiku rate limit.
    // 113 live API tests run sequentially (~4 min). Without this, burst concurrency
    // causes 429 errors and false failures. Use `npx vitest run --no-file-parallelism`.
    fileParallelism: false,
  },
})
