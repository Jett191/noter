import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 20_000
  },
  resolve: {
    alias: {
      '@noter/agent-runtime': path.resolve(__dirname, 'src')
    }
  }
})
