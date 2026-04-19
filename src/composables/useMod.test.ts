import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import type { Mod } from '../types/index'
import { useMod } from './useMod'

vi.mock('@/lib/tauri', () => ({
  scanModFolder: vi.fn(),
  clearKn5Cache: vi.fn().mockResolvedValue(undefined),
}))

import { scanModFolder } from '@/lib/tauri'

const mockMod: Mod = {
  modType: 'track',
  path: '/mods/spa',
  meta: {
    name: 'Spa',
    folderName: 'spa',
    author: 'Test',
    version: '1.0',
    description: '',
  },
  trackMeta: { country: 'Belgium', length: 7004, pitboxes: 30 },
  files: [],
  kn5Files: ['track.kn5'],
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
  it('starts with null mod and not loading', () => {
    const [{ mod, isLoading }, unmount] = withSetup(() => useMod())
    expect(mod.value).toBeNull()
    expect(isLoading.value).toBe(false)
    unmount()
  })

  it('loads a mod successfully and returns null', async () => {
    vi.mocked(scanModFolder).mockResolvedValueOnce(mockMod)
    const [{ mod, isLoading, loadMod }, unmount] = withSetup(() => useMod())

    const promise = loadMod('/mods/spa')
    expect(isLoading.value).toBe(true)

    const result = await promise
    expect(isLoading.value).toBe(false)
    expect(mod.value).toEqual(mockMod)
    expect(result).toBeNull()
    unmount()
  })

  it('returns error object when scan fails with Error', async () => {
    vi.mocked(scanModFolder).mockRejectedValueOnce(new Error('scan failed'))
    const [{ mod, loadMod }, unmount] = withSetup(() => useMod())

    const result = await loadMod('/bad/path')
    expect(mod.value).toBeNull()
    expect(result).toEqual({ error: 'scan failed' })
    unmount()
  })

  it('returns error object when scan fails with non-Error', async () => {
    vi.mocked(scanModFolder).mockRejectedValueOnce('unknown error')
    const [{ loadMod }, unmount] = withSetup(() => useMod())

    const result = await loadMod('/bad/path')
    expect(result).toEqual({ error: 'unknown error' })
    unmount()
  })

  it('closeMod clears mod', async () => {
    vi.mocked(scanModFolder).mockResolvedValueOnce(mockMod)
    const [{ mod, loadMod, closeMod }, unmount] = withSetup(() => useMod())

    await loadMod('/mods/spa')
    expect(mod.value).not.toBeNull()

    closeMod()
    expect(mod.value).toBeNull()
    unmount()
  })
})
