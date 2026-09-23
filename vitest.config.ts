import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src'),
      // Tests run under plain Node; `electron` and `@electron-toolkit/utils` are replaced by
      // small stand-ins so main-process modules can be exercised without a window.
      electron: resolve('src/main/__tests__/mocks/electron.ts'),
      '@electron-toolkit/utils': resolve('src/main/__tests__/mocks/electron-toolkit-utils.ts')
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 15_000,
    fileParallelism: false
  }
})
