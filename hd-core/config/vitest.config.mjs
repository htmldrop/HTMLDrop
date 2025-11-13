import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: resolve(__dirname, '..'),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'database/migrations/',
        'database/seeds/',
        'admin/',
        '**/**.spec.mjs',
        '**/**.test.mjs'
      ]
    },
    include: ['./**/*.{test,spec}.mjs'],
    exclude: ['**/node_modules/**', '**/admin/**'],
    setupFiles: ['./tests/setup.mjs']
  }
})
