import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec,prop}.{ts,tsx}'],
    environmentMatchGlobs: [['__tests__/unit/components/**', 'jsdom']]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  }
})
