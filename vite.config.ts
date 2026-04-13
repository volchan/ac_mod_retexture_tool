import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const isTesting = !!process.env.VITEST

const testAliases = isTesting
  ? [
      {
        find: /^@tauri-apps\/api(\/.*)?$/,
        replacement: resolve(__dirname, 'src/__mocks__/tauri-api.ts'),
      },
      {
        find: '@tauri-apps/plugin-dialog',
        replacement: resolve(__dirname, 'src/__mocks__/tauri-dialog.ts'),
      },
      {
        find: '@tauri-apps/plugin-store',
        replacement: resolve(__dirname, 'src/__mocks__/tauri-store.ts'),
      },
      {
        find: '@tauri-apps/plugin-opener',
        replacement: resolve(__dirname, 'src/__mocks__/tauri-opener.ts'),
      },
    ]
  : []

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION') return
        warn(warning)
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
  },
  resolve: {
    alias: [{ find: '@', replacement: resolve(__dirname, 'src') }, ...testAliases],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,vue}'],
    coverage: {
      provider: 'v8',
      include: ['src/composables/**', 'src/lib/**', 'src/components/**'],
      exclude: ['src/components/ui/**', 'src/__mocks__/**', 'src/types/**', 'src/main.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
