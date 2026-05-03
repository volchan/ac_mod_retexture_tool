import { clearMockStore, mockStore } from '@tauri-apps/plugin-store'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import type { Mod } from '@/types/index'
import { useLibrary } from './useLibrary'

async function withSetup<T>(composable: () => T): Promise<{ result: T; unmount: () => void }> {
  let result!: T
  const App = defineComponent({
    setup() {
      result = composable()
      return {}
    },
    template: '<div/>',
  })
  const wrapper = mount(App)
  await nextTick()
  return { result, unmount: () => wrapper.unmount() }
}

function makeMod(overrides: Partial<Mod> = {}): Mod {
  return {
    modType: 'car',
    path: '/mods/ferrari',
    meta: {
      name: 'Ferrari',
      folderName: 'ferrari',
      author: 'Test',
      version: '1.0',
      description: '',
    },
    files: [],
    kn5Files: [],
    skinFolders: [],
    ...overrides,
  }
}

beforeEach(() => {
  clearMockStore()
  const { recentMods } = useLibrary()
  recentMods.value = []
})

describe('useLibrary', () => {
  it('init with empty store results in empty recentMods', async () => {
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.init()
    expect(result.recentMods.value).toEqual([])
    unmount()
  })

  it('init loads recentMods from store', async () => {
    const stored = [
      {
        id: 'ferrari',
        modType: 'car' as const,
        name: 'Ferrari',
        folderName: 'ferrari',
        path: '/mods/ferrari',
        lastOpenedAt: 1000,
      },
    ]
    mockStore.get.mockResolvedValueOnce(stored)

    const { result, unmount } = await withSetup(() => useLibrary())
    await result.init()
    expect(result.recentMods.value).toHaveLength(1)
    expect(result.recentMods.value[0].id).toBe('ferrari')
    unmount()
  })

  it('addRecent adds a mod to recentMods', async () => {
    const mod = makeMod()
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    expect(result.recentMods.value).toHaveLength(1)
    expect(result.recentMods.value[0].id).toBe('ferrari')
    unmount()
  })

  it('addRecent saves to store', async () => {
    const mod = makeMod()
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    expect(mockStore.set).toHaveBeenCalledWith('recent-mods', expect.any(Array))
    expect(mockStore.save).toHaveBeenCalled()
    unmount()
  })

  it('addRecent deduplicates by id and moves existing entry to front', async () => {
    const mod1 = makeMod({
      meta: { name: 'Ferrari', folderName: 'ferrari', author: '', version: '', description: '' },
    })
    const mod2 = makeMod({
      meta: { name: 'Lambo', folderName: 'lambo', author: '', version: '', description: '' },
      path: '/mods/lambo',
    })

    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod1)
    await result.addRecent(mod2)
    expect(result.recentMods.value[0].id).toBe('lambo')
    expect(result.recentMods.value[1].id).toBe('ferrari')

    await result.addRecent(mod1)
    expect(result.recentMods.value[0].id).toBe('ferrari')
    expect(result.recentMods.value[1].id).toBe('lambo')
    expect(result.recentMods.value).toHaveLength(2)
    unmount()
  })

  it('addRecent caps at 10 entries', async () => {
    const { result, unmount } = await withSetup(() => useLibrary())
    for (let i = 0; i < 12; i++) {
      const mod = makeMod({
        path: `/mods/mod${i}`,
        meta: { name: `Mod${i}`, folderName: `mod${i}`, author: '', version: '', description: '' },
      })
      await result.addRecent(mod)
    }
    expect(result.recentMods.value).toHaveLength(10)
    unmount()
  })

  it('updateTextureCount updates an existing entry', async () => {
    const mod = makeMod()
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)

    await result.updateTextureCount('ferrari', 42)
    expect(result.recentMods.value[0].textureCount).toBe(42)
    unmount()
  })

  it('updateTextureCount is a no-op if entry not found', async () => {
    const { result, unmount } = await withSetup(() => useLibrary())
    mockStore.save.mockClear()
    await result.updateTextureCount('nonexistent', 10)
    expect(mockStore.save).not.toHaveBeenCalled()
    unmount()
  })

  it('updateTextureCount is a no-op if count unchanged', async () => {
    const mod = makeMod()
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    await result.updateTextureCount('ferrari', 5)
    mockStore.save.mockClear()

    await result.updateTextureCount('ferrari', 5)
    expect(mockStore.save).not.toHaveBeenCalled()
    unmount()
  })

  it('removeRecent removes the entry', async () => {
    const mod = makeMod()
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    expect(result.recentMods.value).toHaveLength(1)

    await result.removeRecent('ferrari')
    expect(result.recentMods.value).toHaveLength(0)
    unmount()
  })

  it('removeRecent saves to store', async () => {
    const mod = makeMod()
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    mockStore.save.mockClear()

    await result.removeRecent('ferrari')
    expect(mockStore.save).toHaveBeenCalled()
    unmount()
  })

  it('addRecent populates optional fields from mod metadata', async () => {
    const mod = makeMod({
      carMeta: { brand: 'Ferrari', carClass: 'GT', bhp: 650, weight: 1400 },
      meta: {
        name: 'Ferrari',
        folderName: 'ferrari',
        author: 'Driver',
        version: '1.0',
        description: '',
      },
    })
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    const entry = result.recentMods.value[0]
    expect(entry.carBrand).toBe('Ferrari')
    expect(entry.carBhp).toBe(650)
    expect(entry.author).toBe('Driver')
    unmount()
  })

  it('addRecent populates track meta fields', async () => {
    const mod = makeMod({
      modType: 'track',
      trackMeta: { country: 'Italy', length: 5793, pitboxes: 30 },
    })
    const { result, unmount } = await withSetup(() => useLibrary())
    await result.addRecent(mod)
    const entry = result.recentMods.value[0]
    expect(entry.country).toBe('Italy')
    expect(entry.trackLength).toBe(5793)
    expect(entry.pitboxes).toBe(30)
    unmount()
  })
})
