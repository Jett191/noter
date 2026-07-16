import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    // Playwright specs (.spec.ts under tests/e2e) are intentionally excluded;
    // they are run via `npx playwright test`, not Vitest.
    exclude: ['node_modules', '.next', 'tests/e2e/**']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  }
})
