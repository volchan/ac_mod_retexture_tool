import { clearInvokeHandlers, mockInvokeHandler } from '@tauri-apps/api'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import type { Texture } from '@/types/index'
import { useTextureDetail } from './useTextureDetail'

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

async function flushAll() {
  await vi.runAllTimersAsync()
  await flushPromises()
}

function makeTexture(overrides: Partial<Texture> = {}): Texture {
  return {
    id: 'tex1',
    name: 'body.dds',
    path: '/mods/car.kn5',
    source: 'kn5',
    kn5File: '/mods/car.kn5',
    category: 'body',
    width: 1024,
    height: 1024,
    format: 'BC3',
    previewUrl: 'data:image/png;base64,abc',
    isDecoded: true,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  clearInvokeHandlers()
  useTextureDetail().close()
})

afterEach(() => {
  useTextureDetail().close()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useTextureDetail', () => {
  it('open sets activeTexture', async () => {
    const tex = makeTexture({ id: 'tex1' })
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await nextTick()

    expect(result.activeTexture.value?.id).toBe('tex1')
    result.close()
    unmount()
  })

  it('open with replacement still loads original and sets activeTab to original', async () => {
    let resolveLoad!: (v: string) => void
    const pending = new Promise<string>((r) => {
      resolveLoad = r
    })
    mockInvokeHandler('get_kn5_texture', () => pending)
    const tex = makeTexture({
      id: 'tex1',
      replacement: {
        sourcePath: '/import/body.png',
        previewUrl: 'data:image/png;base64,rep',
        width: 1024,
        height: 1024,
      },
    })
    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await nextTick()

    expect(result.activeTab.value).toBe('original')
    expect(result.isLoadingOriginal.value).toBe(true)
    await vi.runAllTimersAsync()
    resolveLoad('data:image/png;base64,full')
    await flushPromises()
    result.close()
    unmount()
  })

  it('open without replacement sets activeTab to original and starts loading', async () => {
    const tex = makeTexture({ id: 'tex1' })
    let resolveLoad!: (v: string) => void
    const pending = new Promise<string>((r) => {
      resolveLoad = r
    })
    mockInvokeHandler('get_kn5_texture', () => pending)

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await nextTick()

    expect(result.activeTab.value).toBe('original')
    expect(result.isLoadingOriginal.value).toBe(true)

    resolveLoad('data:image/png;base64,full')
    await flushAll()
    result.close()
    unmount()
  })

  it('loadOriginal resolves and sets originalDataUrl', async () => {
    const tex = makeTexture({ id: 'tex1' })
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await flushAll()

    expect(result.originalDataUrl.value).toBe('data:image/png;base64,full')
    expect(result.isLoadingOriginal.value).toBe(false)
    result.close()
    unmount()
  })

  it('loadOriginal failure sets loadError', async () => {
    const tex = makeTexture({ id: 'tex1' })
    mockInvokeHandler('get_kn5_texture', () => {
      throw new Error('DDS decode failed')
    })

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await flushAll()

    expect(result.loadError.value).toContain('DDS decode failed')
    expect(result.isLoadingOriginal.value).toBe(false)
    result.close()
    unmount()
  })

  it('close sets activeTexture to null', async () => {
    const tex = makeTexture({ id: 'tex1' })
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,full')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await nextTick()
    result.close()
    await nextTick()

    expect(result.activeTexture.value).toBeNull()
    unmount()
  })

  it('navigate next moves to next texture', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' }), makeTexture({ id: 'c' })]
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,x')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('a', list)
    await nextTick()
    result.navigate('next')
    await nextTick()

    expect(result.activeTexture.value?.id).toBe('b')
    result.close()
    unmount()
  })

  it('navigate prev moves to previous texture', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' }), makeTexture({ id: 'c' })]
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,x')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('b', list)
    await nextTick()
    result.navigate('prev')
    await nextTick()

    expect(result.activeTexture.value?.id).toBe('a')
    result.close()
    unmount()
  })

  it('hasPrev is false at first item', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,x')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('a', list)
    await nextTick()

    expect(result.hasPrev.value).toBe(false)
    expect(result.hasNext.value).toBe(true)
    result.close()
    unmount()
  })

  it('hasNext is false at last item', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    mockInvokeHandler('get_kn5_texture', () => 'data:image/png;base64,x')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('b', list)
    await nextTick()

    expect(result.hasNext.value).toBe(false)
    expect(result.hasPrev.value).toBe(true)
    result.close()
    unmount()
  })

  it('stale load result is discarded after close', async () => {
    const tex = makeTexture({ id: 'tex1' })
    let resolveLoad!: (v: string) => void
    const pending = new Promise<string>((r) => {
      resolveLoad = r
    })
    mockInvokeHandler('get_kn5_texture', () => pending)

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await nextTick()
    result.close()
    await nextTick()

    resolveLoad('data:image/png;base64,stale')
    await flushAll()

    expect(result.originalDataUrl.value).toBeNull()
    unmount()
  })

  it('setTab original re-fetches after load error', async () => {
    let callCount = 0
    const tex = makeTexture({ id: 'tex1' })
    mockInvokeHandler('get_kn5_texture', () => {
      callCount++
      if (callCount === 1) throw new Error('first fail')
      return 'data:image/png;base64,full'
    })

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await flushAll()

    expect(result.loadError.value).toContain('first fail')

    result.setTab('original')
    await flushAll()

    expect(callCount).toBe(2)
    expect(result.originalDataUrl.value).toBe('data:image/png;base64,full')
    result.close()
    unmount()
  })

  it('setTab does not re-fetch if originalDataUrl already set', async () => {
    const invokeCount = ref(0)
    const tex = makeTexture({ id: 'tex1' })
    mockInvokeHandler('get_kn5_texture', () => {
      invokeCount.value++
      return 'data:image/png;base64,full'
    })

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await flushAll()

    expect(invokeCount.value).toBe(1)
    result.setTab('original')
    await nextTick()

    expect(invokeCount.value).toBe(1)
    result.close()
    unmount()
  })

  it('stale error result is discarded when navigated away during load', async () => {
    const list = [makeTexture({ id: 'a' }), makeTexture({ id: 'b' })]
    let rejectA!: (e: Error) => void
    let callCount = 0
    mockInvokeHandler('get_kn5_texture', () => {
      callCount++
      if (callCount === 1)
        return new Promise<string>((_, r) => {
          rejectA = r
        })
      return new Promise<string>(() => {})
    })

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('a', list)
    await vi.runAllTimersAsync()
    result.navigate('next')
    await vi.runAllTimersAsync()

    rejectA(new Error('stale error'))
    await flushPromises()

    expect(result.loadError.value).toBeNull()
    expect(result.activeTexture.value?.id).toBe('b')
    result.close()
    unmount()
  })

  it('loadOriginal sets loadError from non-Error thrown value', async () => {
    const tex = makeTexture({ id: 'tex1' })
    const nonError = { toString: () => 'raw string error' }
    mockInvokeHandler('get_kn5_texture', () => {
      throw nonError
    })

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await flushAll()

    expect(result.loadError.value).toBe('raw string error')
    result.close()
    unmount()
  })

  it('skin-source texture invokes get_skin_texture', async () => {
    const tex = makeTexture({
      id: 'tex1',
      source: 'skin',
      path: '/mods/skins/0_default/body.dds',
      kn5File: undefined,
    })
    mockInvokeHandler('get_skin_texture', () => 'data:image/png;base64,SKIN')

    const { result, unmount } = await withSetup(() => useTextureDetail())
    result.open('tex1', [tex])
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(result.loadError.value).toBeNull()
    expect(result.originalDataUrl.value).toBe('data:image/png;base64,SKIN')
    result.close()
    unmount()
  })
})
