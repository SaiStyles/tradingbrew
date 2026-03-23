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
  },
})
