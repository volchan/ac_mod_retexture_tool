import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, 'src') },
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
    ],
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
