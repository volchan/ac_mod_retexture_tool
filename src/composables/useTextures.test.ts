import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { listen } from '@tauri-apps/api/event'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import type { Mod, Texture } from '@/types/index'
import { useTextures } from './useTextures'

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

const baseMod: Mod = {
  modType: 'car',
  path: '/mods/ferrari',
  meta: { name: 'Ferrari', folderName: 'ferrari', author: '', version: '', description: '' },
  files: [],
  kn5Files: ['car.kn5'],
  skinFolders: [],
}

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/ferrari/car.kn5',
    source: 'kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

type EventHandler = (e: { payload: unknown }) => void
let capturedHandlers: Map<string, EventHandler>

beforeEach(() => {
  clearInvokeHandlers()
  capturedHandlers = new Map()
  vi.mocked(listen).mockImplementation(async (eventName, handler) => {
    capturedHandlers.set(eventName, handler as EventHandler)
    return () => {}
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function emitDecodeTexture(texture: Texture) {
  capturedHandlers.get('decode-texture')?.({ payload: texture })
}

describe('useTextures', () => {
  it('init loads textures progressively via events', async () => {
    const textureList = [makeTexture({ id: 'tex1' }), makeTexture({ id: 'tex2' })]
    mockInvokeHandler('decode_mod_textures', () => {
      for (const t of textureList) emitDecodeTexture(t)
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)
    await nextTick()

    expect(result.textures.value).toHaveLength(2)
    expect(result.isDecoding.value).toBe(false)
    unmount()
  })

  it('init registers decode-texture and decode-progress listeners', async () => {
    mockInvokeHandler('decode_mod_textures', () => undefined)

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    expect(listen).toHaveBeenCalledWith('decode-texture', expect.any(Function))
    expect(listen).toHaveBeenCalledWith('decode-progress', expect.any(Function))
    unmount()
  })

  it('toggleSelect adds id to selected', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'tex1' }))
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    expect(result.selected.value.has('tex1')).toBe(false)
    result.toggleSelect('tex1')
    expect(result.selected.value.has('tex1')).toBe(true)
    unmount()
  })

  it('toggleSelect removes id when already selected', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'tex1' }))
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    result.toggleSelect('tex1')
    expect(result.selected.value.has('tex1')).toBe(true)
    result.toggleSelect('tex1')
    expect(result.selected.value.has('tex1')).toBe(false)
    unmount()
  })

  it('selectAll selects all texture ids', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      for (const id of ['a', 'b', 'c']) emitDecodeTexture(makeTexture({ id }))
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    result.selectAll()
    expect(result.selected.value.size).toBe(3)
    expect(result.selected.value.has('a')).toBe(true)
    expect(result.selected.value.has('b')).toBe(true)
    expect(result.selected.value.has('c')).toBe(true)
    unmount()
  })

  it('deselectAll clears selection', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      for (const id of ['a', 'b']) emitDecodeTexture(makeTexture({ id }))
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    result.selectAll()
    expect(result.selected.value.size).toBe(2)
    result.deselectAll()
    expect(result.selected.value.size).toBe(0)
    unmount()
  })

  it('filteredTextures returns all when category is all', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'body' }))
      emitDecodeTexture(makeTexture({ id: 'b', category: 'interior' }))
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    expect(result.filteredTextures('all')).toHaveLength(2)
    unmount()
  })

  it('filteredTextures filters by category', async () => {
    mockInvokeHandler('decode_mod_textures', () => {
      emitDecodeTexture(makeTexture({ id: 'a', category: 'body' }))
      emitDecodeTexture(makeTexture({ id: 'b', category: 'interior' }))
      emitDecodeTexture(makeTexture({ id: 'c', category: 'body' }))
      return undefined
    })

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)

    const bodyTextures = result.filteredTextures('body')
    expect(bodyTextures).toHaveLength(2)
    expect(bodyTextures.every((t) => t.category === 'body')).toBe(true)
    unmount()
  })

  it('cleanup calls unlisten', async () => {
    const unlistenFn = vi.fn()
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      capturedHandlers.set(eventName, handler as EventHandler)
      return unlistenFn
    })
    mockInvokeHandler('decode_mod_textures', () => undefined)

    const { result, unmount } = await withSetup(() => useTextures())
    await result.init(baseMod)
    result.cleanup()

    expect(unlistenFn).toHaveBeenCalled()
    unmount()
  })
})
