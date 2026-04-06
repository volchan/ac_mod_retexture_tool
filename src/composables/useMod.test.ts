import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import type { Mod } from '../types/index'
import { useMod } from './useMod'

vi.mock('@/lib/tauri', () => ({
  scanModFolder: vi.fn(),
}))

import { scanModFolder } from '@/lib/tauri'

const mockMod: Mod = {
  type: 'car',
  path: '/mods/ferrari_488',
  meta: {
    name: 'Ferrari 488',
    folderName: 'ferrari_488',
    author: 'Test',
    version: '1.0',
    description: '',
  },
  files: [],
  kn5Files: ['ferrari_488.kn5'],
  skinFolders: [],
}

function withSetup<T>(composable: () => T): [T, () => void] {
  let result!: T
  const app = mount(
    defineComponent({
      setup() {
        result = composable()
        return {}
      },
      template: '<div/>',
    }),
  )
  return [result, () => app.unmount()]
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  const [{ closeMod }, unmount] = withSetup(() => useMod())
  closeMod()
  unmount()
})

describe('useMod', () => {
  it('starts with null mod and no error', () => {
    const [{ mod, isLoading, error }, unmount] = withSetup(() => useMod())
    expect(mod.value).toBeNull()
    expect(isLoading.value).toBe(false)
    expect(error.value).toBeNull()
    unmount()
  })

  it('loads a mod successfully', async () => {
    vi.mocked(scanModFolder).mockResolvedValueOnce(mockMod)
    const [{ mod, isLoading, error, loadMod }, unmount] = withSetup(() => useMod())

    const promise = loadMod('/mods/ferrari_488')
    expect(isLoading.value).toBe(true)

    await promise
    expect(isLoading.value).toBe(false)
    expect(mod.value).toEqual(mockMod)
    expect(error.value).toBeNull()
    unmount()
  })

  it('sets error when scan fails with Error', async () => {
    vi.mocked(scanModFolder).mockRejectedValueOnce(new Error('scan failed'))
    const [{ mod, error, loadMod }, unmount] = withSetup(() => useMod())

    await loadMod('/bad/path')
    expect(mod.value).toBeNull()
    expect(error.value).toBe('scan failed')
    unmount()
  })

  it('sets error when scan fails with non-Error', async () => {
    vi.mocked(scanModFolder).mockRejectedValueOnce('unknown error')
    const [{ error, loadMod }, unmount] = withSetup(() => useMod())

    await loadMod('/bad/path')
    expect(error.value).toBe('unknown error')
    unmount()
  })

  it('closeMod clears mod and error', async () => {
    vi.mocked(scanModFolder).mockResolvedValueOnce(mockMod)
    const [{ mod, error, loadMod, closeMod }, unmount] = withSetup(() => useMod())

    await loadMod('/mods/ferrari_488')
    expect(mod.value).not.toBeNull()

    closeMod()
    await nextTick()
    expect(mod.value).toBeNull()
    expect(error.value).toBeNull()
    unmount()
  })

  it('clears previous error on new loadMod call', async () => {
    vi.mocked(scanModFolder).mockRejectedValueOnce(new Error('first error'))
    const [{ error, loadMod }, unmount] = withSetup(() => useMod())

    await loadMod('/bad/path')
    expect(error.value).toBe('first error')

    vi.mocked(scanModFolder).mockResolvedValueOnce(mockMod)
    await loadMod('/mods/ferrari_488')
    expect(error.value).toBeNull()
    unmount()
  })
})
